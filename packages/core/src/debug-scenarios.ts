import {
  computeDailyBudgetCents,
  computeProgress,
  fairDailyCents,
} from "./budget.js";
import type { AppState, PeriodUsage, ProgressPaint } from "./types.js";

export type DebugScenarioId = "holiday" | "doneToday" | "overPace";

const LIMIT = 40_000;
export const DEBUG_AS_OF_MS = Date.UTC(2026, 5, 4, 12, 0, 0);
const CYCLE_START = DEBUG_AS_OF_MS - 10 * 86_400_000;
const CYCLE_END = DEBUG_AS_OF_MS + 20 * 86_400_000;

function periodFixture(
  remaining: number,
  includedSpend: number
): PeriodUsage {
  return {
    billingCycleStart: CYCLE_START,
    billingCycleEnd: CYCLE_END,
    membershipType: "ultra",
    planUsage: {
      limit: LIMIT,
      remaining,
      includedSpend,
      totalSpend: includedSpend,
      totalPercentUsed: Math.round((includedSpend / LIMIT) * 1000) / 10,
    },
  };
}

const EMPTY_STATE: AppState = { surplusBankCents: 0, snapshots: [] };

function buildDoneTodayScenario(): {
  period: PeriodUsage;
  state: AppState;
  todayUsedCents: number;
} {
  const fair = fairDailyCents(LIMIT, CYCLE_START, CYCLE_END);
  const elapsedDays = 10;
  const includedSpend = fair * elapsedDays;
  const remaining = LIMIT - includedSpend;
  return {
    period: periodFixture(remaining, includedSpend),
    state: EMPTY_STATE,
    todayUsedCents: fair,
  };
}

const DONE_TODAY = buildDoneTodayScenario();
const FAIR = fairDailyCents(LIMIT, CYCLE_START, CYCLE_END);

/** 典型场景：与 computeProgress 一致，供调试按钮与单测 */
export const DEBUG_SCENARIOS: Record<
  DebugScenarioId,
  { period: PeriodUsage; state: AppState; todayUsedCents: number }
> = {
  holiday: {
    period: periodFixture(36_000, 4_000),
    state: { surplusBankCents: 2_000, snapshots: [] },
    todayUsedCents: 120,
  },
  /** 下班：周期节奏正常，今日用量 = 周期公平日预算（追平均值，非超支） */
  doneToday: DONE_TODAY,
  /** 超支：周期偏紧 + 今日超过 2 倍日预算 → 胶囊红（周期也紧张才红） */
  overPace: (() => {
    const daily = computeDailyBudgetCents(4_000, CYCLE_END);
    return {
      period: periodFixture(4_000, 36_000),
      state: EMPTY_STATE,
      todayUsedCents: Math.round(daily * 2.5),
    };
  })(),
};

export function progressForDebugScenario(id: DebugScenarioId): ProgressPaint {
  const s = DEBUG_SCENARIOS[id];
  const daily = computeDailyBudgetCents(
    s.period.planUsage.remaining,
    s.period.billingCycleEnd
  );
  return computeProgress(s.period, s.state, s.todayUsedCents, daily, {
    asOfMs: DEBUG_AS_OF_MS,
  });
}

export { FAIR as DEBUG_FAIR_DAILY_CENTS };
