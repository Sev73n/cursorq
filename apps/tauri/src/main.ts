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
import { daysUrgencyPct, daysUrgencyTone } from "./utils.js";
import type { ProgressPaint } from "@cursorq/core";
import {
  formatTodayMetricValue,
  formatTotalMetricValue,
} from "./format.js";
import {
  bindWindowChromeState,
  installWindowChromeGuard,
  queueStabilizeWindowChrome,
  stabilizeWindowChrome,
} from "./window-chrome.js";

const PILL_H = 44;
const WIN_W = 200;
/** 逻辑像素高度 */
let windowLogicalH = PILL_H;
const PANEL_PAD = 24;
const PANEL_MIN = 240;
const PANEL_MAX = 520;
const POLL_MS = 30 * 60 * 1000;
const REEL_GAP = 10;

let locale: Locale = "zh";
let expanded = false;
let jokeIndex = 0;
const openCats = new Set<string>();

bindWindowChromeState(() => ({ logicalH: windowLogicalH, expanded }));


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
      cycleTotalDays?: number;
      displayMessage?: string;
      tierLabel?: string;
    };
  };
  locale?: Locale;
  jokePool?: JokeItem[];
  jokeIndex?: number;
  error?: string;
}

type UsageCategory = NonNullable<
  NonNullable<Payload["detail"]>["categories"]
>[number];

const LONG_PRESS_MS = 480;
const DRAG_MOVE_PX = 6;

const USAGE_BUCKET_IDS = ["api", "auto_composer"] as const;

function isUsageBucketId(id: string): id is (typeof USAGE_BUCKET_IDS)[number] {
  return (USAGE_BUCKET_IDS as readonly string[]).includes(id);
}

function usageBucketLabel(id: string, fallback: string): string {
  if (id === "api") return "API";
  if (id === "auto_composer") return "Auto";
  return fallback;
}

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

function renderBucketModels(models: UsageCategory["models"]): string {
  if (!hasRealModels(models)) return "";
  return `<div class="usage-card-models">
    ${models
      .map((m) => {
        const n = m.model.trim().toLowerCase();
        if (!n || n === "default" || n === "auto" || n === "unknown") return "";
        return `<div class="model-row model-row--bucket">
          <span class="model-name" title="${m.model}">${m.model}</span>
          <span class="model-pct">${m.usagePct}%</span>
        </div>`;
      })
      .join("")}
  </div>`;
}

