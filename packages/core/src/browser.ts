/** Browser-safe exports (no Node / sql.js). */
export {
  computeProgress,
  computeDailyBudgetCents,
  fairDailyCents,
  pacingStressPct,
  isTodayOverDaily,
  isCycleOverPace,
  cycleElapsedPct,
  PILL_RED_RATIO,
} from "./budget.js";
export * from "./pill-bar.js";
export * from "./pill-visual.js";
export * from "./debug-scenarios.js";
export type {
  AppState,
  PeriodUsage,
  ProgressPaint,
  PlanUsage,
} from "./types.js";
