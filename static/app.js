// ==========================================================================
// LearnMate AI — front-end application logic (no build step, vanilla JS)
// ==========================================================================

const $ = (id) => document.getElementById(id);
let currentDoc = null;

/* ---------------------------- API Configuration ---------------------------- */

function getApiBase() {
  const custom = localStorage.getItem("learnmate_api_url");
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, "");
  }
  if (window.LEARNMATE_API_BASE) {
    return window.LEARNMATE_API_BASE.replace(/\/+$/, "");
  }
  // When running on GitHub Pages without an explicit backend URL set
  if (window.location.hostname.endsWith("github.io")) {
    return null;
  }
  // When running locally via file:// protocol
  if (window.location.protocol === "file:") {
    return "http://127.0.0.1:8000";
  }
  // Same-origin server (e.g. running FastAPI directly)
  return "";
}

function apiUrl(endpoint) {
  const base = getApiBase();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
  if (base === null) {
    return null;
  }
  return base ? `${base}${cleanEndpoint}` : cleanEndpoint;
}

/* ---------------------------- Toasts ---------------------------- */

function toast(message, type = "success") {
  const stack = $("toastStack");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .2s ease";
    setTimeout(() => el.remove(), 200);
  }, 3200);
}

/* ---------------------------- Theme ---------------------------- */

function initTheme() {
  const saved = localStorage.getItem("learnmate-theme") || "light";
  applyTheme(saved);
  $("themeToggle").onclick = () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("learnmate-theme", next);
  };
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("themeToggle").textContent = theme === "dark" ? "☀️" : "🌙";
  $("themeLabel").textContent = theme === "dark" ? "Dark mode" : "Light mode";
}

/* ---------------------------- Mobile sidebar ---------------------------- */

$("menuBtn").onclick = () => $("sidebar").classList.toggle("open");

/* ---------------------------- Health / status pill ---------------------------- */

function initStatusPill() {
  const pill = $("statusPill");
  pill.onclick = () => {
    const current = localStorage.getItem("learnmate_api_url") || "";
    const input = prompt(
      "Configure LearnMate AI Backend URL\n\n" +
      "If your FastAPI backend is running (e.g. locally at http://localhost:8000 or hosted on Render/Railway), enter its URL below.\n\n" +
      "Leave empty to use default.",
      current
    );
    if (input !== null) {
      const trimmed = input.trim();
      if (trimmed) {
        localStorage.setItem("learnmate_api_url", trimmed);
        toast(`Backend URL set to ${trimmed}`, "success");
      } else {
        localStorage.removeItem("learnmate_api_url");
        toast("Reset backend URL to default", "info");
      }
      checkHealth();
      loadStats();
      loadDocuments();
    }
  };
}

async function checkHealth() {
  const pill = $("statusPill");
  const targetUrl = apiUrl("/api/health");
  if (!targetUrl) {
    pill.classList.remove("demo");
    pill.classList.add("offline");
    $("statusText").textContent = "Backend offline (Click to connect)";
    pill.title = "Backend server is not connected. Click to configure backend URL (e.g. Render, Railway, or http://localhost:8000)";
    return;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    pill.classList.remove("offline");
    if (d.ai_configured) {
      pill.classList.remove("demo");
      $("statusText").textContent = "AI tutor ready";
      pill.title = "Connected to backend with live AI. Click to change backend URL.";
    } else {
      pill.classList.add("demo");
      $("statusText").textContent = "Demo mode — no API key";
      pill.title = "Connected to backend in demo mode. Click to change backend URL.";
    }
  } catch {
    pill.classList.remove("demo");
    pill.classList.add("offline");
    if (window.location.hostname.endsWith("github.io") && !localStorage.getItem("learnmate_api_url")) {
      $("statusText").textContent = "Backend offline (Click to connect)";
    } else {
      $("statusText").textContent = "Backend offline";
    }
    pill.title = "Could not reach backend server. Click to configure backend URL.";
  }
}

/* ---------------------------- Stats ---------------------------- */

