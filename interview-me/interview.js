const WORKER_URL = "https://ashokai.ashoktak95.workers.dev";
const GREETING = "Hi! I'm Ashok. Click the microphone and ask me anything — about my work, experience, or background. I'll answer as if we're in an interview.";

const micBtn     = document.getElementById("mic-btn");
const micLabel   = document.getElementById("mic-label");
const micIcon    = micBtn.querySelector(".mic-icon");
const stopIcon   = micBtn.querySelector(".stop-icon");
const transcriptEl = document.getElementById("transcript");
const transcriptWrap = document.getElementById("transcript-wrap");
const interimEl  = document.getElementById("interim");
const warningEl  = document.getElementById("browser-warning");

const IDLE       = "idle";
const RECORDING  = "recording";
const PROCESSING = "processing";
const SPEAKING   = "speaking";

let appState   = IDLE;
let history    = [];
let selectedVoice = null;

// ── Browser support check ────────────────────────────────────────────────────
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) {
  warningEl.classList.remove("hidden");
  micBtn.disabled = true;
  micLabel.textContent = "Not supported in this browser";
}

// ── Speech Recognition ───────────────────────────────────────────────────────
let recognition;
if (SR) {
  recognition = new SR();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (e) => {
    let interim = "";
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    interimEl.textContent = final || interim;
  };

  recognition.onend = () => {
    const text = interimEl.textContent.trim();
    interimEl.textContent = "";
    if (appState === RECORDING && text) {
      sendMessage(text);
    } else {
      setState(IDLE);
    }
  };

  recognition.onerror = (e) => {
    if (e.error === "no-speech") { setState(IDLE); return; }
    interimEl.textContent = "";
    setState(IDLE);
    appendError("Microphone error: " + e.error);
  };
}

// ── Speech Synthesis ─────────────────────────────────────────────────────────
function loadVoices() {
  const voices = speechSynthesis.getVoices();
  const preferred = ["Google US English", "Samantha", "Alex", "Karen", "Daniel", "Aaron"];
  for (const name of preferred) {
    const v = voices.find(v => v.name === name);
    if (v) { selectedVoice = v; return; }
  }
  selectedVoice = voices.find(v => v.lang.startsWith("en-US"))
    || voices.find(v => v.lang.startsWith("en"))
    || null;
}
speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

function splitSentences(text) {
  // Split on sentence boundaries, keep non-empty chunks
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function speak(text, onDone) {
  speechSynthesis.cancel();
  const sentences = splitSentences(text);
  if (!sentences.length) { onDone && onDone(); return; }

  let index = 0;

  // Chrome bug: speechSynthesis stalls after ~15s — keep it alive
  const keepAlive = setInterval(() => {
    if (speechSynthesis.speaking) {
      speechSynthesis.pause();
      speechSynthesis.resume();
    }
  }, 10000);

  function speakNext() {
    if (index >= sentences.length) {
      clearInterval(keepAlive);
      onDone && onDone();
      return;
    }
    const utt = new SpeechSynthesisUtterance(sentences[index++]);
    utt.voice = selectedVoice;
    utt.rate = 1.05;
    utt.pitch = 1.0;
    utt.onend = speakNext;
    utt.onerror = (e) => {
      if (e.error !== "interrupted") speakNext();
      else { clearInterval(keepAlive); onDone && onDone(); }
    };
    speechSynthesis.speak(utt);
  }

  setState(SPEAKING);
  speakNext();
}

function stopSpeaking() {
  speechSynthesis.cancel();
}

// ── State machine ────────────────────────────────────────────────────────────
function setState(s) {
  appState = s;
  micBtn.className = "mic-btn " + s;

  const showMic  = s === IDLE || s === SPEAKING;
  const showStop = s === RECORDING;
  micIcon.classList.toggle("hidden", !showMic);
  stopIcon.classList.toggle("hidden", !showStop);

  const labels = {
    [IDLE]:       "Click to speak",
    [RECORDING]:  "Listening… click to stop",
    [PROCESSING]: "Thinking…",
    [SPEAKING]:   "Speaking… click to skip",
  };
  micLabel.textContent = labels[s];
  micBtn.disabled = s === PROCESSING;
}

// ── Transcript helpers ───────────────────────────────────────────────────────
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

function appendError(msg) {
  appendTurn("ashok", msg, { error: true });
}

// ── Core send logic ──────────────────────────────────────────────────────────
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

    // Stream and accumulate
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
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
          const parsed = JSON.parse(raw);
          const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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

// ── Mic button click ─────────────────────────────────────────────────────────
micBtn.addEventListener("click", () => {
  if (!SR) return;

  if (appState === SPEAKING) {
    stopSpeaking();
    setState(IDLE);
    return;
  }

  if (appState === RECORDING) {
    recognition.stop();
    return;
  }

  if (appState === IDLE) {
    try {
      interimEl.textContent = "";
      recognition.start();
      setState(RECORDING);
    } catch (e) {
      console.error(e);
    }
  }
});

// ── Opening greeting ─────────────────────────────────────────────────────────
window.addEventListener("load", () => {
  // Wait for voices to load before greeting
  const tryGreet = () => {
    loadVoices();
    speak(GREETING, () => setState(IDLE));
  };
  // Voices may not be ready instantly
  if (speechSynthesis.getVoices().length > 0) {
    setTimeout(tryGreet, 600);
  } else {
    speechSynthesis.onvoiceschanged = () => {
      loadVoices();
      setTimeout(tryGreet, 400);
    };
  }
  setState(IDLE);
});
