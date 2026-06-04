import { buildPillBarGradient } from "@cursorq/core";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { formatCycleRange, t, type Locale } from "./i18n.js";
import { tierThemeClass } from "./tier-theme.js";
import {
  cycleMascotGif,
  initMascotGifs,
  reloadMascotGifsAfterContentUpdate,
} from "./mascot-gifs.js";
import {
  daysUrgencyPct,
  daysUrgencyTone,
  progressFromDebug,
  slidersFromMetrics,
  slidersFromScenario,
  type DebugScenarioId,
  type DebugSliders,
} from "./debug-mode.js";
import type { ProgressPaint } from "@cursorq/core";
import {
  clearDebugToolbar,
  formatTodayMetricValue,
  renderDebugMetrics,
  renderDebugToolbar,
} from "./debug-ui.js";

const PILL_H = 40;
const WIN_W = 174;
const PANEL_PAD = 24;
const PANEL_MIN = 240;
const PANEL_MAX = 520;
const POLL_MS = 30 * 60 * 1000;
const REEL_MS = 440;

let locale: Locale = "zh";
let expanded = false;
let jokeIndex = 0;
const openCats = new Set<string>();


interface JokeItem {
  line1: string;
  line2: string;
}

interface Payload {
  copy?: { line1: string; line2: string };
  progress?: {
    bluePct: number;
    redPct: number;
    warnYellowPct: number;
    paceStressPct?: number;
  };
  detail?: {
    cycleStartMs: number;
    cycleEndMs: number;
    planName?: string;
    categories?: {
      id: string;
      label: string;
      tokensLabel: string;
      usagePct: number;
      models: {
        model: string;
        tokensLabel: string;
        usagePct: number;
      }[];
    }[];
    metrics?: {
      todayUsedCents: number;
      dailyBudgetCents: number;
      todayUsedPct: number;
      cycleUsedCents: number;
      cycleRemainingCents: number;
      cycleLimitCents: number;
      cycleUsedPct: number;
      cycleRemainingPct: number;
      totalPercentUsed: number;
      daysLeft: number;
      daysLeftPct: number;
      displayMessage?: string;
      tierLabel?: string;
    };
  };
  locale?: Locale;
  jokePool?: JokeItem[];
  jokeIndex?: number;
  error?: string;
}

const LONG_PRESS_MS = 480;
const DRAG_MOVE_PX = 6;

function hasRealModels(
  models: { model: string }[] | undefined
): boolean {
  return (
    models?.some((m) => {
      const n = m.model.trim().toLowerCase();
      return n && n !== "default" && n !== "auto" && n !== "unknown";
    }) ?? false
  );
}

let lastPayload: Payload | null = null;
let debugMode = false;
let debugSliders: DebugSliders = {
  cycleUsedPct: 7,
  todayRatioPct: 100,
  daysUrgencyPct: 10,
  surplusBankCents: 0,
};

const el = (id: string) => document.getElementById(id);

function formatCentsUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function jokeOneLine(copy: { line1: string; line2?: string }): string {
  const a = (copy.line1 ?? "").trim();
  const b = (copy.line2 ?? "").trim();
  if (!b || b === "…") return a;
  if (!a) return b;
  return `${a} ${b}`;
}

function paintBar(p: Payload["progress"] | ProgressPaint | null | undefined) {
  const bar = el("bar");
  if (!bar || !p) return;
  const gradient = buildPillBarGradient({
    bluePct: p.bluePct ?? 0,
    redPct: p.redPct ?? 0,
    warnYellowPct: p.warnYellowPct ?? 0,
  });
  bar.style.background = gradient;
  bar.dataset.blue = String(Math.round((p.bluePct ?? 0) * 100));
  bar.dataset.red = String(Math.round((p.redPct ?? 0) * 100));
}

function metricRow(
  label: string,
  value: string,
  pct: number,
  tone: "green" | "blue" | "amber" | string
): string {
  const w = Math.min(100, Math.max(0, pct));
  return `
    <div class="metric">
      <div class="metric-head">
        <span class="metric-label">${label}</span>
        <span class="metric-val">${value}</span>
      </div>
      <div class="metric-track">
        <div class="metric-fill ${tone}" style="width:${w}%"></div>
      </div>
    </div>`;
}

