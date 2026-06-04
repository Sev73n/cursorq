import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  screen,
  type NativeImage,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  configureSqlWasm,
  getValidAccessToken,
  fetchCurrentPeriodUsage,
  fetchPlanInfo,
  loadAppState,
  saveAppState,
  settleYesterdayBank,
  ensureTodaySnapshot,
  todayUsedCents,
  computeDailyBudgetCents,
  computeProgress,
  pickWidgetState,
  selectCopy,
  todayKey,
  buildUsageDetail,
  formatCentsUsd,
  type JokeEntry,
  type StateEntry,
  type ProgressPaint,
  type WidgetCopy,
  type UsageDetail,
  type Locale,
} from "@cursorq/core";
import {
  WINDOW_WIDTH,
  WINDOW_HEIGHT_COLLAPSED,
  WINDOW_HEIGHT_EXPANDED,
} from "./capsule-size.js";
import { t, formatCycleRange, type I18nKey } from "./i18n.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLL_MS = 30 * 60 * 1000;
const COPY_ROTATE_MS = 10_000;

let tray: Tray | null = null;
let capsuleWin: BrowserWindow | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let copyTimer: ReturnType<typeof setInterval> | null = null;
let jokeIndex = 0;
let lastProgress: ProgressPaint | null = null;
let lastCopy: WidgetCopy = { line1: "连接中", line2: "…", state: "idle" };
let lastDetail: UsageDetail | null = null;
let jokes: JokeEntry[] = [];
let states: StateEntry[] = [];
let rendererReady = false;
let panelExpanded = false;
let locale: Locale = "zh";

function dataDir(): string {
  return path.join(app.getPath("userData"), "cursorq");
}

function assetsDir(): string {
  return path.join(__dirname, "assets");
}

function loadCopyPools(): void {
  const base = assetsDir();
  jokes = JSON.parse(
    fs.readFileSync(path.join(base, "copy", "jokes.json"), "utf8")
  ) as JokeEntry[];
  states = JSON.parse(
    fs.readFileSync(path.join(base, "copy", "states.json"), "utf8")
  ) as StateEntry[];
}

function createTrayIcon(): NativeImage {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - 7.5;
      const dy = y - 7.5;
      if (dx * dx + dy * dy <= 40) {
        buf[i] = 56;
        buf[i + 1] = 189;
        buf[i + 2] = 248;
        buf[i + 3] = 255;
      }
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function isCapsuleVisible(): boolean {
  return (
    capsuleWin !== null &&
    !capsuleWin.isDestroyed() &&
    capsuleWin.isVisible()
  );
}

function notifyCapsuleState(label: "已显示" | "已隐藏"): void {
  if (tray) {
    tray.setToolTip(`CursorQ — 胶囊${label}`);
  }
}

function toggleCapsuleVisibility(): void {
  if (!capsuleWin || capsuleWin.isDestroyed()) return;
  if (isCapsuleVisible()) {
    capsuleWin.hide();
    notifyCapsuleState("已隐藏");
  } else {
    capsuleWin.show();
    capsuleWin.moveTop();
    notifyCapsuleState("已显示");
  }
  refreshTrayMenu();
}

function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu());
}

function resizeWindowToContent(expanded: boolean): void {
  if (!capsuleWin || capsuleWin.isDestroyed()) return;
  const h = expanded ? WINDOW_HEIGHT_EXPANDED : WINDOW_HEIGHT_COLLAPSED;
  const bounds = capsuleWin.getBounds();
  capsuleWin.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: WINDOW_WIDTH,
    height: h,
  });
}

function setPanelExpanded(expanded: boolean): void {
  panelExpanded = expanded;
  resizeWindowToContent(expanded);
  void pushToRenderer();
}

function buildLabels(): Record<I18nKey, string> {
  return {
    includedUsage: t(locale, "includedUsage"),
    cycle: t(locale, "cycle"),
    item: t(locale, "item"),
    tokens: t(locale, "tokens"),
    usage: t(locale, "usage"),
    today: t(locale, "today"),
    dailyBudget: t(locale, "dailyBudget"),
    remaining: t(locale, "remaining"),
    daysLeft: t(locale, "daysLeft"),
    refreshHint: t(locale, "refreshHint"),
  };
}

