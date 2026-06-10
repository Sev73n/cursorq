import { configureSqlWasm } from "@cursorq/core";
import {
  getValidAccessToken,
  fetchCurrentPeriodUsage,
  fetchPlanInfo,
  buildUsageDetail,
  computeDailyBudgetCents,
  computeProgress,
  pickWidgetState,
  selectCopy,
  todayUsedCents,
  repairCorruptTodaySnapshot,
  resolveTodayUsedCents,
  syncTodayBaseline,
  loadAppState,
  saveAppState,
  ensureTodaySnapshot,
  todayKey,
  settleYesterdayBank,
  fetchUsageEventsInCycle,
  fetchUsageEventsForDay,
  sumTodayChargedCents,
} from "@cursorq/core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CURSORQ_ROOT ?? path.join(__dirname, "..");
const copyDir = process.env.CURSORQ_COPY_DIR ?? path.join(root, "content/copy");
const fastRefresh = process.env.CURSORQ_FAST_REFRESH === "1";
const wasm = path.join(
  process.env.CURSORQ_ROOT
    ? path.join(root, "node_modules/sql.js/dist/sql-wasm.wasm")
    : path.join(__dirname, "../node_modules/sql.js/dist/sql-wasm.wasm")
);
if (fs.existsSync(wasm)) configureSqlWasm(wasm);

const dataDir = process.env.CURSORQ_DATA ?? path.join(__dirname, "../apps/tauri/.data");
const jokesPath = path.join(copyDir, "jokes.json");
const statesPath = path.join(copyDir, "states.json");
const jokes = JSON.parse(fs.readFileSync(jokesPath, "utf8"));
const states = JSON.parse(fs.readFileSync(statesPath, "utf8"));

let state = loadAppState(dataDir);
const locale = state.locale ?? "zh";
let jokeIndex = Number(process.env.JOKE_INDEX ?? state.jokeIndex ?? 0);

const auth = await getValidAccessToken();
if (!auth) {
  console.log(JSON.stringify({ error: "not_logged_in" }));
  process.exit(0);
}

const plan = await fetchPlanInfo(auth.accessToken);
const period = await fetchCurrentPeriodUsage(auth.accessToken);

state = settleYesterdayBank(state, period, { honorWeekends: true });

const daily = computeDailyBudgetCents(
  period.planUsage.remaining,
  period.billingCycleEnd
);
state = repairCorruptTodaySnapshot(
  state,
  period.planUsage.includedSpend,
  daily
);

let todayEvents = [];
try {
  todayEvents = await fetchUsageEventsForDay(auth.accessToken);
} catch {
  todayEvents = [];
}
const eventsToday = sumTodayChargedCents(todayEvents);
const day = todayKey();
const newCalendarDay =
  state.lastIncludedDate != null && state.lastIncludedDate !== day;
const carryUsed =
  newCalendarDay && state.lastIncludedSpend != null
    ? Math.max(0, period.planUsage.includedSpend - state.lastIncludedSpend)
    : 0;

state = ensureTodaySnapshot(state, period, {
  todaySpendCents: eventsToday,
  initialBaselineCents: newCalendarDay ? state.lastIncludedSpend : undefined,
});

const snapUsed = todayUsedCents(state, period.planUsage.includedSpend);
const used = resolveTodayUsedCents(
  snapUsed,
  Math.max(eventsToday, carryUsed),
  daily,
  period.planUsage.includedSpend,
  { dayScopedEvents: true }
);
state = syncTodayBaseline(state, period.planUsage.includedSpend, used);
state = {
  ...state,
  lastIncludedSpend: period.planUsage.includedSpend,
  lastIncludedDate: day,
};

let cycleEvents = [];
if (!fastRefresh && process.env.CURSORQ_FETCH_EVENTS === "1") {
  try {
    cycleEvents = await fetchUsageEventsInCycle(
      auth.accessToken,
      period.billingCycleStart,
      period.billingCycleEnd
    );
  } catch {
    cycleEvents = [];
  }
}

const progress = computeProgress(period, state, used, daily);
const widgetState = pickWidgetState(progress);
const { copy, index } = selectCopy(jokes, states, widgetState, jokeIndex);
state = { ...state, jokeIndex: index };
saveAppState(dataDir, state);

const detail = await buildUsageDetail(
  period,
  plan,
  used,
  daily,
  progress.daysLeft,
  auth.accessToken,
  locale,
  cycleEvents,
  fastRefresh ? { fetchEvents: false } : undefined
);

// jokePool 始终是 jokes，前端根据展开状态自行决定展示 jokes 还是 copy
const jokePool = jokes;

console.log(
  JSON.stringify({
    copy,
    progress,
    detail,
    planName: plan.planName,
    locale,
    widgetState,
    jokeIndex: index,
    jokePool,
  })
);
