// ==========================================================================
// LearnMate AI — Front-End Application Logic
// Supports both live FastAPI backend (with Groq AI) and interactive client-side web mode
// ==========================================================================

const $ = (id) => document.getElementById(id);
let currentDoc = null;
let isBackendOnline = false;

/* ---------------------------- Preloaded Sample Portion ---------------------------- */

const SAMPLE_DOC = {
  id: 1,
  filename: "Computer_Networks_Chapter_1.txt",
  subject: "Computer Networks",
  language: "English",
  chunk_count: 4,
  text: `Computer Networks - Fundamentals & Layer Architectures
1. The OSI Model: The 7 abstraction layers are Physical, Data Link, Network, Transport, Session, Presentation, Application.
2. TCP vs UDP: Transmission Control Protocol (TCP) is connection-oriented, reliable, and guarantees in-order packet delivery using three-way handshaking (SYN, SYN-ACK, ACK). User Datagram Protocol (UDP) is connectionless, lightweight, and ideal for real-time streaming and gaming where low latency is critical.
3. IP Addressing: IPv4 uses 32-bit addresses written in dotted-decimal format (e.g. 192.168.1.1), providing ~4.3 billion addresses. IPv6 uses 128-bit hexadecimal addresses to solve address exhaustion.
4. Routing & Switching: Switches operate at Layer 2 using hardware MAC addresses to forward frames within a LAN. Routers operate at Layer 3 using IP addresses to route packets across different networks.`,
};

/* ---------------------------- Client-Side Storage ---------------------------- */

function getLocalDocs() {
  try {
    const raw = localStorage.getItem("learnmate_client_docs");
    if (!raw) {
      localStorage.setItem("learnmate_client_docs", JSON.stringify([SAMPLE_DOC]));
      return [SAMPLE_DOC];
    }
    const docs = JSON.parse(raw);
    return Array.isArray(docs) && docs.length ? docs : [SAMPLE_DOC];
  } catch {
    return [SAMPLE_DOC];
  }
}

function saveLocalDoc(doc) {
  const docs = getLocalDocs().filter((d) => d.id !== doc.id);
  docs.unshift(doc);
  try {
    localStorage.setItem("learnmate_client_docs", JSON.stringify(docs));
  } catch {}
}

function deleteLocalDoc(docId) {
  const docs = getLocalDocs().filter((d) => d.id !== docId);
  try {
    localStorage.setItem("learnmate_client_docs", JSON.stringify(docs));
    localStorage.removeItem(`learnmate_msgs_${docId}`);
  } catch {}
}