let lastPayload: Payload | null = null;

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
  const red = p.redPct ?? 0;
  bar.style.backgroundColor = red > 0.02 ? "#9a3412" : "#16a34a";
  bar.style.background = gradient;
  bar.dataset.blue = String(Math.round((p.bluePct ?? 0) * 100));
  bar.dataset.red = String(Math.round(red * 100));
  queueStabilizeWindowChrome();
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
  hint.textContent = t(locale, "dataSource");
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

  const cycleStart = lastPayload?.detail?.cycleStartMs ?? 0;
  const cycleEnd = lastPayload?.detail?.cycleEndMs ?? 0;
  const totalLabel =
    cycleStart > 0 && cycleEnd > cycleStart
      ? formatTotalMetricValue(locale, tier, cyclePct, cycleStart, cycleEnd)
      : `${tier} · ${cyclePct}%`;

  // 计算日均应为百分比
  const expectedPct = cycleStart > 0 && cycleEnd > cycleStart
    ? Math.round(((cycleEnd - Date.now()) / (cycleEnd - cycleStart)) * 100)
    : Math.round((m.daysLeft / Math.max(1, m.cycleTotalDays ?? 30)) * 100);

  const daysUrgencyClass = daysUrgencyTone(urgency).replace("days-", "");

  box.innerHTML = [
    metricRow(t(locale, "total"), totalLabel, cyclePct, tierTone),
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
    `<div class="mini-cards">
      <div class="mini-card">
        <span class="mini-card-label">${t(locale, "expectedPct")}</span>
        <span class="mini-card-value">${expectedPct}%</span>
      </div>
      <div class="mini-card">
        <span class="mini-card-label">${t(locale, "daysLeft")}</span>
        <span class="mini-card-value mini-card-value--${daysUrgencyClass}">${daysLabel}</span>
      </div>
    </div>`,
  ].join("");
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

  const buckets = USAGE_BUCKET_IDS.map((id) =>
    categories.find((c) => c.id === id)
  ).filter((c): c is NonNullable<typeof c> => !!c);
  const others = categories.filter((c) => !isUsageBucketId(c.id));

  const bucketHtml = buckets.length
    ? `<div class="usage-buckets">${buckets
        .map((cat) => {
          const expandable = hasRealModels(cat.models);
          const open = expandable && openCats.has(cat.id);
          const label = usageBucketLabel(cat.id, cat.label);
          const chevron = expandable
            ? `<span class="usage-card-chevron">${open ? "▾" : "▸"}</span>`
            : "";
          const headInner = `
            <span class="usage-card-label">${chevron}${label}</span>
            <span class="usage-card-pct">${cat.usagePct}%</span>`;
          const head = expandable
            ? `<button type="button" class="usage-card-head" data-cat-toggle="${cat.id}">${headInner}</button>`
            : `<div class="usage-card-head usage-card-head--static">${headInner}</div>`;
          return `<div class="usage-card ${open ? "open" : ""}" data-cat="${cat.id}">
            ${head}
            ${renderBucketModels(cat.models)}
          </div>`;
        })
        .join("")}</div>`
    : "";

  const otherHtml = others
    .map((cat) => {
      const expandable = hasRealModels(cat.models);
      const open = expandable && openCats.has(cat.id);
      const modelsHtml = expandable
        ? cat.models
            .map((m) => {
              const n = m.model.trim().toLowerCase();
              if (!n || n === "default" || n === "auto" || n === "unknown") {
                return "";
              }
              return `
          <div class="model-row">
            <span class="model-name" title="${m.model}">${m.model}</span>
            <span class="model-tokens">${m.tokensLabel}</span>
            <span class="model-pct">${m.usagePct}%</span>
          </div>`;
            })
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

  list.innerHTML = bucketHtml + otherHtml;

  list.querySelectorAll("[data-cat-toggle]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const id = (btn as HTMLElement).dataset.catToggle!;
      if (openCats.has(id)) openCats.delete(id);
      else openCats.add(id);
      renderCategories(categories);
      if (expanded) {
        void measurePanelHeight().then((panelH) => {
          const fullH = PILL_H + panelH + REEL_GAP;
          void applyWindowHeight(fullH);
        });
      }
    });
  });
}

/** 打字机效果：line1 → 思考...×3 → line2 → 循环 */
let _twTimer: ReturnType<typeof setTimeout> | null = null;
let _twRaf: number | null = null;
let _twSessionId = 0; // 每次新内容递增，用于取消旧动画

function _twCancel() {
  _twSessionId++;
  if (_twRaf !== null) { cancelAnimationFrame(_twRaf); _twRaf = null; }
  if (_twTimer !== null) { clearTimeout(_twTimer); _twTimer = null; }
}

/** 逐字打出 text，完成后调 onDone */
function _typeText(
  el: HTMLElement,
  text: string,
  sid: number,
  onDone: () => void
) {
  const charMs = text.length > 8 ? 42 : 60;
  let i = 0;
  let last = 0;
  el.classList.add("typing");

  function step(ts: number) {
    if (_twSessionId !== sid) return;
    if (ts - last >= charMs) {
      last = ts;
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        el.classList.remove("typing");
        _twRaf = null;
        onDone();
        return;
      }
    }
    _twRaf = requestAnimationFrame(step);
  }
  _twRaf = requestAnimationFrame(step);
}

