import type { UsageCategoryRow, UsageModelRow } from "./types.js";

export interface RawUsageEvent {
  model?: string;
  requestsCosts?: number;
  chargedCents?: number;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
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

function eventTokens(e: RawUsageEvent): number {
  const t = e.tokenUsage ?? {};
  return (
    (t.inputTokens ?? 0) +
    (t.outputTokens ?? 0) +
    (t.cacheReadTokens ?? 0) +
    (t.cacheWriteTokens ?? 0)
  );
}

function eventWeight(e: RawUsageEvent): number {
  return e.chargedCents ?? e.requestsCosts ?? eventTokens(e);
}

export function formatTokensLabel(tokens: number, locale: "zh" | "en"): string {
  if (tokens >= 100_000_000) {
    const n = tokens / 100_000_000;
    return locale === "zh"
      ? `${n >= 10 ? Math.round(n) : n.toFixed(1)}亿 tokens`
      : `${(tokens / 1e9).toFixed(2)}B tok`;
  }
  if (tokens >= 10_000) {
    const n = tokens / 10_000;
    return locale === "zh"
      ? `${n >= 100 ? Math.round(n) : n.toFixed(1)}万 tokens`
      : `${(tokens / 1e6).toFixed(2)}M tok`;
  }
  if (tokens >= 1000) {
    return locale === "zh"
      ? `${(tokens / 1000).toFixed(1)}k tokens`
      : `${(tokens / 1000).toFixed(1)}k tok`;
  }
  return locale === "zh" ? `${tokens} tokens` : `${tokens} tok`;
}

export function isRealModelName(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.length > 0 && m !== "default" && m !== "auto" && m !== "unknown";
}

export function isAutoBucketModel(
  model: string,
  autoBucketModels: string[]
): boolean {
  const m = model.toLowerCase();
  if (autoBucketModels.some((x) => x.toLowerCase() === m)) return true;
  if (m === "auto" || m.startsWith("composer") || m === "default") return true;
  return false;
}

export async function fetchUsageEventsInCycle(
  accessToken: string,
  cycleStartMs: number,
  cycleEndMs: number
): Promise<RawUsageEvent[]> {
  const cookie = sessionCookie(accessToken);
  if (!cookie) return [];

  const all: RawUsageEvent[] = [];
  const pageSize = 100;
  let page = 1;
  const maxPages = 20;

  while (page <= maxPages) {
    const url = new URL(
      "https://cursor.com/api/dashboard/get-filtered-usage-events"
    );
    url.searchParams.set("startDate", String(cycleStartMs));
    url.searchParams.set("endDate", String(Math.min(Date.now(), cycleEndMs)));
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));

    const res = await fetch(url.toString(), {
      headers: {
        Cookie: cookie,
        Origin: "https://cursor.com",
        Accept: "application/json",
      },
    });
    if (!res.ok) break;

    const raw = (await res.json()) as {
      totalUsageEventsCount?: number;
      usageEventsDisplay?: RawUsageEvent[];
    };
    const batch = raw.usageEventsDisplay ?? [];
    all.push(...batch);

    const total = raw.totalUsageEventsCount ?? batch.length;
    if (all.length >= total || batch.length < pageSize) break;
    page += 1;
  }

  return all;
}

function pct(n: number): number {
  return Math.round(n * 10) / 10;
}

export function buildCategoriesFromEvents(
  events: RawUsageEvent[],
  autoBucketModels: string[],
  apiPercentUsed: number,
  autoPercentUsed: number,
  locale: "zh" | "en"
): UsageCategoryRow[] {
  const byModel = new Map<string, { tokens: number; weight: number }>();

  for (const e of events) {
    const model = (e.model ?? "unknown").trim();
    const prev = byModel.get(model) ?? { tokens: 0, weight: 0 };
    prev.tokens += eventTokens(e);
    prev.weight += eventWeight(e);
    byModel.set(model, prev);
  }

  const apiModels: UsageModelRow[] = [];
  const autoModels: UsageModelRow[] = [];
  let apiWeight = 0;
  let autoWeight = 0;

  for (const [model, agg] of byModel) {
    if (isAutoBucketModel(model, autoBucketModels)) {
      autoModels.push({
        model,
        tokens: agg.tokens,
        tokensLabel: formatTokensLabel(agg.tokens, locale),
        usagePct: 0,
        weight: agg.weight,
      });
      autoWeight += agg.weight;
    } else {
      apiModels.push({
        model,
        tokens: agg.tokens,
        tokensLabel: formatTokensLabel(agg.tokens, locale),
        usagePct: 0,
        weight: agg.weight,
      });
      apiWeight += agg.weight;
    }
  }

  const assignPct = (rows: UsageModelRow[], catWeight: number, catPct: number) => {
    for (const r of rows) {
      r.usagePct =
        catWeight > 0 ? pct((r.weight / catWeight) * catPct) : 0;
    }
    rows.sort((a, b) => b.weight - a.weight);
  };

  assignPct(apiModels, apiWeight, apiPercentUsed);
  assignPct(autoModels, autoWeight, autoPercentUsed);

  let apiTokens = apiModels.reduce((s, m) => s + m.tokens, 0);
  let autoTokens = autoModels.reduce((s, m) => s + m.tokens, 0);
  const totalTokens = apiTokens + autoTokens;
  const pctSum = apiPercentUsed + autoPercentUsed;

  if (totalTokens > 0 && pctSum > 0) {
    if (apiTokens === 0 && apiPercentUsed > 0) {
      apiTokens = Math.round(totalTokens * (apiPercentUsed / pctSum));
      autoTokens = Math.max(0, totalTokens - apiTokens);
    } else if (autoTokens === 0 && autoPercentUsed > 0) {
      autoTokens = Math.round(totalTokens * (autoPercentUsed / pctSum));
      apiTokens = Math.max(0, totalTokens - autoTokens);
    }
  }

  const categories: UsageCategoryRow[] = [];

  const apiNamed = apiModels.filter((m) => isRealModelName(m.model));
  const autoNamed = autoModels.filter((m) => isRealModelName(m.model));

  if (apiPercentUsed > 0 || apiTokens > 0) {
    categories.push({
      id: "api",
      label: "API",
      tokens: apiTokens,
      tokensLabel: formatTokensLabel(apiTokens, locale),
      usagePct: pct(apiPercentUsed),
      models: apiNamed,
    });
  }

  if (autoPercentUsed > 0 || autoTokens > 0) {
    categories.push({
      id: "auto_composer",
      label: locale === "zh" ? "Auto + Composer" : "Auto + Composer",
      tokens: autoTokens,
      tokensLabel: formatTokensLabel(autoTokens, locale),
      usagePct: pct(autoPercentUsed),
      models: autoNamed,
    });
  }

  return categories;
}
