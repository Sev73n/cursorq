import type { Locale } from "@cursorq/core";

const strings = {
  zh: {
    includedUsage: "包含用量",
    cycle: "计费周期",
    item: "项目",
    tokens: "Tokens",
    usage: "占比",
    today: "今日",
    dailyBudget: "日预算",
    remaining: "周期剩余",
    daysLeft: "剩余天数",
    refreshHint: "数据来自 Cursor Dashboard",
  },
  en: {
    includedUsage: "Included Usage",
    cycle: "Billing cycle",
    item: "Item",
    tokens: "Tokens",
    usage: "Usage",
    today: "Today",
    dailyBudget: "Daily budget",
    remaining: "Cycle remaining",
    daysLeft: "Days left",
    refreshHint: "Synced from Cursor Dashboard",
  },
} as const;

export type I18nKey = keyof (typeof strings)["zh"];

export function t(locale: Locale, key: I18nKey): string {
  return strings[locale][key];
}

export function formatCycleRange(
  locale: Locale,
  startMs: number,
  endMs: number
): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const loc = locale === "zh" ? "zh-CN" : "en-US";
  const a = new Date(startMs).toLocaleDateString(loc, opts);
  const b = new Date(endMs).toLocaleDateString(loc, opts);
  return `${a} – ${b}`;
}