/** 显示思考动画：... 循环 repeat 次后调 onDone */
function _thinkDots(
  el: HTMLElement,
  base: string,
  sid: number,
  repeat: number,
  onDone: () => void
) {
  if (_twSessionId !== sid) return;
  let count = 0;
  let dots = 0;
  const TICK = 300; // 每个点间隔 ms

  function tick() {
    if (_twSessionId !== sid) return;
    dots = (dots % 3) + 1;
    el.textContent = base + ".".repeat(dots);
    count++;
    if (count >= repeat * 3) {
      el.textContent = base;
      onDone();
    } else {
      _twTimer = setTimeout(tick, TICK);
    }
  }
  _twTimer = setTimeout(tick, TICK);
}

/** 主入口：新文案到来时调用 */
function typewriterSet(target: HTMLElement, copy: { line1: string; line2?: string }) {
  const line1 = (copy.line1 ?? "").trim();
  const line2 = (copy.line2 ?? "").trim();
  const hasLine2 = line2 && line2 !== "…";

  // 如果只有一行，直接打出来不循环
  if (!hasLine2) {
    const prev = target.dataset.twLine1;
    if (prev === line1 && target.textContent === line1) return;
    target.dataset.twLine1 = line1;
    target.dataset.twLine2 = "";
    _twCancel();
    const sid = _twSessionId;
    target.textContent = "";
    _typeText(target, line1, sid, () => {});
    return;
  }

  // 两行内容：检查是否与上一次相同，相同则不重置
  if (target.dataset.twLine1 === line1 && target.dataset.twLine2 === line2) return;
  target.dataset.twLine1 = line1;
  target.dataset.twLine2 = line2;

  _twCancel();
  const sid = _twSessionId;

  function runLine1() {
    if (_twSessionId !== sid) return;
    target.textContent = "";
    _typeText(target, line1, sid, () => {
      // 打完 line1，等 2 秒
      if (_twSessionId !== sid) return;
      _twTimer = setTimeout(() => {
        // 思考动画：... 循环 3 次
        _thinkDots(target, line1, sid, 3, () => {
          // 清空，打 line2
          if (_twSessionId !== sid) return;
          target.textContent = "";
          _typeText(target, line2, sid, () => {
            // line2 打完，等 3 秒后回到 line1
            if (_twSessionId !== sid) return;
            _twTimer = setTimeout(runLine1, 3000);
          });
        });
      }, 2000);
    });
  }

  runLine1();
}

function applyCopy(copy: { line1: string; line2?: string }) {
  const line = el("jokeLine");
  if (line) typewriterSet(line, copy);
  queueStabilizeWindowChrome();
}

function rotateJokeLocal() {
  const pool = lastPayload?.jokePool;
  if (!pool?.length) return;
  // 随机选一条不同于当前的
  if (pool.length === 1) {
    applyCopy(pool[0]!);
    return;
  }
  let next = jokeIndex;
  while (next === jokeIndex) {
    next = Math.floor(Math.random() * pool.length);
  }
  jokeIndex = next;
  applyCopy(pool[jokeIndex]!);
}