function updateHintLine() {
  const hint = el("hint");
  if (!hint) return;
  hint.textContent = debugMode
    ? t(locale, "debugOn")
    : t(locale, "refreshHint");
  hint.classList.toggle("hint-debug", debugMode);
}

function renderMetrics(m: NonNullable<Payload["detail"]>["metrics"]) {
  const box = el("metrics");
  if (!box || !m) {
    if (box) box.innerHTML = "";
    return;
  }
  const tier = m.tierLabel ?? lastPayload?.detail?.planName ?? "—";
  const cyclePct = m.totalPercentUsed ?? m.cycleUsedPct;
  const tierTone = tierThemeClass(tier);
  const urgency = daysUrgencyPct(
    m.daysLeftPct ??
      Math.round((m.daysLeft / Math.max(1, m.cycleTotalDays ?? 30)) * 100)
  );
  const daysLabel = `${m.daysLeft}${locale === "zh" ? "天" : "d"}`;

  const toolbar = el("debugToolbar");

  if (debugMode) {
    renderDebugMetrics(
      box,
      locale,
      debugSliders,
      tier,
      tierTone,
      paintBar
    );
    if (toolbar) {
      renderDebugToolbar(toolbar, locale, applyDebugPreset, () => {
        if (debugMode) toggleDebugMode();
      });
    }
    return;
  }

  clearDebugToolbar(toolbar);

  box.innerHTML = [
    metricRow(t(locale, "total"), `${tier} · ${cyclePct}%`, cyclePct, tierTone),
    metricRow(
      t(locale, "today"),
      formatTodayMetricValue(
        locale,
        m.todayUsedCents,
        m.dailyBudgetCents
      ),
      m.todayUsedPct,
      "green"
    ),
    metricRow(
      t(locale, "daysLeft"),
      daysLabel,
      urgency,
      daysUrgencyTone(urgency)
    ),
  ].join("");
}

function applyDebugPreset(id: DebugScenarioId) {
  debugSliders = slidersFromScenario(id);
  if (lastPayload?.detail?.metrics) {
    renderMetrics(lastPayload.detail.metrics);
  } else {
    paintBar(progressFromDebug(debugSliders));
  }
  void remeasureExpandedPanel();
}

async function remeasureExpandedPanel() {
  if (!expanded) return;
  const reel = el("panelReel");
  if (!reel?.classList.contains("open")) return;
  const panelH = await measurePanelHeight();
  reel.style.maxHeight = `${panelH}px`;
  applyWindowHeight(PILL_H + panelH + 8);
}

function toggleDebugMode() {
  debugMode = !debugMode;
  if (debugMode && lastPayload?.detail?.metrics) {
    debugSliders = slidersFromMetrics(lastPayload.detail.metrics);
  }
  updateHintLine();
  if (lastPayload?.detail?.metrics) {
    renderMetrics(lastPayload.detail.metrics);
  } else {
    clearDebugToolbar(el("debugToolbar"));
  }
  if (debugMode) {
    paintBar(progressFromDebug(debugSliders));
  } else if (lastPayload?.progress) {
    paintBar(lastPayload.progress);
  }
  void remeasureExpandedPanel();
}

function renderCategories(
  categories: NonNullable<Payload["detail"]>["categories"]
) {
  const list = el("usageList");
  if (!list) return;
  if (!categories?.length) {
    list.innerHTML = `<p class="model-empty">${t(locale, "noModels")}</p>`;
    return;
  }

  list.innerHTML = categories
    .map((cat) => {
      const expandable = hasRealModels(cat.models);
      const open = expandable && openCats.has(cat.id);
      const modelsHtml = expandable
        ? cat.models
            .map(
              (m) => `
          <div class="model-row">
            <span class="model-name" title="${m.model}">${m.model}</span>
            <span class="model-tokens">${m.tokensLabel}</span>
            <span class="model-pct">${m.usagePct}%</span>
          </div>`
            )
            .join("")
        : "";

      const head = expandable
        ? `<button type="button" class="cat-head" data-cat-toggle="${cat.id}">
            <span><span class="cat-chevron">${open ? "▾" : "▸"}</span>${cat.label}</span>
            <span class="cat-tokens">${cat.tokensLabel}</span>
            <span class="cat-pct">${cat.usagePct}%</span>
          </button>`
        : `<div class="cat-head-static">
            <span>${cat.label}</span>
            <span class="cat-tokens">${cat.tokensLabel}</span>
            <span class="cat-pct">${cat.usagePct}%</span>
          </div>`;

      return `
        <div class="cat ${open ? "open" : ""}" data-cat="${cat.id}">
          ${head}
          ${expandable ? `<div class="cat-models">${modelsHtml}</div>` : ""}
        </div>`;
    })
    .join("");

  list.querySelectorAll("[data-cat-toggle]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const id = (btn as HTMLElement).dataset.catToggle!;
      if (openCats.has(id)) openCats.delete(id);
      else openCats.add(id);
      renderCategories(categories);
      if (expanded) {
        void measurePanelHeight().then((panelH) => {
          applyWindowHeight(PILL_H + panelH);
        });
      }
    });
  });
}

