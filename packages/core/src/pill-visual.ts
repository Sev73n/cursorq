/**
 * 胶囊光带配色（唯一真相源）
 *
 * 胶囊颜色策略：
 * - 蓝色/绿色：正常状态，由 (剩余+节余)/额度 决定
 * - 橙色：今日 ≥ 2×日预算，但周期余量充足（bluePct > 0.5）→ 温和提醒
 * - 红色：今日 ≥ 2×日预算，且周期余量也紧张（bluePct ≤ 0.5）→ 紧急警告
 *
 * 面板三条进度条：
 * - 总量：周期已用 %（Cursor 订阅页）→ 仅面板展示
 * - 今日已用：今日 $ / 日预算 → 胶囊颜色参考
 * - 剩余天数：周期剩余天数紧迫度 → 仅面板条，不影响胶囊
 */

import type { ProgressPaint } from "./types.js";

/** 胶囊变橙/红：今日用量 ≥ 此倍数 × 日预算 */
export const PILL_RED_RATIO = 2;

/** 周期余量充足阈值：bluePct > 此值时，今日超额降级为橙色而非红色 */
export const CYCLE_COMFORT_THRESHOLD = 0.5;

export interface PillPaintInput {
  cycleLimitCents: number;
  cycleRemainingCents: number;
  surplusBankCents: number;
  todayUsedCents: number;
  dailyBudgetCents: number;
}

export interface PillPaintMeta {
  daysLeft: number;
  /** 面板参考，不参与胶囊配色 */
  paceStressPct?: number;
}

export function buildProgressPaint(
  input: PillPaintInput,
  meta: PillPaintMeta
): ProgressPaint {
  const limit = Math.max(1, input.cycleLimitCents);
  const remaining = Math.max(0, input.cycleRemainingCents);
  const bank = Math.max(0, input.surplusBankCents);
  const headroom = remaining + bank;
  const bluePct = Math.min(1, Math.max(0, headroom / limit));

  const daily = Math.max(1, input.dailyBudgetCents);
  const ratio = input.todayUsedCents / daily;

  let redPct = 0;
  const warnYellowPct = 0;
  let phase: ProgressPaint["phase"] = bluePct > 0.02 ? "blue" : "green";

  if (ratio >= PILL_RED_RATIO) {
    if (bluePct > CYCLE_COMFORT_THRESHOLD) {
      // 周期余量充足 → 橙色温和提醒，不必恐慌
      phase = "orange";
      redPct = Math.min(0.45, 0.22 + (ratio - PILL_RED_RATIO) / 3);
    } else {
      // 周期也紧张 → 红色紧急警告
      phase = "red";
      redPct = Math.min(1, 0.22 + (ratio - PILL_RED_RATIO) / 2);
    }
  }

  return {
    bluePct,
    redPct,
    warnYellowPct,
    paceStressPct: meta.paceStressPct ?? 0,
    phase,
    todayUsedCents: input.todayUsedCents,
    dailyBudgetCents: daily,
    cycleRemainingCents: remaining,
    cycleLimitCents: limit,
    daysLeft: meta.daysLeft,
  };
}

/** 今日用量占日预算的百分比（可 >100，供调试滑条） */
export function todayRatioPercent(
  todayUsedCents: number,
  dailyBudgetCents: number
): number {
  return Math.round(
    (todayUsedCents / Math.max(1, dailyBudgetCents)) * 1000
  ) / 10;
}

/** 面板「今日」进度条宽度（上限 100%） */
export function todayBarWidthPct(ratioPercent: number): number {
  return Math.min(100, Math.max(0, ratioPercent));
}