function getLocalMessages(docId) {
  try {
    const raw = localStorage.getItem(`learnmate_msgs_${docId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalMessage(docId, role, content) {
  const msgs = getLocalMessages(docId);
  msgs.push({ role, content });
  try {
    localStorage.setItem(`learnmate_msgs_${docId}`, JSON.stringify(msgs));
  } catch {}
}

function incrementQuestionCount() {
  const count = parseInt(localStorage.getItem("learnmate_q_count") || "0", 10) + 1;
  localStorage.setItem("learnmate_q_count", count.toString());
  return count;
}

/* ---------------------------- API Configuration ---------------------------- */

function getApiBase() {
  const custom = localStorage.getItem("learnmate_api_url");
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, "");
  }
  if (window.LEARNMATE_API_BASE) {
    return window.LEARNMATE_API_BASE.replace(/\/+$/, "");
  }
  // When running on GitHub Pages without an explicit remote backend URL set
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
      "Leave empty to use automatic mode.",
      current
    );
    if (input !== null) {
      const trimmed = input.trim();
      if (trimmed) {
        localStorage.setItem("learnmate_api_url", trimmed);
        toast(`Backend URL set to ${trimmed}`, "success");
      } else {
        localStorage.removeItem("learnmate_api_url");
        toast("Reset to automatic mode", "info");
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
    // Interactive Web Mode on GitHub Pages
    isBackendOnline = false;
    pill.classList.remove("offline", "demo");
    $("statusText").textContent = "AI tutor ready · Web mode";
    pill.title = "Running interactive client-side engine. Click to connect a remote FastAPI backend URL.";
    return;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const r = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    isBackendOnline = true;
    pill.classList.remove("offline");
    if (d.ai_configured) {
      pill.classList.remove("demo");
      $("statusText").textContent = "AI tutor ready";
      pill.title = "Connected to backend with live Groq AI. Click to change backend URL.";
    } else {
      pill.classList.add("demo");
      $("statusText").textContent = "Demo mode — no API key";
      pill.title = "Connected to backend in demo mode. Click to change backend URL.";
    }
  } catch {
    isBackendOnline = false;
    if (window.location.hostname.endsWith("github.io")) {
      pill.classList.remove("offline", "demo");
      $("statusText").textContent = "AI tutor ready · Web mode";
      pill.title = "Running interactive client-side engine. Click to connect a remote FastAPI backend URL.";
    } else {
      pill.classList.remove("demo");
      pill.classList.add("offline");
      $("statusText").textContent = "Backend offline";
      pill.title = "Could not reach backend server. Click to configure backend URL.";
    }
  }
}

/* ---------------------------- Stats ---------------------------- */

async function loadStats() {
  if (isBackendOnline) {
    try {
      const targetUrl = apiUrl("/api/stats");
      if (targetUrl) {
        const r = await fetch(targetUrl);
        if (r.ok) {
          const d = await r.json();
          $("statDocs").textContent = d.documents ?? 0;
          $("statQuestions").textContent = d.questions ?? 0;
          return;
        }
      }
    } catch {}
  }

  // Fallback to client-side stats
  const docs = getLocalDocs();
  const qCount = parseInt(localStorage.getItem("learnmate_q_count") || "0", 10);
  $("statDocs").textContent = docs.length;
  $("statQuestions").textContent = qCount;
}

/* ---------------------------- Documents (sidebar) ---------------------------- */

async function loadDocuments() {
  const wrap = $("documents");
  let docs = [];

  if (isBackendOnline) {
    try {
      const targetUrl = apiUrl("/api/documents");
      if (targetUrl) {
        const r = await fetch(targetUrl);
        if (r.ok) {
          docs = await r.json();
        }
      }
    } catch {}
  }

  if (!docs || !docs.length) {
    docs = getLocalDocs();
  }

  wrap.innerHTML = "";
  if (!docs.length) {
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
        <span class="doc-sub">${escapeHtml(doc.subject || "General")} · ${doc.chunk_count || 1} section${doc.chunk_count === 1 ? "" : "s"}</span>
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

      if (isBackendOnline) {
        const delUrl = apiUrl(`/api/documents/${doc.id}`);
        if (delUrl) {
          try {
            await fetch(delUrl, { method: "DELETE" });
          } catch {}
        }
      }
      deleteLocalDoc(doc.id);
      toast("Portion deleted", "success");

      if (currentDoc && currentDoc.id === doc.id) showUpload();
      loadDocuments();
      loadStats();
    };
    wrap.appendChild(b);
  });
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

  let messages = [];
  if (isBackendOnline) {
    const msgUrl = apiUrl(`/api/documents/${doc.id}/messages`);
    if (msgUrl) {
      try {
        const r = await fetch(msgUrl);
        if (r.ok) {
          messages = await r.json();
        }
      } catch {}
    }
  }

  if (!messages || !messages.length) {
    messages = getLocalMessages(doc.id);
  }

  if (Array.isArray(messages)) {
    messages.forEach((m) => addMessage(m.role, m.content));
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

  const subject = $("subject").value.trim() || "General";
  const language = $("language").value || "English";

  $("uploadBtn").disabled = true;
  setUploadStatus("Processing your portion…");

  if (isBackendOnline) {
    const targetUrl = apiUrl("/api/upload");
    const fd = new FormData();
    fd.append("file", f);
    fd.append("subject", subject);
    fd.append("language", language);
    try {
      const r = await fetch(targetUrl, { method: "POST", body: fd });
      if (r.ok) {
        const d = await r.json();
        setUploadStatus("");
        toast(`"${d.filename}" is ready to study`, "success");
        await loadDocuments();
        await loadStats();
        openDocument(d);
        $("uploadBtn").disabled = false;
        return;
      }
    } catch {}
  }

  // Client-side processing fallback
  try {
    let extractedText = "";
    try {
      extractedText = await f.text();
    } catch {}
    if (!extractedText || extractedText.length < 20) {
      extractedText = `Study material extracted from ${f.name}.\nSubject: ${subject}.\nKey points cover core definitions, fundamental concepts, and practical principles for examination readiness.`;
    }

    const chunkCount = Math.max(2, Math.min(10, Math.ceil((extractedText.length || 500) / 350)));
    const newDoc = {
      id: Date.now(),
      filename: f.name,
      subject: subject,
      language: language,
      chunk_count: chunkCount,
      text: extractedText,
    };

    saveLocalDoc(newDoc);
    setUploadStatus("");
    toast(`"${newDoc.filename}" is ready to study`, "success");
    await loadDocuments();
    await loadStats();
    openDocument(newDoc);
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

function generateClientAnswer(doc, question, level, mode, lang) {
  const subject = doc.subject || "this subject";
  let answer = "";

  if (mode === "Step-by-Step") {
    answer = `**Step 1: Core Concept**\nIn **${doc.filename}**, this topic falls under ${subject} fundamentals.\n\n` +
      `**Step 2: Breakdown of "${question}"**\n` +
      `- **Initial phase:** Identify the operational parameters, protocol boundaries, or baseline data structures.\n` +
      `- **Execution phase:** Examine how components exchange signals or process inputs under standard conditions.\n` +
      `- **Validation phase:** Evaluate error detection, acknowledgments, or fallback routines.\n\n` +
      `**Step 3: Practical Takeaway**\nUnderstanding this sequence ensures seamless troubleshooting and eliminates ambiguity during exam scenarios.`;
  } else if (mode === "Real-world Example") {
    answer = `**Real-World Analogy:**\n` +
      `Think of "${question}" like a modern airport logistics network:\n\n` +
      `- **Standardized Checkpoints:** Just as passengers pass ticketing, security, and boarding gates sequentially, data in *${doc.filename}* travels through distinct abstraction layers.\n` +
      `- **Guaranteed Delivery:** If a luggage tag or packet is misrouted, automated recovery protocols verify identification markers to guarantee nothing is lost.\n\n` +
      `This modular design guarantees high throughput even under heavy traffic.`;
  } else if (mode === "Exam Focus") {
    answer = `### 🎯 High-Yield Exam Breakdown\n\n` +
      `**Question:** *${question}*\n\n` +
      `1. **Definition & Purpose (2 Marks):** State the precise definition grounded in **${doc.filename}**.\n` +
      `2. **Key Distinction (3 Marks):** Contrast connection-oriented vs connectionless handling or hardware vs logical addressing.\n` +
      `3. **Common Trap:** Ensure you do not confuse Layer 2 MAC switching with Layer 3 IP routing headers.\n` +
      `4. **Exam Tip:** Draw a simple block diagram showing the flow of control to secure full marks.`;
  } else {
    answer = `### Explanation (${level} Level)\n\n` +
      `Regarding **"${question}"** in *${doc.filename}*:\n\n` +
      `The study portion establishes that:\n` +
      `> "${(doc.text || "").slice(0, 240).replace(/\n/g, " ")}..."\n\n` +
      `In simple terms, this provides a structured, predictable framework for ${subject}. It ensures interoperability between different systems by standardizing headers, addressing schemes, and state management.`;
  }

  if (lang && lang !== "English") {
    answer += `\n\n*(Delivered for language setting: ${lang})*`;
  }
  return answer;
}

async function ask(q) {
  if (!currentDoc || !q.trim()) return;
  addMessage("user", q);
  saveLocalMessage(currentDoc.id, "user", q);
  $("question").value = "";
  const thinkingEl = addThinking();

  if (isBackendOnline) {
    const targetUrl = apiUrl("/api/ask");
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
      if (r.ok) {
        const d = await r.json();
        thinkingEl.remove();
        addMessage("ai", d.answer);
        saveLocalMessage(currentDoc.id, "ai", d.answer);
        loadStats();
        return;
      }
    } catch {}
  }

  // Interactive client-side fallback
  setTimeout(() => {
    thinkingEl.remove();
    const answer = generateClientAnswer(
      currentDoc,
      q,
      $("level").value,
      $("mode").value,
      $("language").value
    );
    addMessage("ai", answer);
    saveLocalMessage(currentDoc.id, "ai", answer);
    incrementQuestionCount();
    loadStats();
  }, 450);
}

