const WORKER_URL = "https://ashokai.ashoktak95.workers.dev";
const ELEVENLABS_API_KEY  = "9ae03f31ba32632f3ec355d383a04365f0a4c53c508dc6d83662cb0f245220e7";
const ELEVENLABS_VOICE_ID = "ac41GshFUE6ID1ciVJUc";
const ELEVENLABS_MODEL    = "eleven_turbo_v2_5";

const GREETING = "Hi! I'm Ashok. Click the microphone and ask me anything — about my work, experience, or background. I'll answer as if we're in an interview.";

const micBtn         = document.getElementById("mic-btn");
const micLabel       = document.getElementById("mic-label");
const micIcon        = micBtn.querySelector(".mic-icon");
const stopIcon       = micBtn.querySelector(".stop-icon");
const transcriptEl   = document.getElementById("transcript");
const transcriptWrap = document.getElementById("transcript-wrap");
const interimEl      = document.getElementById("interim");
const warningEl      = document.getElementById("browser-warning");

const IDLE       = "idle";
const RECORDING  = "recording";
const PROCESSING = "processing";
const SPEAKING   = "speaking";

let appState     = IDLE;
let history      = [];
let currentAudio = null;

// ── Browser support ───────────────────────────────────────────────────────────
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) {
  warningEl.classList.remove("hidden");
  micBtn.disabled = true;
  micLabel.textContent = "Not supported in this browser";
}

// ── Speech Recognition ────────────────────────────────────────────────────────
let recognition;
if (SR) {
  recognition = new SR();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (e) => {
    let interim = "", final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    interimEl.textContent = final || interim;
  };

  recognition.onend = () => {
    const text = interimEl.textContent.trim();
    interimEl.textContent = "";
    if (appState === RECORDING && text) sendMessage(text);
    else setState(IDLE);
  };

  recognition.onerror = (e) => {
    interimEl.textContent = "";
    if (e.error !== "no-speech") appendError("Microphone error: " + e.error);
    setState(IDLE);
  };
}

// ── ElevenLabs TTS (browser-side) ────────────────────────────────────────────
async function speak(text, onDone) {
  setState(SPEAKING);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: ELEVENLABS_MODEL,
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
        }),
      }
    );

    if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);

    const blob = await res.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    currentAudio = audio;

    audio.onended = () => { URL.revokeObjectURL(audioUrl); currentAudio = null; onDone && onDone(); };
    audio.onerror = () => { URL.revokeObjectURL(audioUrl); currentAudio = null; onDone && onDone(); };
    audio.play();
  } catch (err) {
    console.warn("ElevenLabs TTS failed, falling back to Web Speech:", err);
    speakFallback(text, onDone);
  }
}

function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  speechSynthesis.cancel();
}

// Web Speech API fallback (sentence-split to avoid Chrome cutoff bug)
function speakFallback(text, onDone) {
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (!sentences.length) { onDone && onDone(); return; }
  let i = 0;
  const keepAlive = setInterval(() => {
    if (speechSynthesis.speaking) { speechSynthesis.pause(); speechSynthesis.resume(); }
  }, 10000);
  function next() {
    if (i >= sentences.length) { clearInterval(keepAlive); onDone && onDone(); return; }
    const utt = new SpeechSynthesisUtterance(sentences[i++]);
    utt.rate = 1.05;
    utt.onend = next;
    utt.onerror = (e) => {
      if (e.error !== "interrupted") next();
      else { clearInterval(keepAlive); onDone && onDone(); }
    };
    speechSynthesis.speak(utt);
  }
  next();
}

// ── State machine ─────────────────────────────────────────────────────────────
function setState(s) {
  appState = s;
  micBtn.className = "mic-btn " + s;
  micIcon.classList.toggle("hidden", s === RECORDING);
  stopIcon.classList.toggle("hidden", s !== RECORDING);
  const labels = {
    [IDLE]:       "Click to speak",
    [RECORDING]:  "Listening… click to stop",
    [PROCESSING]: "Thinking…",
    [SPEAKING]:   "Speaking… click to skip",
  };
  micLabel.textContent = labels[s];
  micBtn.disabled = s === PROCESSING;
}

// ── Transcript ────────────────────────────────────────────────────────────────
function appendTurn(role, text, opts = {}) {
  const turn = document.createElement("div");
  turn.className = "turn";
  const label = document.createElement("div");
  label.className = "turn-label";
  label.textContent = role === "user" ? "You" : "Ashok";
  const bubble = document.createElement("div");
  bubble.className = "bubble " + (role === "user" ? "bubble--user" : "bubble--ashok") +
    (opts.error ? " bubble--error" : "");
  if (opts.typing) {
    bubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  } else {
    bubble.textContent = text;
  }
  turn.appendChild(label);
  turn.appendChild(bubble);
  transcriptEl.appendChild(turn);
  transcriptWrap.scrollTop = transcriptWrap.scrollHeight;
  return bubble;
}

function appendError(msg) { appendTurn("ashok", msg, { error: true }); }

// ── Core send ─────────────────────────────────────────────────────────────────
async function sendMessage(text) {
  setState(PROCESSING);
  history.push({ role: "user", text });
  appendTurn("user", text);
  const typingBubble = appendTurn("ashok", "", { typing: true });

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-10), mode: "interview" }),
    });

    if (!res.ok || res.headers.get("Content-Type")?.includes("application/json")) {
      typingBubble.parentElement.remove();
      const data = await res.json().catch(() => ({}));
      appendError(data.error || "Something went wrong — please try again.");
      setState(IDLE);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", fullText = "";
    typingBubble.innerHTML = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const chunk = JSON.parse(raw).candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          if (chunk) {
            fullText += chunk;
            typingBubble.textContent = fullText;
            transcriptWrap.scrollTop = transcriptWrap.scrollHeight;
          }
        } catch { /* partial chunk */ }
      }
    }

    if (!fullText) {
      typingBubble.parentElement.remove();
      appendError("No response — please try again.");
      setState(IDLE);
      return;
    }

    history.push({ role: "model", text: fullText });
    speak(fullText, () => setState(IDLE));

  } catch (err) {
    typingBubble.parentElement?.remove();
    appendError("Network error — please try again.");
    setState(IDLE);
    console.error(err);
  }
}

// ── Mic button ────────────────────────────────────────────────────────────────
micBtn.addEventListener("click", () => {
  if (!SR) return;
  if (appState === SPEAKING) { stopSpeaking(); setState(IDLE); return; }
  if (appState === RECORDING) { recognition.stop(); return; }
  if (appState === IDLE) {
    try { interimEl.textContent = ""; recognition.start(); setState(RECORDING); }
    catch (e) { console.error(e); }
  }
});

// ── Opening greeting ──────────────────────────────────────────────────────────
window.addEventListener("load", () => {
  setState(IDLE);
  setTimeout(() => speak(GREETING, () => setState(IDLE)), 800);
});