function applyCopy(copy: { line1: string; line2?: string }) {
  const line = el("jokeLine");
  if (line) line.textContent = jokeOneLine(copy);
}

function rotateJokeLocal() {
  const pool = lastPayload?.jokePool;
  if (!pool?.length) return;
  jokeIndex = (jokeIndex + 1) % pool.length;
  applyCopy(pool[jokeIndex]!);
}

function render(data: Payload) {
  lastPayload = data;
  if (data.locale) locale = data.locale;
  if (typeof data.jokeIndex === "number") jokeIndex = data.jokeIndex;

  updateHintLine();

  applyCopy(data.copy ?? { line1: "连接中", line2: "…" });

  const detail = data.detail;
  const panelTier = el("panelTier");
  if (panelTier) {
    const tier =
      detail?.metrics?.tierLabel ?? detail?.planName ?? "—";
    panelTier.textContent = tier;
    panelTier.className = `panel-tier ${tierThemeClass(tier)}`;
  }
  if (el("cycleRange")) {
    el("cycleRange")!.textContent = detail
      ? formatCycleRange(locale, detail.cycleStartMs, detail.cycleEndMs)
      : "—";
  }
  renderMetrics(detail?.metrics);
  renderCategories(detail?.categories);

  if (debugMode) {
    paintBar(progressFromDebug(debugSliders));
  } else {
    paintBar(data.progress);
  }
}

async function measurePanelHeight(): Promise<number> {
  const reel = el("panelReel");
  const inner = el("panelInner");
  if (!reel || !inner) return PANEL_MIN;
  const prev = reel.style.maxHeight;
  reel.style.maxHeight = "none";
  const h = inner.scrollHeight + PANEL_PAD;
  reel.style.maxHeight = prev;
  return Math.min(PANEL_MAX, Math.max(PANEL_MIN, h));
}

function applyWindowHeight(h: number) {
  document.documentElement.style.height = `${h}px`;
  document.body.style.minHeight = `${h}px`;
  void getCurrentWindow().setSize(new LogicalSize(WIN_W, h));
}

let expandBusy = false;

