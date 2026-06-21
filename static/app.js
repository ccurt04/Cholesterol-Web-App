// Front-end logic: generate a plan, render it, and log/track lab results.

function formToObject(form) {
  const obj = {};
  new FormData(form).forEach((v, k) => { obj[k] = v; });
  return obj;
}

// Minimal, safe Markdown -> HTML for the plan (headers, bold, bullets, paragraphs).
function renderMarkdown(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc(md).split("\n");
  let html = "";
  let inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (let line of lines) {
    line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const h = line.match(/^(#{1,6})\s+(.*)/);
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    if (h) {
      closeList();
      const level = Math.min(h[1].length + 2, 6);
      html += `<h${level}>${h[2]}</h${level}>`;
    } else if (bullet) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${bullet[1]}</li>`;
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      html += `<p>${line}</p>`;
    }
  }
  closeList();
  return html;
}

document.getElementById("plan-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("generate-btn");
  const card = document.getElementById("plan-card");
  const out = document.getElementById("plan-output");
  const data = formToObject(e.target);

  btn.disabled = true;
  btn.textContent = "Thinking…";
  card.hidden = false;
  out.innerHTML = '<p class="loading">Building a personalized plan… this can take a few seconds.</p>';
  card.scrollIntoView({ behavior: "smooth" });

  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Something went wrong.");
    out.innerHTML = renderMarkdown(json.plan);
  } catch (err) {
    out.innerHTML = `<p style="color:#b3261e">${err.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate plan";
  }
});

// --- Tracking ---
function renderEntries(entries) {
  const table = document.getElementById("entries-table");
  const tbody = table.querySelector("tbody");
  if (!entries.length) { table.hidden = true; return; }
  tbody.innerHTML = entries.map((e) => `
    <tr>
      <td>${e.date}</td>
      <td>${e.total_chol || "—"}</td>
      <td>${e.ldl || "—"}</td>
      <td>${e.hdl || "—"}</td>
      <td>${e.triglycerides || "—"}</td>
      <td>${e.weight || "—"}</td>
    </tr>`).join("");
  table.hidden = false;
}

async function loadEntries() {
  try {
    const res = await fetch("/api/entries");
    const json = await res.json();
    renderEntries(json.entries || []);
  } catch { /* ignore on first load */ }
}

document.getElementById("track-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = formToObject(e.target);
  const res = await fetch("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (res.ok) { renderEntries(json.entries); e.target.reset(); }
});

loadEntries();
