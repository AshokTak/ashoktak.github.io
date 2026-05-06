// REPLACE THIS with the URL printed by `wrangler deploy`
// Looks like: https://ashokai.<your-subdomain>.workers.dev
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
  return wrap;
}

async function send(message) {
  history.push({ role: "user", text: message });
  addMessage("user", message);

  const typingNode = addMessage("bot", "", { typing: true });
  sendBtn.disabled = true;
  statusEl.textContent = "";

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-10) }),
    });

    typingNode.remove();
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data.error || `Error ${res.status}`;
      addMessage("bot", errMsg, { error: true });
      if (res.status === 429) sendBtn.disabled = true;
      return;
    }

    history.push({ role: "model", text: data.reply });
    addMessage("bot", data.reply);
    if (typeof data.remaining === "number") {
      statusEl.textContent = `${data.remaining} messages left today.`;
    }
  } catch (err) {
    typingNode.remove();
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
