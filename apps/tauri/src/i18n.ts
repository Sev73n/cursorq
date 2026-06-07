export type Locale = "zh" | "en";

const strings = {
  zh: {
    includedUsage: "包含用量",
    cycle: "计费周期",
    item: "项目",
    tokens: "Tokens",
    usage: "占比",
    today: "今日已用",
    todayOver: "超额 ",
    paceOver: "用太快了! ",
    paceOk: "还能coding! ",
    todayRemain: "今日剩余",
    cycleRemain: "周期剩余",
    tier: "档位",
    total: "总量",
    cycleUsed: "周期用量",
    quotaPct: "配额占比",
    daysLeft: "剩余天数",
    expectedPct: "日均应为",
    dailyBudget: "日预算",
    dataSource: "数据来自 Cursor dashboard",
    noModels: "暂无分模型明细",
    tapJoke: "单击切换文案",
    dblExpand: "双击展开详情",
  },
  en: {
    includedUsage: "Included Usage",
    cycle: "Billing cycle",
    item: "Item",
    tokens: "Tokens",
    usage: "Usage",
    today: "Today used",
    todayOver: "Over ",
    paceOver: "Too fast! ",
    paceOk: "Still coding! ",
    todayRemain: "Today left",
    cycleRemain: "Cycle left",
    tier: "Plan",
    total: "Total",
    cycleUsed: "Cycle usage",
    quotaPct: "Quota %",
    daysLeft: "Days left",
    expectedPct: "Daily avg",
    dailyBudget: "Daily budget",
    dataSource: "Data from Cursor dashboard",
    noModels: "No per-model breakdown",
    tapJoke: "Click to rotate copy",
    dblExpand: "Double-click for details",
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