function render(data: Payload) {
  lastPayload = data;
  if (data.locale) locale = data.locale;
  if (typeof data.jokeIndex === "number") jokeIndex = data.jokeIndex;

  updateHintLine();

  // 面板展开时随机展示 joke，收起时展示状态文案
  const pool = data.jokePool;
  if (expanded && pool?.length) {
    jokeIndex = Math.floor(Math.random() * pool.length);
    applyCopy(pool[jokeIndex]!);
  } else {
    applyCopy(data.copy ?? { line1: "连接中", line2: "…" });
  }

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

  paintBar(data.progress);
  queueStabilizeWindowChrome();
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

async function applyWindowHeight(h: number) {
  windowLogicalH = h;
  document.documentElement.style.height = `${h}px`;
  document.body.style.height = `${h}px`;
  document.body.style.minHeight = `${h}px`;
  document.body.style.maxHeight = `${h}px`;
  const shell = el("shell");
  const capsuleOnly = !expanded || h <= PILL_H + 4;
  document.documentElement.classList.toggle("pill-only", capsuleOnly);
  if (shell) {
    shell.classList.toggle("expanded", expanded && h > PILL_H + 4);
  }
  await getCurrentWindow().setSize(new LogicalSize(WIN_W, h));
  queueStabilizeWindowChrome(16);
}

let expandBusy = false;
let jokeRotateTimer: ReturnType<typeof setInterval> | null = null;
const JOKE_ROTATE_MS = 5000;

function startJokeRotate() {
  stopJokeRotate();
  jokeRotateTimer = setInterval(() => rotateJokeLocal(), JOKE_ROTATE_MS);
}

function stopJokeRotate() {
  if (jokeRotateTimer) {
    clearInterval(jokeRotateTimer);
    jokeRotateTimer = null;
  }
}

/** 展开/收起：无动画，一次设好高度，避免卷轴动画触发 WebView 白边 */
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
      const fullH = PILL_H + panelH + REEL_GAP;
      reel.classList.add("open");
      reel.style.maxHeight = `${panelH}px`;
      await applyWindowHeight(fullH);
      await stabilizeWindowChrome();
      startJokeRotate();
    } else {
      expanded = false;
      reel.classList.remove("open");
      reel.style.maxHeight = "0px";
      shell?.classList.remove("expanded");
      stopJokeRotate();
      // 收起时切回状态文案
      if (lastPayload?.copy) applyCopy(lastPayload.copy);
      await applyWindowHeight(PILL_H);
      await stabilizeWindowChrome();
    }
  } finally {
    expandBusy = false;
  }
}

let refreshBusy = false;

async function refresh(jokeIdx?: number) {
  if (refreshBusy) return;
  refreshBusy = true;
  applyCopy({ line1: "订阅识别中", line2: "…" });
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
        await applyWindowHeight(PILL_H + panelH + REEL_GAP);
      }
    }
    await stabilizeWindowChrome();
  } catch (e) {
    render({
      copy: {
        line1: "刷新失败",
        line2: String(e).slice(0, 8),
      },
    });
  } finally {
    refreshBusy = false;
    queueStabilizeWindowChrome();
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
    void (async () => {
      await stabilizeWindowChrome();
      try {
        await invoke("start_drag_capsule");
      } catch {
        await getCurrentWindow().startDragging();
      }
    })();
  };

  const shouldIgnoreTap = () =>
    dragging || Date.now() < suppressPointerUntil;

  pill.addEventListener("mousedown", (ev) => {
    if (ev.button !== 0) return;
    dragging = false;
    pointerDown = { x: ev.clientX, y: ev.clientY };
    clearPress();
    void stabilizeWindowChrome();
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
      queueStabilizeWindowChrome();
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
}

async function initWindow() {
  installWindowChromeGuard();
  await getCurrentWindow().setFocusable(false);
  await applyWindowHeight(PILL_H);
  const wantVisible = await invoke<boolean>("get_capsule_visible").catch(() => true);
  if (wantVisible) {
    await stabilizeWindowChrome();
    try {
      await invoke("show_main_inactive");
    } catch {
      await getCurrentWindow().show();
    }
    await stabilizeWindowChrome();
  } else {
    try {
      await invoke("set_capsule_visible_cmd", { visible: false });
    } catch {
      await getCurrentWindow().hide();
    }
  }
  document.addEventListener("contextmenu", (ev) => ev.preventDefault());
  await initMascotGifs();
}

bindInteractions();
void initWindow().then(() => void refresh());
void listen("cursorq:refresh", () => refresh());
void listen("cursorq:content-updated", () => {
  void reloadMascotGifsAfterContentUpdate().then(() => stabilizeWindowChrome());
});
void listen("cursorq:fix-chrome", () => {
  void stabilizeWindowChrome();
});
void listen("cursorq:window-shown", () => {
  void stabilizeWindowChrome();
});
setInterval(() => void refresh(), POLL_MS);