async function loadStats() {
  const targetUrl = apiUrl("/api/stats");
  if (!targetUrl) return;
  try {
    const r = await fetch(targetUrl);
    if (!r.ok) return;
    const d = await r.json();
    $("statDocs").textContent = d.documents ?? 0;
    $("statQuestions").textContent = d.questions ?? 0;
  } catch {}
}

/* ---------------------------- Documents (sidebar) ---------------------------- */

async function loadDocuments() {
  const wrap = $("documents");
  const targetUrl = apiUrl("/api/documents");
  if (!targetUrl) {
    wrap.innerHTML = '<div class="empty-docs">Backend offline. Click status pill above to configure backend URL.</div>';
    return;
  }
  try {
    const r = await fetch(targetUrl);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const docs = await r.json();
    wrap.innerHTML = "";
    if (!Array.isArray(docs) || !docs.length) {
      wrap.innerHTML = '<div class="empty-docs">Nothing uploaded yet. Add a portion to get started.</div>';
      return;
    }
    docs.forEach((doc) => {
      const b = document.createElement("button");
      b.className = "doc-item" + (currentDoc && currentDoc.id === doc.id ? " active" : "");
      b.innerHTML = `
        <span class="dot"></span>
        <span class="doc-text">
          <span class="doc-name">${escapeHtml(doc.filename)}</span>
          <span class="doc-sub">${escapeHtml(doc.subject || "General")} · ${doc.chunk_count} section${doc.chunk_count === 1 ? "" : "s"}</span>
        </span>
        <button class="doc-delete" title="Delete portion" data-id="${doc.id}">✕</button>
      `;
      b.onclick = (e) => {
        if (e.target.closest(".doc-delete")) return;
        openDocument(doc);
      };
      b.querySelector(".doc-delete").onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${doc.filename}"? This removes its chat history too.`)) return;
        const delUrl = apiUrl(`/api/documents/${doc.id}`);
        if (delUrl) {
          try {
            await fetch(delUrl, { method: "DELETE" });
            toast("Portion deleted", "success");
          } catch (err) {
            toast("Could not delete: " + err.message, "error");
          }
        }
        if (currentDoc && currentDoc.id === doc.id) showUpload();
        loadDocuments();
        loadStats();
      };
      wrap.appendChild(b);
    });
  } catch {
    wrap.innerHTML = '<div class="empty-docs">Backend offline. Connect a backend server to sync portions.</div>';
  }
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

/* ---------------------------- View switching ---------------------------- */

function showUpload() {
  currentDoc = null;
  $("learnPanel").classList.add("hidden");
  $("uploadPanel").classList.remove("hidden");
  $("crumbText").textContent = "Home";
  loadDocuments();
}

async function openDocument(doc) {
  currentDoc = doc;
  $("uploadPanel").classList.add("hidden");
  $("learnPanel").classList.remove("hidden");
  $("docTitle").textContent = doc.filename;
  $("docMeta").textContent = `${doc.subject || "General study portion"} · ${doc.chunk_count ?? doc.chunks ?? "several"} sections indexed`;
  $("crumbText").textContent = doc.filename;
  if (doc.language) $("language").value = doc.language;

  resetPanel("summary");
  resetPanel("quiz");
  resetPanel("flashcards");
  switchTab("chat");
  loadDocuments();

  $("chat").innerHTML = `<div class="welcome"><div class="avatar ai">✦</div><div><h3>Your AI tutor is ready.</h3><p>Ask a question from "${escapeHtml(doc.filename)}", or try the Summary and Quiz tabs above.</p></div></div>`;
  const msgUrl = apiUrl(`/api/documents/${doc.id}/messages`);
  if (msgUrl) {
    try {
      const r = await fetch(msgUrl);
      if (r.ok) {
        const messages = await r.json();
        if (Array.isArray(messages)) {
          messages.forEach((m) => addMessage(m.role, m.content));
        }
      }
    } catch {}
  }
}