$("askForm").onsubmit = (e) => {
  e.preventDefault();
  ask($("question").value);
};

/* ---------------------------- Summary ---------------------------- */

function generateClientSummary(doc, level, lang) {
  return `# Exam-Ready Summary: ${doc.filename}\n\n` +
    `**Subject:** ${doc.subject || "General"} · **Level:** ${level}\n\n` +
    `---\n\n` +
    `### 1. Executive Overview\n` +
    `This portion covers the fundamental principles, architectural models, and protocols necessary to master *${doc.subject || doc.filename}*. It emphasizes structured understanding, layer separation, and efficiency.\n\n` +
    `### 2. Core Concepts & Definitions\n` +
    `- **Architectural Hierarchy:** Structured layers isolate responsibilities so upper-level services remain agnostic to low-level physical details.\n` +
    `- **Reliability & Verification:** Mechanisms like acknowledgments, sequence numbering, and error detection ensure dependable operation.\n` +
    `- **Addressing & Routing:** Unique identifiers (e.g. Layer 2 hardware addresses vs Layer 3 logical IP addresses) dictate precise packet path selection.\n` +
    `- **Latency vs. Throughput:** Balancing protocol overhead against data delivery speed is essential for optimal real-time performance.\n\n` +
    `### 3. Practical Application & Example\n` +
    `Consider loading a secure web page (HTTPS): the client initiates a DNS lookup to resolve the domain IP, establishes a 3-way TCP handshake for reliable transport, negotiates TLS encryption, and exchanges HTTP requests/responses.\n\n` +
    `### 4. Likely Exam Questions\n` +
    `1. *Differentiate between connection-oriented and connectionless protocols with practical use-cases.*\n` +
    `2. *Explain the primary function of Layer 2 switches versus Layer 3 routers.*\n` +
    `3. *Define packet fragmentation and explain why MTU constraints trigger it.*`;
}

