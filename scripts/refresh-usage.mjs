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
  loadAppState,
  saveAppState,
  ensureTodaySnapshot,
  settleYesterdayBank,
} from "@cursorq/core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CURSORQ_ROOT ?? path.join(__dirname, "..");
const copyDir = process.env.CURSORQ_COPY_DIR ?? path.join(root, "assets/copy");
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
state = ensureTodaySnapshot(state, period);
const used = todayUsedCents(state, period.planUsage.includedSpend);
const daily = computeDailyBudgetCents(
  period.planUsage.remaining,
  period.billingCycleEnd
);
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
  locale
);

const jokePool =
  widgetState !== "idle"
    ? states.filter((s) => s.state === widgetState)
    : jokes;

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
