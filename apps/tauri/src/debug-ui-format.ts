import { isCycleOverPace, isTodayOverDaily } from "@cursorq/core";
import { t, type Locale } from "./i18n.js";

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** 今日：当日 $ / 日预算；超过日预算标「超额」 */
export function formatTodayMetricValue(
  locale: Locale,
  todayUsedCents: number,
  dailyBudgetCents: number
): string {
  const daily = Math.max(1, dailyBudgetCents);
  const pct = Math.round((todayUsedCents / daily) * 100);
  const over = isTodayOverDaily(todayUsedCents, dailyBudgetCents);
  const prefix = over ? t(locale, "todayOver") : "";
  return `${prefix}${pct}% · ${formatUsd(todayUsedCents)} / ${formatUsd(dailyBudgetCents)}`;
}

/** 总量：Cursor 综合配额 %；快于周期时间进度时标「超前」 */
export function formatTotalMetricValue(
  locale: Locale,
  tier: string,
  cycleUsedPct: number,
  cycleStartMs: number,
  cycleEndMs: number
): string {
  const over = isCycleOverPace(cycleUsedPct, cycleStartMs, cycleEndMs);
  const prefix = over ? t(locale, "paceOver") : t(locale, "paceOk");
  return `${prefix}${tier} · ${cycleUsedPct}%`;
}