function buildDetailView(detail: UsageDetail) {
  const labels = buildLabels();
  const cycleLabel = formatCycleRange(
    locale,
    detail.cycleStartMs,
    detail.cycleEndMs
  );
  const statsHtml = `
    <div><span>${labels.today}</span><strong>${formatCentsUsd(detail.todayUsedCents)} / ${formatCentsUsd(detail.dailyBudgetCents)}</strong></div>
    <div><span>${labels.remaining}</span><strong>${formatCentsUsd(detail.remainingCents)}</strong></div>
    <div><span>${labels.daysLeft}</span><strong>${detail.daysLeft}</strong></div>
    <div><span>${labels.usage}</span><strong>${detail.totalPercentUsed}%</strong></div>
  `;
  return {
    cycleLabel,
    statsHtml,
    rows: detail.rows.map((r) => ({
      item: r.item,
      tokens: r.tokensLabel,
      usage: `${r.usagePct}%`,
    })),
    planName: detail.planName,
  };
}

function buildPayload() {
  return {
    progress: lastProgress,
    copy: lastCopy,
    detail: lastDetail ? buildDetailView(lastDetail) : null,
    labels: buildLabels(),
    locale,
    expanded: panelExpanded,
  };
}

function createCapsuleWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  capsuleWin = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT_COLLAPSED,
    x: Math.round((width - WINDOW_WIDTH) / 2),
    y: Math.round(height * 0.12),
    frame: false,
    transparent: false,
    backgroundColor: "#0f172a",
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  capsuleWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  capsuleWin.loadFile(path.join(__dirname, "renderer", "capsule.html"));

  capsuleWin.webContents.once("did-finish-load", () => {
    setTimeout(() => void refreshUsage(), 200);
  });
}

function onRendererReady(): void {
  if (rendererReady) return;
  rendererReady = true;
  void pushToRenderer();
  void refreshUsage();
}

async function pushToRenderer(): Promise<void> {
  if (!capsuleWin || capsuleWin.isDestroyed()) return;
  const payload = buildPayload();
  if (rendererReady) {
    capsuleWin.webContents.send("cursorq:update", payload);
  }
  const script = `typeof window.__cursorqApply==='function'&&window.__cursorqApply(${JSON.stringify(payload)});`;
  try {
    if (!capsuleWin.webContents.isLoading()) {
      await capsuleWin.webContents.executeJavaScript(script, true);
    }
  } catch {
    /* ignore */
  }
}

function markNotifyState(
  state: ReturnType<typeof loadAppState>,
  widgetState: string
): ReturnType<typeof loadAppState> {
  const key = todayKey();
  const notify = { ...(state.lastNotify ?? {}) };
  const tag = `${key}:${widgetState}`;
  if (notify[tag]) return state;
  notify[tag] = new Date().toISOString();
  return { ...state, lastNotify: notify };
}

function shortErr(msg: string): WidgetCopy {
  const one = msg.slice(0, 10);
  const two = msg.length > 10 ? msg.slice(10, 20) : "…";
  return { line1: one || "错误", line2: two, state: "idle" };
}

