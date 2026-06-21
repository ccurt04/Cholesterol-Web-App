// Front-end: live lipid badges, heartbeat dot, plan generation, tracking + chart.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Heartbeat dot tracing the ECG path ---------- */
(function animateEcg() {
  const path = document.querySelector(".ecg-line");
  const dot = document.querySelector(".ecg-dot");
  if (!path || !dot || reduceMotion) return;
  const len = path.getTotalLength();
  const period = 4500; // matches the CSS trace animation
  function frame(t) {
    const p = path.getPointAtLength(((t % period) / period) * len);
    dot.setAttribute("cx", p.x);
    dot.setAttribute("cy", p.y);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* ---------- Live lipid status badges ---------- */
// Ranges in mg/dL based on standard lipid guidelines. HDL is "higher is better".
function lipidStatus(kind, v) {
  if (!Number.isFinite(v) || v <= 0) return null;
  switch (kind) {
    case "total": return v < 200 ? ["Desirable", "ok"] : v < 240 ? ["Borderline high", "warn"] : ["High", "high"];
    case "ldl":   return v < 100 ? ["Optimal", "ok"] : v < 130 ? ["Near optimal", "ok"] : v < 160 ? ["Borderline high", "warn"] : ["High", "high"];
    case "hdl":   return v >= 60 ? ["Protective", "ok"] : v >= 40 ? ["OK — aim higher", "warn"] : ["Low (raises risk)", "high"];
    case "trig":  return v < 150 ? ["Normal", "ok"] : v < 200 ? ["Borderline high", "warn"] : ["High", "high"];
    default: return null;
  }
}

document.querySelectorAll("input[data-lipid]").forEach((input) => {
  const badge = document.querySelector(`[data-badge="${input.dataset.lipid}"]`);
  const update = () => {
    const status = lipidStatus(input.dataset.lipid, parseFloat(input.value));
    badge.className = "badge";
    if (!status) { badge.textContent = ""; return; }
    badge.textContent = status[0];
    badge.classList.add(status[1], "show");
  };
  input.addEventListener("input", update);
});

/* ---------- Helpers ---------- */
function formToObject(form) {
  const obj = {};
  new FormData(form).forEach((v, k) => { obj[k] = v; });
  return obj;
}

// Minimal, safe Markdown -> HTML (headers, bold, bullets, paragraphs).
function renderMarkdown(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc(md).split("\n");
  let html = "", inList = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (let line of lines) {
    line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const h = line.match(/^(#{1,6})\s+(.*)/);
    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    if (h) { closeList(); const lvl = Math.min(h[1].length + 2, 6); html += `<h${lvl}>${h[2]}</h${lvl}>`; }
    else if (bullet) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${bullet[1]}</li>`; }
    else if (line.trim() === "") { closeList(); }
    else { closeList(); html += `<p>${line}</p>`; }
  }
  closeList();
  return html;
}

/* ---------- Plan generation ---------- */
document.getElementById("plan-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("generate-btn");
  const label = btn.querySelector(".btn-label");
  const card = document.getElementById("plan-card");
  const out = document.getElementById("plan-output");
  const data = formToObject(e.target);

  btn.disabled = true;
  label.textContent = "Thinking…";
  card.hidden = false;
  out.innerHTML = '<p class="loading"><span class="pulse-dot"></span>Building a personalized plan — this takes a few seconds.</p>';
  card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });

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
    out.innerHTML = `<p style="color:#cb5a4c">${err.message}</p>`;
  } finally {
    btn.disabled = false;
    label.textContent = "Build the plan";
  }
});

/* ---------- Tracking: table + SVG trend chart ---------- */
const SVGNS = "http://www.w3.org/2000/svg";
function el(tag, attrs, text) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

function drawChart(entries) {
  const wrap = document.getElementById("chart-wrap");
  const svg = document.getElementById("trend-chart");
  svg.innerHTML = "";
  const pts = entries
    .map((e) => ({ date: e.date, ldl: parseFloat(e.ldl) }))
    .filter((p) => Number.isFinite(p.ldl));
  if (pts.length < 1) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const W = 640, H = 220, padL = 46, padR = 18, padT = 18, padB = 30;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const vals = pts.map((p) => p.ldl);
  let lo = Math.min(...vals, 90), hi = Math.max(...vals, 170);
  const pad = (hi - lo) * 0.12 || 10;
  lo -= pad; hi += pad;
  const x = (i) => padL + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
  const y = (v) => padT + innerH - ((v - lo) / (hi - lo)) * innerH;

  // Guideline bands: optimal (<100) and high (>=160)
  [["Optimal <100", 100, "var(--ok)"], ["High ≥160", 160, "var(--high)"]].forEach(([txt, v, col]) => {
    if (v < lo || v > hi) return;
    svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: col, "stroke-width": 1, "stroke-dasharray": "4 5", opacity: 0.45 }));
    svg.appendChild(el("text", { x: W - padR, y: y(v) - 4, "text-anchor": "end", "font-size": 10, fill: col, "font-family": "Montserrat, sans-serif" }, txt));
  });

  // Area + line
  const linePts = pts.map((p, i) => `${x(i)},${y(p.ldl)}`).join(" ");
  if (pts.length > 1) {
    const area = `${padL},${padT + innerH} ${linePts} ${x(pts.length - 1)},${padT + innerH}`;
    const grad = el("linearGradient", { id: "ldlGrad", x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(el("stop", { offset: "0%", "stop-color": "#5E9377", "stop-opacity": 0.28 }));
    grad.appendChild(el("stop", { offset: "100%", "stop-color": "#5E9377", "stop-opacity": 0 }));
    const defs = el("defs", {}); defs.appendChild(grad); svg.appendChild(defs);
    svg.appendChild(el("polygon", { points: area, fill: "url(#ldlGrad)" }));
    svg.appendChild(el("polyline", { points: linePts, fill: "none", stroke: "#5E9377", "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  }

  // Points + endpoint label
  pts.forEach((p, i) => {
    svg.appendChild(el("circle", { cx: x(i), cy: y(p.ldl), r: 4, fill: "#E07A5F", stroke: "#fff", "stroke-width": 1.5 }));
  });
  const last = pts[pts.length - 1];
  svg.appendChild(el("text", { x: x(pts.length - 1), y: y(last.ldl) - 10, "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: "#E07A5F", "font-family": "Montserrat, sans-serif" }, `${last.ldl}`));

  // X labels (first & last date)
  const shortDate = (d) => d.slice(5); // MM-DD
  svg.appendChild(el("text", { x: x(0), y: H - 8, "text-anchor": "start", "font-size": 10, fill: "#74807C", "font-family": "Montserrat, sans-serif" }, shortDate(pts[0].date)));
  if (pts.length > 1)
    svg.appendChild(el("text", { x: x(pts.length - 1), y: H - 8, "text-anchor": "end", "font-size": 10, fill: "#74807C", "font-family": "Montserrat, sans-serif" }, shortDate(last.date)));
}

function renderEntries(entries) {
  const table = document.getElementById("entries-table");
  const tbody = table.querySelector("tbody");
  drawChart(entries);
  if (!entries.length) { table.hidden = true; return; }
  tbody.innerHTML = entries.map((e) => `
    <tr><td>${e.date}</td><td>${e.total_chol || "—"}</td><td>${e.ldl || "—"}</td>
    <td>${e.hdl || "—"}</td><td>${e.triglycerides || "—"}</td><td>${e.weight || "—"}</td></tr>`).join("");
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