function resetPanel(name) {
  const map = {
    summary: { el: "summaryBody", icon: "📝", text: "Generate an exam-ready summary of this portion.", btnId: "summaryBtn", btnText: "Generate summary" },
    quiz: { el: "quizBody", icon: "🧠", text: "Test yourself with a 5-question quiz built from this portion.", btnId: "quizBtn", btnText: "Generate quiz" },
    flashcards: { el: "flashBody", icon: "🗂️", text: "Turn this portion into a flippable flashcard deck.", btnId: "flashBtn", btnText: "Generate flashcards" },
  }[name];
  $(map.el).innerHTML = `<span class="file-glyph">${map.icon}</span>${map.text}<div class="panel-actions" style="justify-content:center"><button id="${map.btnId}" class="btn btn-primary">${map.btnText}</button></div>`;
  $(map.el).className = "panel-empty";
  bindPanelButtons();
}

/* ---------------------------- Tabs ---------------------------- */

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== name));
  $("modeField").style.display = name === "chat" ? "" : "none";
}
document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => switchTab(t.dataset.tab)));

/* ---------------------------- Upload ---------------------------- */

$("fileInput").onchange = () => {
  const f = $("fileInput").files[0];
  if (f) $("dropzoneText").textContent = f.name;
};
["dragover", "dragleave", "drop"].forEach((evt) => {
  $("dropzone").addEventListener(evt, (e) => {
    e.preventDefault();
    $("dropzone").classList.toggle("dragover", evt === "dragover");
    if (evt === "drop" && e.dataTransfer.files.length) {
      $("fileInput").files = e.dataTransfer.files;
      $("dropzoneText").textContent = e.dataTransfer.files[0].name;
    }
  });
});

function setUploadStatus(text, kind = "") {
  const el = $("uploadStatus");
  el.textContent = text;
  el.className = "status-line" + (kind ? " " + kind : "");
}

$("uploadBtn").onclick = async () => {
  const f = $("fileInput").files[0];
  if (!f) return setUploadStatus("Please choose a study file first.", "error");
  const targetUrl = apiUrl("/api/upload");
  if (!targetUrl) {
    return setUploadStatus(
      "Backend server is offline. LearnMate AI requires the Python FastAPI backend to process files and run AI models. Click the top-right status pill to configure your backend URL (e.g. https://your-backend.onrender.com or http://localhost:8000).",
      "error"
    );
  }
  const fd = new FormData();
  fd.append("file", f);
  fd.append("subject", $("subject").value);
  fd.append("language", $("language").value);
  $("uploadBtn").disabled = true;
  setUploadStatus("Processing your portion…");
  try {
    const r = await fetch(targetUrl, { method: "POST", body: fd });
    let d;
    try {
      d = await r.json();
    } catch {
      throw new Error(`Server returned HTTP ${r.status} (${r.statusText || "unavailable"})`);
    }
    if (!r.ok) throw new Error(d.detail || "Upload failed");
    setUploadStatus("");
    toast(`"${d.filename}" is ready to study`, "success");
    await loadDocuments();
    await loadStats();
    openDocument(d);
  } catch (e) {
    setUploadStatus("Error: " + e.message, "error");
  } finally {
    $("uploadBtn").disabled = false;
  }
};

$("newBtn").onclick = showUpload;
$("changeBtn").onclick = showUpload;

/* ---------------------------- Chat ---------------------------- */

function renderMarkdown(text) {
  try {
    const html = marked.parse(text);
    return DOMPurify.sanitize(html);
  } catch {
    return escapeHtml(text);
  }
}

function addMessage(role, content) {
  const wrap = document.createElement("div");
  wrap.className = `message ${role === "user" ? "user" : "ai"}`;
  const avatar = document.createElement("div");
  avatar.className = `avatar ${role === "user" ? "user" : "ai"}`;
  avatar.textContent = role === "user" ? "You" : "✦";
  const bubbleWrap = document.createElement("div");
  bubbleWrap.className = "bubble-wrap";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "user") {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = renderMarkdown(content);
  }
  bubbleWrap.appendChild(bubble);
  if (role !== "user") {
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(content);
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
    };
    meta.appendChild(copyBtn);
    bubbleWrap.appendChild(meta);
  }
  wrap.appendChild(role === "user" ? bubbleWrap : avatar);
  wrap.appendChild(role === "user" ? avatar : bubbleWrap);
  $("chat").appendChild(wrap);
  $("chat").scrollTop = $("chat").scrollHeight;
  return bubble;
}

