const WORKER_URL          = "https://ashokai.ashoktak95.workers.dev";
const ELEVENLABS_API_KEY  = "9ae03f31ba32632f3ec355d383a04365f0a4c53c508dc6d83662cb0f245220e7";
const ELEVENLABS_VOICE_ID = "ac41GshFUE6ID1ciVJUc";
const ELEVENLABS_MODEL    = "eleven_turbo_v2_5";
const GREETING = "Hi! Thanks for showing interest in having this virtual interview. Let's start our coffee chat. Ask me anything about my work, background, or experience.";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const micBtn         = document.getElementById("mic-btn");
const micLabel       = document.getElementById("mic-label");
const micIcon        = micBtn.querySelector(".mic-icon");
const stopIcon       = micBtn.querySelector(".stop-icon");
const transcriptEl   = document.getElementById("transcript");
const transcriptWrap = document.getElementById("transcript-wrap");
const interimEl      = document.getElementById("interim");
const warningEl      = document.getElementById("browser-warning");
const waveformWrap   = document.getElementById("waveform-wrap");
const canvas         = document.getElementById("waveform");
const startOverlay   = document.getElementById("start-overlay");
const startBtn       = document.getElementById("start-btn");

// ── State ─────────────────────────────────────────────────────────────────────
const IDLE = "idle", RECORDING = "recording", PROCESSING = "processing", SPEAKING = "speaking";
let appState = IDLE;
let history  = [];

// ── Web Audio ─────────────────────────────────────────────────────────────────
let audioCtx      = null;
let analyserNode  = null;
let bufferSource  = null;
let animFrameId   = null;

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 64;
    analyserNode.smoothingTimeConstant = 0.8;
    analyserNode.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function startWaveform() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.offsetWidth  * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const w = canvas.offsetWidth, h = canvas.offsetHeight;
  const bins = analyserNode.frequencyBinCount;
  const data = new Uint8Array(bins);
  const barCount = 28;
  const gap = 3;
  const barW = (w - gap * (barCount - 1)) / barCount;

  function draw() {
    animFrameId = requestAnimationFrame(draw);
    analyserNode.getByteFrequencyData(data);
    ctx.clearRect(0, 0, w, h);

    // sample bins evenly across frequency range
    for (let i = 0; i < barCount; i++) {
      const binIndex = Math.floor((i / barCount) * (bins * 0.6)); // use lower 60% of spectrum
      const value    = data[binIndex] / 255;
      const barH     = Math.max(3, value * h * 0.9);
      const x        = i * (barW + gap);
      const y        = (h - barH) / 2;
      const alpha    = 0.4 + value * 0.6;

      ctx.fillStyle = `rgba(79, 140, 255, ${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, barW / 2);
      ctx.fill();
    }
  }
  waveformWrap.classList.add("active");
  draw();
}

function stopWaveform() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  waveformWrap.classList.remove("active");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────
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

    const arrayBuffer = await res.arrayBuffer();

    ensureAudioCtx();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    if (bufferSource) { try { bufferSource.stop(); } catch {} }

    bufferSource = audioCtx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(analyserNode);
    bufferSource.onended = () => {
      stopWaveform();
      bufferSource = null;
      onDone && onDone();
    };
    startWaveform();
    bufferSource.start(0);

  } catch (err) {
    console.warn("ElevenLabs failed, falling back:", err);
    speakFallback(text, onDone);
  }
}

function stopSpeaking() {
  if (bufferSource) { try { bufferSource.stop(); } catch {} bufferSource = null; }
  stopWaveform();
  speechSynthesis.cancel();
}

// ── Web Speech fallback ───────────────────────────────────────────────────────
function speakFallback(text, onDone) {
  speechSynthesis.cancel();
  if (!text) { onDone && onDone(); return; }

  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1.05;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(keepAlive);
    clearInterval(poll);
    onDone && onDone();
  };

  utt.onend = finish;
  utt.onerror = (e) => { if (e.error !== "interrupted") finish(); };

  // Chrome bug: speechSynthesis silently stops on long text — pause/resume every 5s
  const keepAlive = setInterval(() => {
    if (speechSynthesis.speaking) { speechSynthesis.pause(); speechSynthesis.resume(); }
  }, 5000);

  // Fallback: poll until speaking stops (in case onend never fires)
  const poll = setInterval(() => {
    if (!speechSynthesis.speaking && !speechSynthesis.pending) finish();
  }, 500);

  speechSynthesis.speak(utt);
}

// ── Speech Recognition ────────────────────────────────────────────────────────
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) {
  warningEl.classList.remove("hidden");
  micBtn.disabled = true;
  micLabel.textContent = "Not supported in this browser";
}

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
  const turn   = document.createElement("div");
  turn.className = "turn";
  const label  = document.createElement("div");
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

// ── Send message ──────────────────────────────────────────────────────────────
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

    const reader  = res.body.getReader();
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
          if (chunk) { fullText += chunk; typingBubble.textContent = fullText; transcriptWrap.scrollTop = transcriptWrap.scrollHeight; }
        } catch {}
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

// ── Start overlay ─────────────────────────────────────────────────────────────
startBtn.addEventListener("click", () => {
  startOverlay.classList.add("hidden");
  ensureAudioCtx(); // unlock AudioContext with user gesture
  speak(GREETING, () => setState(IDLE));
});

window.addEventListener("load", () => setState(IDLE));
