const shell = document.getElementById("shell");
const barTrack = document.getElementById("barTrack");
const line1 = document.getElementById("line1");
const line2 = document.getElementById("line2");
const btnToggle = document.getElementById("btnToggle");

const PILL_H = 40;
const PANEL_H = 220;

function paintBar(p) {
  if (!p || !barTrack) return;
  const blue = Math.min(1, Math.max(0, p.bluePct ?? 0));
  const red = Math.min(1, Math.max(0, p.redPct ?? 0));
  const warn = Math.min(1, Math.max(0, p.warnYellowPct ?? 0));
  const greenEnd = (1 - blue) * 100;

  if (blue > 0.02) {
    const blend = Math.min(100, greenEnd + 4);
    barTrack.style.background = `linear-gradient(90deg,
      #16a34a 0%,
      #4ade80 ${Math.max(0, greenEnd - 2)}%,
      #86efac ${greenEnd}%,
      #7dd3fc ${blend}%,
      #2563eb 100%)`;
    return;
  }

  const r = red * 50;
  const y = warn * 22;
  barTrack.style.background = `linear-gradient(90deg,
    #dc2626 0%,
    #f87171 ${r}%,
    #facc15 ${r + y}%,
    #4ade80 ${r + y + 12}%,
    #16a34a 100%)`;
}

function setCopy(copy) {
  if (!copy) return;
  if (line1) line1.textContent = copy.line1 ?? "";
  if (line2) line2.textContent = copy.line2 ?? "";
}

function applyDetail(detail, labels) {
  if (!detail) return;
  const el = (id) => document.getElementById(id);
  if (el("titleIncluded")) el("titleIncluded").textContent = labels.includedUsage;
  if (el("thItem")) el("thItem").textContent = labels.item;
  if (el("thTokens")) el("thTokens").textContent = labels.tokens;
  if (el("thUsage")) el("thUsage").textContent = labels.usage;
  if (el("hint")) el("hint").textContent = labels.refreshHint;
  if (el("cycleRange") && detail.cycleLabel) {
    el("cycleRange").textContent = detail.cycleLabel;
  }
  if (el("stats") && detail.statsHtml) {
    el("stats").innerHTML = detail.statsHtml;
  }
  const body = el("usageBody");
  if (body && detail.rows) {
    body.innerHTML = detail.rows
      .map(
        (r) =>
          `<tr><td>${r.item}</td><td>${r.tokens}</td><td>${r.usage}</td></tr>`
      )
      .join("");
  }
}

function setExpanded(expanded) {
  document.body.classList.toggle("expanded", expanded);
  if (shell) shell.classList.toggle("expanded", expanded);
  const h = expanded ? PILL_H + PANEL_H : PILL_H;
  document.documentElement.style.height = `${h}px`;
  document.body.style.height = `${h}px`;
}

window.__cursorqApply = function (payload) {
  paintBar(payload.progress);
  setCopy(payload.copy);
  if (payload.detail && payload.labels) {
    applyDetail(payload.detail, payload.labels);
  }
  if (typeof payload.expanded === "boolean") {
    setExpanded(payload.expanded);
  }
};

if (btnToggle) {
  btnToggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.cursorq?.togglePanel?.();
  });
}

function bind() {
  if (!window.cursorq) return false;
  window.cursorq.onUpdate((payload) => window.__cursorqApply(payload));
  window.cursorq.ready();
  return true;
}

if (!bind()) {
  window.addEventListener("DOMContentLoaded", () => bind());
}
