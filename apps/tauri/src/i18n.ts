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
    todayRemain: "今日剩余",
    cycleRemain: "周期剩余",
    tier: "档位",
    total: "总量",
    cycleUsed: "周期用量",
    quotaPct: "配额占比",
    daysLeft: "剩余天数",
    dailyBudget: "日预算",
    refreshHint: "占比与 Cursor 订阅页一致；今日金额为本地按用量池推算",
    debugOn: "调试模式 · 点此或「退出调试」关闭",
    debugOff: "连点三下进入调试",
    debugExit: "退出调试",
    debugPillHint: "胶囊：总量→蓝绿占比；今日≥200%→红；天数仅面板",
    debugPresets: "典型状态",
    debugPresetHoliday: "假期",
    debugPresetDone: "下班",
    debugPresetOver: "超支",
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
    todayRemain: "Today left",
    cycleRemain: "Cycle left",
    tier: "Plan",
    total: "Total",
    cycleUsed: "Cycle usage",
    quotaPct: "Quota %",
    daysLeft: "Days left",
    dailyBudget: "Daily budget",
    refreshHint: "Pct matches Cursor plan page; today $ is local pacing estimate",
    debugOn: "Debug · tap here or Exit to close",
    debugOff: "Triple-click for debug",
    debugExit: "Exit debug",
    debugPillHint: "Pill: total→blue; today≥200%→red; days=panel only",
    debugPresets: "Typical states",
    debugPresetHoliday: "Holiday",
    debugPresetDone: "Done today",
    debugPresetOver: "Over pace",
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
