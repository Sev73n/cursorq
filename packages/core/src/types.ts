export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  email?: string;
}

export interface PlanUsage {
  totalSpend: number;
  includedSpend: number;
  remaining: number;
  limit: number;
  totalPercentUsed: number;
  apiPercentUsed?: number;
  autoPercentUsed?: number;
}

export interface PeriodUsage {
  billingCycleStart: number;
  billingCycleEnd: number;
  planUsage: PlanUsage;
  displayMessage?: string;
  autoBucketModels?: string[];
  membershipType?: string;
}

export interface PlanInfo {
  planName: string;
  includedAmountCents: number;
  price: string;
  billingCycleEnd: number;
}

export interface UsageBreakdownRow {
  item: string;
  tokensLabel: string;
  usagePct: number;
}

export interface UsageModelRow {
  model: string;
  tokens: number;
  tokensLabel: string;
  usagePct: number;
  /** internal sort weight */
  weight: number;
}

export interface UsageCategoryRow {
  id: "api" | "auto_composer";
  label: string;
  tokens: number;
  tokensLabel: string;
  usagePct: number;
  models: UsageModelRow[];
}

export interface UsageMetrics {
  todayUsedCents: number;
  dailyBudgetCents: number;
  todayUsedPct: number;
  cycleUsedCents: number;
  cycleRemainingCents: number;
  cycleLimitCents: number;
  /** includedSpend / limit — matches Dashboard “You've used X%” */
  cycleUsedPct: number;
  cycleRemainingPct: number;
  /** Connect API totalPercentUsed (quota composite %) */
  totalPercentUsed: number;
  daysLeft: number;
  cycleTotalDays: number;
  daysLeftPct: number;
  displayMessage?: string;
  /** 展示档位：Ultra / Pro+ / Pro / Teams … */
  tierLabel: string;
}

export interface UsageDetail {
  planName: string;
  cycleStartMs: number;
  cycleEndMs: number;
  totalPercentUsed: number;
  includedSpendCents: number;
  limitCents: number;
  remainingCents: number;
  todayUsedCents: number;
  dailyBudgetCents: number;
  daysLeft: number;
  rows: UsageBreakdownRow[];
  categories: UsageCategoryRow[];
  metrics: UsageMetrics;
}

export interface DailySnapshot {
  date: string;
  baselineCents: number;
  dailyBudgetCents: number;
}

export interface AppState {
  surplusBankCents: number;
  snapshots: DailySnapshot[];
  lastSettleDate?: string;
  lastNotify?: Record<string, string>;
  locale?: "zh" | "en";
  jokeIndex?: number;
  /** 上次刷新时的周期 includedSpend（用于跨日 baseline） */
  lastIncludedSpend?: number;
  lastIncludedDate?: string;
  /** 周期额度（美分），如促销 $100 → 10000；覆盖 API 的 $400 用量池 */
}

export interface ProgressPaint {
  bluePct: number;
  redPct: number;
  warnYellowPct: number;
  /** 0–1：周期节奏偏紧（仅面板参考，不影响胶囊颜色） */
  paceStressPct: number;
  phase: "blue" | "green" | "orange" | "red";
  todayUsedCents: number;
  dailyBudgetCents: number;
  cycleRemainingCents: number;
  cycleLimitCents: number;
  daysLeft: number;
}

export interface WidgetCopy {
  line1: string;
  line2: string;
  state: string;
}

export type WidgetState =
  | "idle"
  | "surplus_vibe"
  | "warn80"
  | "done_today"
  | "done_today_ok"   // 今日超额但周期余量充足（胶囊橙，不必恐慌）
  | "over_cycle";

export type Locale = "zh" | "en";
