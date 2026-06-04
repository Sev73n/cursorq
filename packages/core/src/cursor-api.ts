import type { PeriodUsage, PlanInfo } from "./types.js";

const BASE = "https://api2.cursor.sh";

function parseMs(v: string | number | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sessionCookie(accessToken: string): string {
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")
    ) as { sub?: string };
    const sub = payload.sub ?? "";
    const userId = sub.includes("|") ? (sub.split("|").pop() ?? sub) : sub;
    return `WorkosCursorSessionToken=${userId}%3A%3A${accessToken}`;
  } catch {
    return "";
  }
}

async function connectPost<T>(
  accessToken: string,
  path: string,
  body: unknown = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cursor API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

interface RawPlanUsage {
  totalSpend?: number;
  includedSpend?: number;
  remaining?: number;
  limit?: number;
  totalPercentUsed?: number;
  apiPercentUsed?: number;
  autoPercentUsed?: number;
}

interface RawPeriod {
  billingCycleStart?: string;
  billingCycleEnd?: string;
  planUsage?: RawPlanUsage;
  displayMessage?: string;
  autoBucketModels?: string[];
}

function mapPeriod(raw: RawPeriod): PeriodUsage {
  const pu = raw.planUsage ?? {};
  const limit = pu.limit ?? 0;
  const included = pu.includedSpend ?? 0;
  const remaining =
    pu.remaining ?? (limit > 0 ? Math.max(0, limit - included) : 0);
  return {
    billingCycleStart: parseMs(raw.billingCycleStart),
    billingCycleEnd: parseMs(raw.billingCycleEnd),
    planUsage: {
      totalSpend: pu.totalSpend ?? included,
      includedSpend: included,
      remaining,
      limit,
      totalPercentUsed: pu.totalPercentUsed ?? 0,
      apiPercentUsed: pu.apiPercentUsed,
      autoPercentUsed: pu.autoPercentUsed,
    },
    displayMessage: raw.displayMessage,
    autoBucketModels: raw.autoBucketModels ?? [],
  };
}

/** 网页 Dashboard 用的 REST 兜底 */
async function fetchUsageSummaryRest(
  accessToken: string
): Promise<PeriodUsage> {
  const cookie = sessionCookie(accessToken);
  if (!cookie) throw new Error("无法构造会话");

  const res = await fetch("https://cursor.com/api/usage-summary", {
    headers: {
      Cookie: cookie,
      Origin: "https://cursor.com",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`usage-summary ${res.status}: ${text.slice(0, 120)}`);
  }

  const raw = (await res.json()) as {
    billingCycleStart?: string;
    billingCycleEnd?: string;
    membershipType?: string;
    individualUsage?: {
      plan?: {
        used?: number;
        limit?: number;
        remaining?: number;
        total?: number;
        totalPercentUsed?: number;
        apiPercentUsed?: number;
        autoPercentUsed?: number;
      };
    };
    planUsage?: RawPlanUsage;
  };

  const planBlock = raw.individualUsage?.plan;
  const used =
    planBlock?.used ?? raw.planUsage?.includedSpend ?? 0;
  const limit = planBlock?.limit ?? raw.planUsage?.limit ?? 0;
  const remaining =
    planBlock?.remaining ?? Math.max(0, limit - used);
  const totalPercentUsed =
    planBlock?.totalPercentUsed ??
    raw.planUsage?.totalPercentUsed ??
    (limit > 0 ? (used / limit) * 100 : 0);

  return {
    billingCycleStart: parseMs(raw.billingCycleStart),
    billingCycleEnd: parseMs(raw.billingCycleEnd),
    membershipType: raw.membershipType,
    planUsage: {
      totalSpend: used,
      includedSpend: used,
      remaining,
      limit,
      totalPercentUsed,
      apiPercentUsed:
        planBlock?.apiPercentUsed ?? raw.planUsage?.apiPercentUsed,
      autoPercentUsed:
        planBlock?.autoPercentUsed ?? raw.planUsage?.autoPercentUsed,
    },
  };
}

/** Dashboard cookie endpoint — same numbers as billing page */
export async function fetchDashboardPeriodUsage(
  accessToken: string
): Promise<Partial<PeriodUsage>> {
  const cookie = sessionCookie(accessToken);
  if (!cookie) return {};
  const res = await fetch(
    "https://cursor.com/api/dashboard/get-current-period-usage",
    {
      headers: {
        Cookie: cookie,
        Origin: "https://cursor.com",
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) return {};
  const raw = (await res.json()) as RawPeriod;
  return mapPeriod(raw);
}

export async function fetchCurrentPeriodUsage(
  accessToken: string
): Promise<PeriodUsage> {
  let period: PeriodUsage;
  try {
    const raw = await connectPost<RawPeriod>(
      accessToken,
      "/aiserver.v1.DashboardService/GetCurrentPeriodUsage",
      {}
    );
    period = mapPeriod(raw);
  } catch (primary) {
    try {
      period = await fetchUsageSummaryRest(accessToken);
    } catch (fallback) {
      const a = primary instanceof Error ? primary.message : String(primary);
      const b =
        fallback instanceof Error ? fallback.message : String(fallback);
      throw new Error(`${a} | ${b}`);
    }
  }
  try {
    const dash = await fetchDashboardPeriodUsage(accessToken);
    const dpu = dash.planUsage;
    period = {
      ...period,
      displayMessage: dash.displayMessage ?? period.displayMessage,
      autoBucketModels:
        dash.autoBucketModels ?? period.autoBucketModels,
      planUsage: {
        ...period.planUsage,
        includedSpend: dpu?.includedSpend ?? period.planUsage.includedSpend,
        totalPercentUsed:
          dpu?.totalPercentUsed ?? period.planUsage.totalPercentUsed,
        apiPercentUsed: dpu?.apiPercentUsed ?? period.planUsage.apiPercentUsed,
        autoPercentUsed:
          dpu?.autoPercentUsed ?? period.planUsage.autoPercentUsed,
        // limit/remaining 由 reconcilePeriodWithPlan(GetPlanInfo) 校正，勿用 Dashboard 标价池
      },
    };
  } catch {
    /* optional enrich */
  }
  return period;
}

interface RawPlanInfo {
  planInfo?: {
    planName?: string;
    includedAmountCents?: number;
    price?: string;
    billingCycleEnd?: string;
  };
}

export async function fetchPlanInfo(accessToken: string): Promise<PlanInfo> {
  try {
    const raw = await connectPost<RawPlanInfo>(
      accessToken,
      "/aiserver.v1.DashboardService/GetPlanInfo",
      {}
    );
    const p = raw.planInfo ?? {};
    return {
      planName: p.planName ?? "Unknown",
      includedAmountCents: p.includedAmountCents ?? 0,
      price: p.price ?? "",
      billingCycleEnd: parseMs(p.billingCycleEnd),
    };
  } catch {
    return {
      planName: "Cursor",
      includedAmountCents: 0,
      price: "",
      billingCycleEnd: 0,
    };
  }
}