function addThinking() {
  const wrap = document.createElement("div");
  wrap.className = "message ai";
  wrap.innerHTML = `<div class="avatar ai">✦</div><div class="bubble-wrap"><div class="bubble"><div class="thinking"><span></span><span></span><span></span></div></div></div>`;
  $("chat").appendChild(wrap);
  $("chat").scrollTop = $("chat").scrollHeight;
  return wrap;
}

async function ask(q) {
  if (!currentDoc || !q.trim()) return;
  addMessage("user", q);
  $("question").value = "";
  const thinkingEl = addThinking();
  const targetUrl = apiUrl("/api/ask");
  if (!targetUrl) {
    thinkingEl.remove();
    addMessage("ai", "**Backend offline.** The AI tutor requires a running backend server. Click the top-right status pill to configure your backend URL.");
    return;
  }
  try {
    const r = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: currentDoc.id,
        question: q,
        language: $("language").value,
        level: $("level").value,
        mode: $("mode").value,
      }),
    });
    let d;
    try {
      d = await r.json();
    } catch {
      throw new Error(`Server returned HTTP ${r.status}`);
    }
    if (!r.ok) throw new Error(d.detail || "Request failed");
    thinkingEl.remove();
    addMessage("ai", d.answer);
    loadStats();
  } catch (e) {
    thinkingEl.remove();
    addMessage("ai", "**Something went wrong.** " + e.message);
  }
}
$("askForm").onsubmit = (e) => {
  e.preventDefault();
  ask($("question").value);
};

/* ---------------------------- Summary ---------------------------- */

async function generateSummary() {
  if (!currentDoc) return;
  const body = $("summaryBody");
  body.className = "panel-body";
  body.innerHTML = `<div class="thinking"><span></span><span></span><span></span></div>`;
  const targetUrl = apiUrl("/api/summary");
  if (!targetUrl) {
    body.innerHTML = `<p class="status-line error">Backend offline. Please connect your backend server via the top-right status pill.</p>
      <div class="panel-actions" style="justify-content:center"><button id="summaryBtn" class="btn btn-primary">Try again</button></div>`;
    bindPanelButtons();
    return;
  }
  try {
    const r = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: currentDoc.id, language: $("language").value, level: $("level").value }),
    });
    let d;
    try {
      d = await r.json();
    } catch {
      throw new Error(`Server returned HTTP ${r.status}`);
    }
    if (!r.ok) throw new Error(d.detail || "Could not generate summary");
    body.innerHTML = `<div class="rendered-md">${renderMarkdown(d.answer)}</div>
      <div class="panel-actions">
        <button id="summaryRegen" class="btn btn-quiet btn-sm">Regenerate</button>
        <button id="summaryDownload" class="btn btn-ghost btn-sm">Download .txt</button>
      </div>`;
    $("summaryRegen").onclick = generateSummary;
    $("summaryDownload").onclick = () => downloadText(`${currentDoc.filename}-summary.txt`, d.answer);
    loadStats();
  } catch (e) {
    body.innerHTML = `<p class="status-line error">${escapeHtml(e.message)}</p>
      <div class="panel-actions" style="justify-content:center"><button id="summaryBtn" class="btn btn-primary">Try again</button></div>`;
    bindPanelButtons();
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------------------------- Quiz ---------------------------- */

let quizState = null;

async function generateQuiz() {
  if (!currentDoc) return;
  const body = $("quizBody");
  body.className = "panel-body";
  body.innerHTML = `<div class="thinking"><span></span><span></span><span></span></div>`;
  const targetUrl = apiUrl("/api/quiz");
  if (!targetUrl) {
    body.innerHTML = `<p class="status-line error">Backend offline. Please connect your backend server via the top-right status pill.</p>
      <div class="panel-actions" style="justify-content:center"><button id="quizBtn" class="btn btn-primary">Try again</button></div>`;
    bindPanelButtons();
    return;
  }
  try {
    const r = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: currentDoc.id, language: $("language").value, level: $("level").value }),
    });
    let d;
    try {
      d = await r.json();
    } catch {
      throw new Error(`Server returned HTTP ${r.status}`);
    }
    if (!r.ok) throw new Error(d.detail || "Could not generate quiz");
    if (!d.questions || !d.questions.length) {
      body.innerHTML = `<p class="status-line error">The quiz could not be parsed. Try regenerating.</p>
        <div class="panel-actions" style="justify-content:center"><button id="quizBtn" class="btn btn-primary">Try again</button></div>`;
      bindPanelButtons();
      return;
    }
    quizState = { questions: d.questions, answers: {}, submitted: false };
    renderQuiz();
  } catch (e) {
    body.innerHTML = `<p class="status-line error">${escapeHtml(e.message)}</p>
      <div class="panel-actions" style="justify-content:center"><button id="quizBtn" class="btn btn-primary">Try again</button></div>`;
    bindPanelButtons();
  }
}

