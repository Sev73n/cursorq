import type {
  PeriodUsage,
  PlanInfo,
  UsageDetail,
  UsageBreakdownRow,
  UsageMetrics,
  UsageCategoryRow,
} from "./types.js";
import {
  buildCategoriesFromEvents,
  fetchUsageEventsInCycle,
} from "./usage-events.js";
import { daysLeftInCycle } from "./budget.js";
import { resolvePlanTier } from "./plan-tier.js";

function pct(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function buildMetrics(
  period: PeriodUsage,
  plan: PlanInfo,
  todayUsedCents: number,
  dailyBudgetCents: number,
  daysLeft: number
): UsageMetrics {
  const limit = period.planUsage.limit;
  const remaining = period.planUsage.remaining;
  const cycleTotalDays = Math.max(
    1,
    Math.ceil(
      (period.billingCycleEnd - period.billingCycleStart) / 86_400_000
    )
  );
  const used = period.planUsage.includedSpend;
  const todayUsedPct = Math.min(
    100,
    pct((todayUsedCents / Math.max(1, dailyBudgetCents)) * 100)
  );
  const cycleUsedPct = Math.min(
    100,
    pct((used / Math.max(1, limit)) * 100)
  );
  const cycleRemainingPct = Math.min(
    100,
    pct((remaining / Math.max(1, limit)) * 100)
  );
  const daysLeftPct = Math.min(
    100,
    pct((daysLeft / cycleTotalDays) * 100)
  );

  const totalPct = pct(period.planUsage.totalPercentUsed);
  return {
    todayUsedCents,
    dailyBudgetCents,
    todayUsedPct,
    cycleUsedCents: used,
    cycleRemainingCents: remaining,
    cycleLimitCents: limit,
    cycleUsedPct: totalPct > 0 ? totalPct : cycleUsedPct,
    cycleRemainingPct,
    totalPercentUsed: totalPct,
    daysLeft,
    cycleTotalDays,
    daysLeftPct,
    tierLabel: resolvePlanTier(plan, period, period.membershipType),
  };
}

function legacyRows(pu: PeriodUsage["planUsage"]): UsageBreakdownRow[] {
  const rows: UsageBreakdownRow[] = [];
  if (pu.apiPercentUsed != null && pu.apiPercentUsed > 0) {
    rows.push({
      item: "API",
      tokensLabel: "—",
      usagePct: pct(pu.apiPercentUsed),
    });
  }
  if (pu.autoPercentUsed != null && pu.autoPercentUsed > 0) {
    rows.push({
      item: "Auto + Composer",
      tokensLabel: "—",
      usagePct: pct(pu.autoPercentUsed),
    });
  }
  if (rows.length === 0) {
    rows.push({
      item: "Included",
      tokensLabel: "—",
      usagePct: pct(pu.totalPercentUsed),
    });
  }
  return rows;
}

export async function buildUsageDetail(
  period: PeriodUsage,
  plan: PlanInfo,
  todayUsedCents: number,
  dailyBudgetCents: number,
  daysLeft: number,
  accessToken: string,
  locale: "zh" | "en" = "zh"
): Promise<UsageDetail> {
  const pu = period.planUsage;
  const apiPct = pu.apiPercentUsed ?? 0;
  const autoPct = pu.autoPercentUsed ?? 0;
  const autoBucket = period.autoBucketModels ?? [];

  let categories: UsageCategoryRow[] = [];
  try {
    const events = await fetchUsageEventsInCycle(
      accessToken,
      period.billingCycleStart,
      period.billingCycleEnd
    );
    categories = buildCategoriesFromEvents(
      events,
      autoBucket,
      apiPct,
      autoPct,
      locale
    );
  } catch {
    categories = [];
  }

  if (categories.length === 0) {
    categories = buildCategoriesFromEvents(
      [],
      autoBucket,
      apiPct,
      autoPct,
      locale
    );
  }

  const metrics = buildMetrics(
    period,
    plan,
    todayUsedCents,
    dailyBudgetCents,
    daysLeft
  );

  return {
    planName: plan.planName,
    cycleStartMs: period.billingCycleStart,
    cycleEndMs: period.billingCycleEnd,
    totalPercentUsed: pct(pu.totalPercentUsed),
    includedSpendCents: pu.includedSpend,
    limitCents: pu.limit,
    remainingCents: pu.remaining,
    todayUsedCents,
    dailyBudgetCents,
    daysLeft: daysLeftInCycle(period.billingCycleEnd),
    rows: legacyRows(pu),
    categories,
    metrics,
  };
}

export function formatCentsUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