function animateReelHeight(
  reel: HTMLElement,
  panelH: number,
  opening: boolean
): Promise<void> {
  const gap = 8;
  const fromWin = opening ? PILL_H : PILL_H + panelH + gap;
  const toWin = opening ? PILL_H + panelH + gap : PILL_H;
  const start = performance.now();

  return new Promise((resolve) => {
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / REEL_MS);
      const ease = 1 - Math.pow(1 - t, 3);
      const reelH = opening ? panelH * ease : panelH * (1 - ease);
      reel.style.maxHeight = `${reelH}px`;
      applyWindowHeight(Math.round(fromWin + (toWin - fromWin) * ease));
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

async function setExpanded(on: boolean) {
  if (expandBusy || on === expanded) return;
  const reel = el("panelReel");
  const shell = el("shell");
  if (!reel) return;

  expandBusy = true;
  try {
    if (on) {
      expanded = true;
      shell?.classList.add("expanded");
      render(lastPayload ?? {});
      const panelH = await measurePanelHeight();

      reel.classList.add("open");
      reel.style.maxHeight = "0px";
      applyWindowHeight(PILL_H);
      await animateReelHeight(reel, panelH, true);
    } else {
      expanded = false;
      const panelH = await measurePanelHeight();
      await animateReelHeight(reel, panelH, false);
      reel.classList.remove("open");
      reel.style.maxHeight = "0px";
      shell?.classList.remove("expanded");
      applyWindowHeight(PILL_H);
    }
  } finally {
    expandBusy = false;
  }
}

async function refresh(jokeIdx?: number) {
  applyCopy({ line1: "拉取中", line2: "…" });
  try {
    const raw = await invoke<string>("refresh_usage", {
      jokeIndex: jokeIdx ?? jokeIndex,
    });
    const data = JSON.parse(raw) as Payload;
    if (data.error === "not_logged_in") {
      render({ copy: { line1: "请先登录", line2: "Cursor" } });
      return;
    }
    render(data);
    if (expanded) {
      const reel = el("panelReel");
      const panelH = await measurePanelHeight();
      if (reel) {
        reel.style.maxHeight = `${panelH}px`;
        applyWindowHeight(PILL_H + panelH + 8);
      }
    }
  } catch (e) {
    render({
      copy: {
        line1: "刷新失败",
        line2: String(e).slice(0, 8),
      },
    });
  }
}

function bindInteractions() {
  const pill = el("pill");
  const jokeLine = el("jokeLine");
  const mascotWrap = el("mascotWrap");
  if (!pill) return;

  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressPointerUntil = 0;
  let dragging = false;
  let pointerDown: { x: number; y: number } | null = null;

  const clearPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  };

  const startDrag = () => {
    if (dragging) return;
    dragging = true;
    suppressPointerUntil = Date.now() + 450;
    void getCurrentWindow().startDragging();
  };

  const shouldIgnoreTap = () =>
    dragging || Date.now() < suppressPointerUntil;

  pill.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return;
    dragging = false;
    pointerDown = { x: ev.clientX, y: ev.clientY };
    clearPress();
    pressTimer = setTimeout(startDrag, LONG_PRESS_MS);
  });

  window.addEventListener("mousemove", (ev) => {
    if (!pointerDown || dragging) return;
    const dx = ev.clientX - pointerDown.x;
    const dy = ev.clientY - pointerDown.y;
    if (Math.hypot(dx, dy) >= DRAG_MOVE_PX) {
      clearPress();
      startDrag();
    }
  });

  window.addEventListener("mouseup", () => {
    clearPress();
    pointerDown = null;
    window.setTimeout(() => {
      dragging = false;
    }, 320);
  });

  let blockMascotClickUntil = 0;

  mascotWrap?.addEventListener("dblclick", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    blockMascotClickUntil = Date.now() + 450;
    void cycleMascotGif();
  });

  mascotWrap?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (shouldIgnoreTap() || Date.now() < blockMascotClickUntil) return;
    void setExpanded(!expanded);
  });

  jokeLine?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (shouldIgnoreTap()) return;
    rotateJokeLocal();
  });

  pill.addEventListener("dblclick", (ev) => {
    ev.preventDefault();
    if (shouldIgnoreTap()) return;
    void setExpanded(!expanded);
  });

  const hint = el("hint");
  let hintClicks = 0;
  let hintClickTimer: ReturnType<typeof setTimeout> | null = null;
  hint?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (debugMode) {
      toggleDebugMode();
      return;
    }
    hintClicks += 1;
    if (hintClickTimer) clearTimeout(hintClickTimer);
    hintClickTimer = setTimeout(() => {
      hintClicks = 0;
      hintClickTimer = null;
    }, 500);
    if (hintClicks >= 3) {
      hintClicks = 0;
      if (hintClickTimer) clearTimeout(hintClickTimer);
      hintClickTimer = null;
      toggleDebugMode();
    }
  });
}

async function initWindow() {
  const win = getCurrentWindow();
  await win.setShadow(false);
  document.documentElement.style.height = `${PILL_H}px`;
  document.body.style.minHeight = `${PILL_H}px`;
  document.addEventListener("contextmenu", (ev) => ev.preventDefault());
  await initMascotGifs();
}

bindInteractions();
void initWindow();
void listen("cursorq:refresh", () => refresh());
void listen("cursorq:content-updated", () => {
  void reloadMascotGifsAfterContentUpdate();
});
setInterval(() => void refresh(), POLL_MS);
void refresh();
