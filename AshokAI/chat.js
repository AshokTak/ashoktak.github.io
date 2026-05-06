const WORKER_URL = "https://ashokai.ashoktak95.workers.dev";

const chatEl = document.getElementById("chat");
const formEl = document.getElementById("form");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const statusEl = document.getElementById("status");

const history = [];

function addMessage(role, text, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + (role === "user" ? "msg--user" : "msg--bot");
  const bubble = document.createElement("div");
  bubble.className = "bubble" + (opts.error ? " bubble--error" : "");
  if (opts.typing) {
    bubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  } else {
    bubble.textContent = text;
  }
  wrap.appendChild(bubble);
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
  return bubble;
}

async function send(message) {
  history.push({ role: "user", text: message });
  addMessage("user", message);

  const typingBubble = addMessage("bot", "", { typing: true });
  sendBtn.disabled = true;
  statusEl.textContent = "";

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-10) }),
    });

    const remaining = res.headers.get("X-Remaining");

    // Non-streaming error (rate limit, bad request, etc.)
    if (!res.ok || res.headers.get("Content-Type")?.includes("application/json")) {
      typingBubble.parentElement.remove();
      const data = await res.json().catch(() => ({}));
      addMessage("bot", data.error || `Error ${res.status}`, { error: true });
      if (res.status === 429) sendBtn.disabled = true;
      return;
    }

    // Switch from typing dots to empty streaming bubble
    typingBubble.innerHTML = "";

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

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
            chatEl.scrollTop = chatEl.scrollHeight;
          }
        } catch {
          // partial chunk — wait for next read
        }
      }
    }

    if (fullText) {
      history.push({ role: "model", text: fullText });
    }
    if (remaining !== null) {
      statusEl.textContent = `${remaining} messages left today.`;
    }
  } catch (err) {
    typingBubble.parentElement?.remove();
    addMessage("bot", "Network error — please try again.", { error: true });
    console.error(err);
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  send(text);
});

inputEl.focus();
