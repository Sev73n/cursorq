import type { PeriodUsage, PlanInfo } from "./types.js";

/** Cursor 档位展示（对照官网：Pro $20 / Pro+ $60 / Ultra $200 用量池） */
export function resolvePlanTier(
  plan: PlanInfo,
  period: PeriodUsage,
  membershipType?: string
): string {
  const name = `${plan.planName ?? ""} ${membershipType ?? ""}`.toLowerCase();

  if (name.includes("enterprise")) return "Enterprise";
  if (name.includes("business") || name.includes("team")) return "Teams";
  if (name.includes("ultra")) return "Ultra";
  if (name.includes("pro+") || name.includes("pro plus") || name.includes("pro_plus")) {
    return "Pro+";
  }
  if (name.includes("hobby") || name.includes("free")) return "Hobby";
  if (name.includes("pro")) return "Pro";

  const limit = period.planUsage.limit;
  if (limit >= 35_000) return "Ultra";
  if (limit >= 6_000) return "Pro+";
  if (limit >= 1_500) return "Pro";

  return plan.planName?.trim() || "Cursor";
}
