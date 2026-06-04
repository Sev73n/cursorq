import { isTodayOverDaily } from "@cursorq/core";
import { t, type Locale } from "./i18n.js";

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatTodayMetricValue(
  locale: Locale,
  todayUsedCents: number,
  dailyBudgetCents: number
): string {
  const over = isTodayOverDaily(todayUsedCents, dailyBudgetCents);
  const prefix = over ? t(locale, "todayOver") : "";
  return `${prefix}${formatUsd(todayUsedCents)} / ${formatUsd(dailyBudgetCents)}`;
}