function renderQuiz() {
  const body = $("quizBody");
  body.className = "panel-body";
  let html = "";
  if (quizState.submitted) {
    const correct = quizState.questions.filter((q, i) => quizState.answers[i] === q.answer).length;
    html += `<div class="quiz-score"><div class="big">${correct}/${quizState.questions.length}</div><div class="label">You got ${correct} out of ${quizState.questions.length} correct. Review the explanations below.</div></div>`;
  }
  quizState.questions.forEach((q, i) => {
    html += `<div class="q-card"><div class="q-num">Question ${i + 1} of ${quizState.questions.length}</div><div class="q-text">${escapeHtml(q.question)}</div><div class="q-options">`;
    Object.entries(q.options).forEach(([key, text]) => {
      let cls = "q-option";
      const selected = quizState.answers[i] === key;
      if (selected) cls += " selected";
      if (quizState.submitted) {
        if (key === q.answer) cls += " correct";
        else if (selected) cls += " incorrect";
      }
      html += `<button type="button" class="${cls}" data-q="${i}" data-key="${key}" ${quizState.submitted ? "disabled" : ""}><span class="key">${key}</span><span>${escapeHtml(text)}</span></button>`;
    });
    html += `</div>`;
    if (quizState.submitted) {
      html += `<div class="q-explain"><strong>${q.answer}.</strong> ${escapeHtml(q.explanation || "")}</div>`;
    }
    html += `</div>`;
  });
  html += `<div class="panel-actions" style="padding:20px 22px">`;
  if (!quizState.submitted) {
    html += `<button id="quizSubmit" class="btn btn-primary">Submit answers</button>`;
  } else {
    html += `<button id="quizRetry" class="btn btn-quiet">Try again</button><button id="quizNew" class="btn btn-ghost">New quiz</button>`;
  }
  html += `</div>`;
  body.innerHTML = html;

  body.querySelectorAll(".q-option").forEach((btn) => {
    btn.onclick = () => {
      if (quizState.submitted) return;
      quizState.answers[btn.dataset.q] = btn.dataset.key;
      renderQuiz();
    };
  });
  if (!quizState.submitted) {
    const submitBtn = $("quizSubmit");
    if (submitBtn)
      submitBtn.onclick = () => {
        if (Object.keys(quizState.answers).length < quizState.questions.length) {
          toast("Answer every question before submitting", "error");
          return;
        }
        quizState.submitted = true;
        renderQuiz();
      };
  } else {
    const retryBtn = $("quizRetry");
    const newBtn = $("quizNew");
    if (retryBtn)
      retryBtn.onclick = () => {
        quizState.answers = {};
        quizState.submitted = false;
        renderQuiz();
      };
    if (newBtn) newBtn.onclick = generateQuiz;
  }
}

/* ---------------------------- Flashcards ---------------------------- */

let flashState = null;