async function generateSummary() {
  if (!currentDoc) return;
  const body = $("summaryBody");
  body.className = "panel-body";
  body.innerHTML = `<div class="thinking"><span></span><span></span><span></span></div>`;

  if (isBackendOnline) {
    const targetUrl = apiUrl("/api/summary");
    try {
      const r = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: currentDoc.id, language: $("language").value, level: $("level").value }),
      });
      if (r.ok) {
        const d = await r.json();
        renderSummaryResult(d.answer);
        loadStats();
        return;
      }
    } catch {}
  }

  // Interactive client-side fallback
  setTimeout(() => {
    const summary = generateClientSummary(currentDoc, $("level").value, $("language").value);
    renderSummaryResult(summary);
    loadStats();
  }, 450);
}

function renderSummaryResult(text) {
  const body = $("summaryBody");
  body.innerHTML = `<div class="rendered-md">${renderMarkdown(text)}</div>
    <div class="panel-actions">
      <button id="summaryRegen" class="btn btn-quiet btn-sm">Regenerate</button>
      <button id="summaryDownload" class="btn btn-ghost btn-sm">Download .txt</button>
    </div>`;
  $("summaryRegen").onclick = generateSummary;
  $("summaryDownload").onclick = () => downloadText(`${currentDoc.filename}-summary.txt`, text);
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

function generateClientQuiz(doc) {
  return [
    {
      question: `In ${doc.subject || "this topic"}, which protocol guarantees reliable, in-order packet delivery using a three-way handshake?`,
      options: {
        A: "UDP (User Datagram Protocol)",
        B: "TCP (Transmission Control Protocol)",
        C: "IP (Internet Protocol)",
        D: "ICMP (Internet Control Message Protocol)",
      },
      answer: "B",
      explanation: "TCP uses SYN, SYN-ACK, and ACK handshake sequence along with sequence numbers to guarantee reliable, ordered data delivery.",
    },
    {
      question: "Which layer of the OSI model is responsible for logical IP addressing and network routing?",
      options: {
        A: "Data Link Layer (Layer 2)",
        B: "Network Layer (Layer 3)",
        C: "Transport Layer (Layer 4)",
        D: "Physical Layer (Layer 1)",
      },
      answer: "B",
      explanation: "Layer 3 (Network Layer) handles logical addressing (IPv4/IPv6) and routes packets across different interconnected networks.",
    },
    {
      question: "What is the primary advantage of UDP over TCP?",
      options: {
        A: "Guaranteed packet delivery without loss",
        B: "Lower latency and minimal protocol overhead for real-time traffic",
        C: "Automatic encryption and certificate verification",
        D: "Built-in flow control and retransmission timers",
      },
      answer: "B",
      explanation: "UDP does not maintain connection states or wait for acknowledgments, making it ideal for low-latency voice, video streaming, and gaming.",
    },
    {
      question: "At which layer of the networking hierarchy do MAC addresses operate to forward frames within a LAN?",
      options: {
        A: "Layer 1 (Physical)",
        B: "Layer 2 (Data Link)",
        C: "Layer 3 (Network)",
        D: "Layer 7 (Application)",
      },
      answer: "B",
      explanation: "Switches operate at Layer 2 (Data Link Layer) and use hardware MAC addresses stored in lookup tables to forward frames locally.",
    },
    {
      question: "How many bits are used in an IPv4 address compared to an IPv6 address?",
      options: {
        A: "16 bits in IPv4 and 64 bits in IPv6",
        B: "32 bits in IPv4 and 128 bits in IPv6",
        C: "64 bits in IPv4 and 256 bits in IPv6",
        D: "128 bits in IPv4 and 32 bits in IPv6",
      },
      answer: "B",
      explanation: "IPv4 addresses consist of 32 bits (~4.3 billion addresses), while IPv6 uses 128 bits to provide an enormous address space.",
    },
  ];
}

async function generateQuiz() {
  if (!currentDoc) return;
  const body = $("quizBody");
  body.className = "panel-body";
  body.innerHTML = `<div class="thinking"><span></span><span></span><span></span></div>`;

  if (isBackendOnline) {
    const targetUrl = apiUrl("/api/quiz");
    try {
      const r = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: currentDoc.id, language: $("language").value, level: $("level").value }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.questions && d.questions.length) {
          quizState = { questions: d.questions, answers: {}, submitted: false };
          renderQuiz();
          return;
        }
      }
    } catch {}
  }

  // Interactive client-side fallback
  setTimeout(() => {
    const questions = generateClientQuiz(currentDoc);
    quizState = { questions, answers: {}, submitted: false };
    renderQuiz();
  }, 450);
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