async function refreshUsage(): Promise<void> {
  let state = loadAppState(dataDir());
  locale = state.locale ?? "zh";
  lastCopy = { line1: "拉取用量", line2: "…", state: "idle" };
  await pushToRenderer();

  let auth;
  try {
    auth = await getValidAccessToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "读登录失败";
    console.error("[cursorq] auth", e);
    lastCopy = shortErr(msg);
    lastProgress = null;
    lastDetail = null;
    await pushToRenderer();
    return;
  }

  if (!auth) {
    lastCopy = { line1: "请先登录", line2: "Cursor", state: "idle" };
    lastProgress = null;
    lastDetail = null;
    await pushToRenderer();
    return;
  }

  try {
    const plan = await fetchPlanInfo(auth.accessToken);
    const period = await fetchCurrentPeriodUsage(auth.accessToken);
    state = settleYesterdayBank(state, period, { honorWeekends: true });
    state = ensureTodaySnapshot(state, period);
    const used = todayUsedCents(state, period.planUsage.includedSpend);
    const daily = computeDailyBudgetCents(
      period.planUsage.remaining,
      period.billingCycleEnd
    );
    const progress = computeProgress(period, state, used, daily);
    const widgetState = pickWidgetState(progress);
    state = markNotifyState(state, widgetState);
    saveAppState(dataDir(), { ...state, locale });

    lastProgress = progress;
    lastDetail = await buildUsageDetail(
      period,
      plan,
      used,
      daily,
      progress.daysLeft,
      auth.accessToken,
      locale
    );
    const { copy, index } = selectCopy(jokes, states, widgetState, jokeIndex);
    jokeIndex = index;
    lastCopy = copy;

    if (tray) {
      const pctBlue = Math.round(progress.bluePct * 100);
      const dayPct = Math.round((used / Math.max(1, daily)) * 100);
      tray.setToolTip(
        `CursorQ · ${plan.planName}\n${locale === "zh" ? "蓝" : "Blue"} ${pctBlue}% · ${locale === "zh" ? "今日" : "Today"} ${dayPct}%`
      );
    }
    await pushToRenderer();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "API失败";
    console.error("[cursorq] api", e);
    lastCopy = shortErr(msg.replace(/\s+/g, "").slice(0, 20));
    lastProgress = null;
    lastDetail = null;
    await pushToRenderer();
  }
}

function rotateCopy(): void {
  if (!lastProgress) return;
  const widgetState = pickWidgetState(lastProgress);
  const { copy, index } = selectCopy(jokes, states, widgetState, jokeIndex);
  jokeIndex = index;
  lastCopy = copy;
  void pushToRenderer();
}

function setLocale(next: Locale): void {
  locale = next;
  const state = loadAppState(dataDir());
  saveAppState(dataDir(), { ...state, locale: next });
  void pushToRenderer();
  refreshTrayMenu();
}

function buildTrayMenu(): Menu {
  const visible = isCapsuleVisible();
  return Menu.buildFromTemplate([
    {
      label: visible ? "● 胶囊：已显示" : "○ 胶囊：已隐藏",
      enabled: false,
    },
    {
      label: visible ? "隐藏胶囊" : "显示胶囊",
      click: () => toggleCapsuleVisibility(),
    },
    { type: "separator" },
    {
      label: locale === "zh" ? "● 中文" : "○ 中文",
      click: () => setLocale("zh"),
    },
    {
      label: locale === "en" ? "● English" : "○ English",
      click: () => setLocale("en"),
    },
    { type: "separator" },
    { label: "立即刷新", click: () => void refreshUsage() },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]);
}

app.whenReady().then(() => {
  const wasmPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "node_modules",
    "sql.js",
    "dist",
    "sql-wasm.wasm"
  );
  if (fs.existsSync(wasmPath)) {
    configureSqlWasm(wasmPath);
  }

  const saved = loadAppState(dataDir());
  locale = saved.locale ?? "zh";

  ipcMain.on("cursorq:renderer-ready", () => onRendererReady());
  ipcMain.on("cursorq:toggle-panel", () => setPanelExpanded(!panelExpanded));

  loadCopyPools();
  createCapsuleWindow();

  tray = new Tray(createTrayIcon());
  tray.setToolTip("CursorQ — 胶囊已显示");
  refreshTrayMenu();
  tray.on("right-click", () => refreshTrayMenu());
  tray.on("double-click", () => {
    if (!capsuleWin) return;
    if (!isCapsuleVisible()) {
      capsuleWin.show();
      capsuleWin.moveTop();
      notifyCapsuleState("已显示");
    } else {
      capsuleWin.focus();
    }
    refreshTrayMenu();
  });

  pollTimer = setInterval(() => void refreshUsage(), POLL_MS);
  copyTimer = setInterval(rotateCopy, COPY_ROTATE_MS);
});

app.on("window-all-closed", () => {
  /* 托盘常驻 */
});

app.on("before-quit", () => {
  if (pollTimer) clearInterval(pollTimer);
  if (copyTimer) clearInterval(copyTimer);
});
