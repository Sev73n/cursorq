import type { AppState, PeriodUsage, ProgressPaint } from "./types.js";
import { buildProgressPaint } from "./pill-visual.js";

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function daysLeftInCycle(cycleEndMs: number, now = Date.now()): number {
  const diff = cycleEndMs - now;
  return Math.max(1, Math.ceil(diff / 86_400_000));
}

export function cycleTotalDays(
  cycleStartMs: number,
  cycleEndMs: number
): number {
  return Math.max(
    1,
    Math.ceil((cycleEndMs - cycleStartMs) / 86_400_000)
  );
}

/** 若从周期起点均匀花额度，每日应得预算（美分） */
export function fairDailyCents(
  limit: number,
  cycleStartMs: number,
  cycleEndMs: number
): number {
  return Math.max(1, Math.floor(limit / cycleTotalDays(cycleStartMs, cycleEndMs)));
}

export { PILL_RED_RATIO } from "./pill-visual.js";

/**
 * 剩余额度按剩余天数摊的日预算，低于公平日预算 → 周期花太快（0=宽松，1=极紧）
 * 仅作指标参考，不驱动胶囊红色。
 */
export function pacingStressPct(
  remainingCents: number,
  limit: number,
  daysLeft: number,
  cycleStartMs: number,
  cycleEndMs: number
): number {
  const fair = fairDailyCents(limit, cycleStartMs, cycleEndMs);
  const pace = Math.max(1, Math.floor(remainingCents / Math.max(1, daysLeft)));
  if (pace >= fair) return 0;
  return Math.min(1, 1 - pace / fair);
}

export function computeDailyBudgetCents(
  remainingCents: number,
  cycleEndMs: number
): number {
  const days = daysLeftInCycle(cycleEndMs);
  return Math.max(1, Math.floor(remainingCents / days));
}

export function isWeekend(d = new Date()): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** Settle yesterday into surplus bank */
export function settleYesterdayBank(
  state: AppState,
  period: PeriodUsage,
  opts: { honorWeekends: boolean }
): AppState {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yKey = todayKey(y);
  if (state.lastSettleDate === yKey) return state;
  const snap = state.snapshots.find((s) => s.date === yKey);
  if (!snap) return state;

  const yUsed = Math.max(0, period.planUsage.includedSpend - snap.baselineCents);
  const rest =
    opts.honorWeekends && isWeekend(y) && yUsed === 0;
  const under = yUsed < snap.dailyBudgetCents;
  if (!rest && !under) return state;

  const saved = rest
    ? snap.dailyBudgetCents
    : snap.dailyBudgetCents - yUsed;
  const cap = snap.dailyBudgetCents * 3;
  const nextBank = Math.min(state.surplusBankCents + saved, cap);
  return {
    ...state,
    surplusBankCents: nextBank,
    lastSettleDate: yKey,
  };
}

export function ensureTodaySnapshot(
  state: AppState,
  period: PeriodUsage
): AppState {
  const key = todayKey();
  const total = period.planUsage.includedSpend;
  const daily = computeDailyBudgetCents(
    period.planUsage.remaining,
    period.billingCycleEnd
  );
  const existing = state.snapshots.find((s) => s.date === key);
  const snap = {
    date: key,
    baselineCents: existing?.baselineCents ?? total,
    dailyBudgetCents: daily,
  };
  const rest = state.snapshots.filter((s) => s.date !== key);
  return { ...state, snapshots: [...rest, snap].slice(-40) };
}

export function isTodayOverDaily(
  todayUsedCents: number,
  dailyBudgetCents: number
): boolean {
  return todayUsedCents > Math.max(1, dailyBudgetCents);
}

export function todayUsedCents(state: AppState, includedSpend: number): number {
  const key = todayKey();
  const snap = state.snapshots.find((s) => s.date === key);
  if (!snap) return 0;
  return Math.max(0, includedSpend - snap.baselineCents);
}

export interface ComputeProgressOptions {
  /** 计算「剩余天数」的基准时刻（调试场景用固定时间） */
  asOfMs?: number;
}

export function computeProgress(
  period: PeriodUsage,
  state: AppState,
  todayUsedCents: number,
  dailyBudgetCents: number,
  opts?: ComputeProgressOptions
): ProgressPaint {
  const limit = period.planUsage.limit || 1;
  const remaining = period.planUsage.remaining;
  const now = opts?.asOfMs ?? Date.now();
  const daysLeft = daysLeftInCycle(period.billingCycleEnd, now);
  const paceStress = pacingStressPct(
    remaining,
    limit,
    daysLeft,
    period.billingCycleStart,
    period.billingCycleEnd
  );

  return buildProgressPaint(
    {
      cycleLimitCents: limit,
      cycleRemainingCents: remaining,
      surplusBankCents: state.surplusBankCents,
      todayUsedCents,
      dailyBudgetCents,
    },
    { daysLeft, paceStressPct: paceStress }
  );
}