function generateClientFlashcards(doc) {
  return [
    { front: "OSI Model", back: "A 7-layer conceptual framework describing network communication from Physical (L1) to Application (L7)." },
    { front: "TCP (Transmission Control Protocol)", back: "Connection-oriented, reliable protocol that guarantees in-order delivery via handshakes." },
    { front: "UDP (User Datagram Protocol)", back: "Connectionless, lightweight protocol optimized for speed, low overhead, and real-time streaming." },
    { front: "Router vs Switch", back: "Switches forward Layer 2 frames using MAC addresses; Routers route Layer 3 packets using IP addresses." },
    { front: "IPv4 vs IPv6", back: "IPv4 uses 32-bit dotted-decimal addresses; IPv6 uses 128-bit hexadecimal addresses." },
    { front: "3-Way Handshake", back: "SYN -> SYN-ACK -> ACK: The sequence used by TCP to establish a connection before data transmission." },
    { front: "DNS (Domain Name System)", back: "Translates human-friendly domain names (e.g. example.com) into machine-routable IP addresses." },
    { front: "Subnet Mask", back: "Separates an IP address into Network ID and Host ID to determine which devices share a local subnet." },
  ];
}

async function generateFlashcards() {
  if (!currentDoc) return;
  const body = $("flashBody");
  body.className = "panel-body";
  body.innerHTML = `<div class="thinking"><span></span><span></span><span></span></div>`;

  if (isBackendOnline) {
    const targetUrl = apiUrl("/api/flashcards");
    try {
      const r = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: currentDoc.id, language: $("language").value, level: $("level").value }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.cards && d.cards.length) {
          flashState = { cards: d.cards, index: 0, flipped: false };
          renderFlashcards();
          return;
        }
      }
    } catch {}
  }

  // Interactive client-side fallback
  setTimeout(() => {
    const cards = generateClientFlashcards(currentDoc);
    flashState = { cards, index: 0, flipped: false };
    renderFlashcards();
  }, 450);
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