async function generateFlashcards() {
  if (!currentDoc) return;
  const body = $("flashBody");
  body.className = "panel-body";
  body.innerHTML = `<div class="thinking"><span></span><span></span><span></span></div>`;
  const targetUrl = apiUrl("/api/flashcards");
  if (!targetUrl) {
    body.innerHTML = `<p class="status-line error">Backend offline. Please connect your backend server via the top-right status pill.</p>
      <div class="panel-actions" style="justify-content:center"><button id="flashBtn" class="btn btn-primary">Try again</button></div>`;
    bindPanelButtons();
    return;
  }
  try {
    const r = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: currentDoc.id, language: $("language").value, level: $("level").value }),
    });
    let d;
    try {
      d = await r.json();
    } catch {
      throw new Error(`Server returned HTTP ${r.status}`);
    }
    if (!r.ok) throw new Error(d.detail || "Could not generate flashcards");
    if (!d.cards || !d.cards.length) {
      body.innerHTML = `<p class="status-line error">Flashcards could not be parsed. Try regenerating.</p>
        <div class="panel-actions" style="justify-content:center"><button id="flashBtn" class="btn btn-primary">Try again</button></div>`;
      bindPanelButtons();
      return;
    }
    flashState = { cards: d.cards, index: 0, flipped: false };
    renderFlashcards();
  } catch (e) {
    body.innerHTML = `<p class="status-line error">${escapeHtml(e.message)}</p>
      <div class="panel-actions" style="justify-content:center"><button id="flashBtn" class="btn btn-primary">Try again</button></div>`;
    bindPanelButtons();
  }
}

function renderFlashcards() {
  const body = $("flashBody");
  body.className = "flash-wrap";
  const card = flashState.cards[flashState.index];
  body.innerHTML = `
    <div class="flash-progress">Card ${flashState.index + 1} of ${flashState.cards.length} · click to flip</div>
    <div class="flashcard ${flashState.flipped ? "flipped" : ""}" id="flashcardEl">
      <div class="flashcard-inner">
        <div class="flash-face front">${escapeHtml(card.front)}</div>
        <div class="flash-face back">${escapeHtml(card.back)}</div>
      </div>
    </div>
    <div class="flash-nav">
      <button id="flashPrev" class="btn btn-quiet btn-sm" ${flashState.index === 0 ? "disabled" : ""}>← Previous</button>
      <button id="flashShuffle" class="btn btn-ghost btn-sm">Shuffle</button>
      <button id="flashNext" class="btn btn-quiet btn-sm" ${flashState.index === flashState.cards.length - 1 ? "disabled" : ""}>Next →</button>
    </div>
    <span class="flash-hint">Regenerate for a fresh deck any time.</span>
    <button id="flashRegen" class="btn btn-ghost btn-sm">Regenerate deck</button>
  `;
  $("flashcardEl").onclick = () => {
    flashState.flipped = !flashState.flipped;
    $("flashcardEl").classList.toggle("flipped", flashState.flipped);
  };
  $("flashPrev").onclick = () => {
    flashState.index = Math.max(0, flashState.index - 1);
    flashState.flipped = false;
    renderFlashcards();
  };
  $("flashNext").onclick = () => {
    flashState.index = Math.min(flashState.cards.length - 1, flashState.index + 1);
    flashState.flipped = false;
    renderFlashcards();
  };
  $("flashShuffle").onclick = () => {
    flashState.cards.sort(() => Math.random() - 0.5);
    flashState.index = 0;
    flashState.flipped = false;
    renderFlashcards();
  };
  $("flashRegen").onclick = generateFlashcards;
}

/* ---------------------------- Wire up buttons that get re-created ---------------------------- */

function bindPanelButtons() {
  const s = $("summaryBtn");
  const q = $("quizBtn");
  const f = $("flashBtn");
  if (s) s.onclick = generateSummary;
  if (q) q.onclick = generateQuiz;
  if (f) f.onclick = generateFlashcards;
}

/* ---------------------------- Init ---------------------------- */

initTheme();
initStatusPill();
bindPanelButtons();
checkHealth();
loadStats();
loadDocuments();
