import {
  buildProgressPaint,
  computeDailyBudgetCents,
  pacingStressPct,
  progressForDebugScenario,
  todayBarWidthPct,
  todayRatioPercent,
  type DebugScenarioId,
} from "@cursorq/core";
import type { ProgressPaint } from "@cursorq/core";

export type { DebugScenarioId };

/**
 * 调试滑条 ↔ 胶囊（与正式逻辑同一 buildProgressPaint）
 *
 * - cycleUsedPct：周期已用 % → 剩余越少，蓝越少
 * - todayRatioPct：今日 / 日预算 %（0–300，200+=胶囊变红）
 * - daysUrgencyPct：剩余天数紧迫度 → 只改面板第三条，不改胶囊
 */
export interface DebugSliders {
  cycleUsedPct: number;
  todayRatioPct: number;
  daysUrgencyPct: number;
  surplusBankCents: number;
}

export const MOCK_LIMIT = 40_000;
export const MOCK_CYCLE_DAYS = 30;
export const MOCK_NOW = Date.UTC(2026, 5, 4, 12, 0, 0);
export const DEBUG_TODAY_RATIO_MAX = 300;

export function daysLeftFromUrgency(
  urgencyPct: number,
  cycleDays = MOCK_CYCLE_DAYS
): number {
  const u = Math.min(100, Math.max(0, urgencyPct));
  return Math.max(1, Math.round(((100 - u) / 100) * cycleDays));
}

export function formatDaysLeftLabel(
  locale: "zh" | "en",
  daysLeft: number
): string {
  return `${daysLeft}${locale === "zh" ? "天" : "d"}`;
}

export function mockFromSliders(v: DebugSliders): {
  progress: ProgressPaint;
  cycleUsedPct: number;
  todayRatioPct: number;
} {
  const cycleUsedPct = Math.min(100, Math.max(0, v.cycleUsedPct));
  const todayRatioPct = Math.min(
    DEBUG_TODAY_RATIO_MAX,
    Math.max(0, v.todayRatioPct)
  );
  const daysLeft = daysLeftFromUrgency(v.daysUrgencyPct);

  const remaining = Math.round(MOCK_LIMIT * (1 - cycleUsedPct / 100));
  const daily = Math.max(1, Math.floor(remaining / daysLeft));
  const todayUsed = Math.round((daily * todayRatioPct) / 100);

  const billingCycleEnd = MOCK_NOW + daysLeft * 86_400_000;
  const billingCycleStart =
    billingCycleEnd - MOCK_CYCLE_DAYS * 86_400_000;

  const paceStress = pacingStressPct(
    remaining,
    MOCK_LIMIT,
    daysLeft,
    billingCycleStart,
    billingCycleEnd
  );

  const progress = buildProgressPaint(
    {
      cycleLimitCents: MOCK_LIMIT,
      cycleRemainingCents: remaining,
      surplusBankCents: Math.max(0, v.surplusBankCents),
      todayUsedCents: todayUsed,
      dailyBudgetCents: daily,
    },
    { daysLeft, paceStressPct: paceStress }
  );

  return {
    progress,
    cycleUsedPct,
    todayRatioPct: todayRatioPercent(todayUsed, daily),
  };
}

export function progressFromDebug(v: DebugSliders): ProgressPaint {
  return mockFromSliders(v).progress;
}

export function progressFromScenario(id: DebugScenarioId): ProgressPaint {
  return progressForDebugScenario(id);
}

export function slidersFromProgress(
  p: ProgressPaint,
  bankCents = 0
): DebugSliders {
  const cycleUsedPct = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        (1 - p.cycleRemainingCents / Math.max(1, p.cycleLimitCents)) * 100
      )
    )
  );
  const todayRatioPct = todayRatioPercent(
    p.todayUsedCents,
    p.dailyBudgetCents
  );
  const daysLeftPct = Math.min(
    100,
    Math.max(0, Math.round((p.daysLeft / MOCK_CYCLE_DAYS) * 100))
  );
  return {
    cycleUsedPct,
    todayRatioPct,
    daysUrgencyPct: daysUrgencyPct(daysLeftPct),
    surplusBankCents: bankCents,
  };
}

export function slidersFromScenario(id: DebugScenarioId): DebugSliders {
  const p = progressForDebugScenario(id);
  const bank =
    id === "holiday"
      ? 2_000
      : 0;
  return slidersFromProgress(p, bank);
}

export function daysUrgencyPct(daysLeftPct: number): number {
  return Math.min(100, Math.max(0, Math.round(100 - daysLeftPct)));
}

export function daysUrgencyTone(urgencyPct: number): string {
  if (urgencyPct < 34) return "days-calm";
  if (urgencyPct < 67) return "days-mid";
  return "days-urgent";
}

export function slidersFromMetrics(m: {
  totalPercentUsed?: number;
  cycleUsedPct?: number;
  todayUsedPct?: number;
  todayUsedCents?: number;
  dailyBudgetCents?: number;
  daysLeft?: number;
  daysLeftPct?: number;
  cycleTotalDays?: number;
}): DebugSliders {
  const cycleTotal = Math.max(1, m.cycleTotalDays ?? MOCK_CYCLE_DAYS);
  const daysLeftPct =
    m.daysLeftPct != null
      ? m.daysLeftPct
      : Math.min(
          100,
          Math.max(0, Math.round(((m.daysLeft ?? 0) / cycleTotal) * 100))
        );

  let todayRatioPct = m.todayUsedPct ?? 0;
  if (
    m.todayUsedCents != null &&
    m.dailyBudgetCents != null &&
    m.dailyBudgetCents > 0
  ) {
    todayRatioPct = todayRatioPercent(
      m.todayUsedCents,
      m.dailyBudgetCents
    );
  }

  return {
    cycleUsedPct: m.totalPercentUsed ?? m.cycleUsedPct ?? 0,
    todayRatioPct,
    daysUrgencyPct: daysUrgencyPct(daysLeftPct),
    surplusBankCents: 0,
  };
}

export { todayBarWidthPct, todayRatioPercent };
