import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeProgress,
  fairDailyCents,
  PILL_RED_RATIO,
  pacingStressPct,
} from "./budget.js";
import { progressForDebugScenario } from "./debug-scenarios.js";
import type { AppState, PeriodUsage } from "./types.js";

const NOW = Date.UTC(2026, 5, 4, 12, 0, 0);

function period(
  remaining: number,
  spend: number,
  limit = 40_000
): PeriodUsage {
  return {
    billingCycleStart: NOW - 10 * 86_400_000,
    billingCycleEnd: NOW + 20 * 86_400_000,
    planUsage: {
      limit,
      remaining,
      includedSpend: spend,
      totalSpend: spend,
      totalPercentUsed: 0,
    },
  };
}

test("pacingStress rises when runway daily is below fair daily", () => {
  const start = NOW - 10 * 86_400_000;
  const end = NOW + 20 * 86_400_000;
  const stress = pacingStressPct(4_000, 40_000, 20, start, end);
  assert.ok(stress > 0.7, `expected high stress, got ${stress}`);
});

test("doneToday: on-pace cycle, fair daily today — no pill red", () => {
  const p = progressForDebugScenario("doneToday");
  assert.equal(p.redPct, 0);
  assert.notEqual(p.phase, "red");
  assert.ok(p.bluePct > 0.5, `bluePct=${p.bluePct}`);
  const fair = fairDailyCents(40_000, NOW - 10 * 86_400_000, NOW + 20 * 86_400_000);
  assert.equal(p.todayUsedCents, fair);
});

test("holiday: high headroom stays blue phase", () => {
  const p = progressForDebugScenario("holiday");
  assert.ok(p.bluePct > 0.85);
  assert.equal(p.redPct, 0);
  assert.equal(p.phase, "blue");
});

test("overPace: today >= 2x daily budget shows red", () => {
  const p = progressForDebugScenario("overPace");
  assert.ok(p.redPct > 0, `redPct=${p.redPct}`);
  assert.equal(p.phase, "red");
  assert.ok(
    p.todayUsedCents >= p.dailyBudgetCents * PILL_RED_RATIO,
    "today should be at least 2x daily"
  );
});

test("exactly daily budget: no red", () => {
  const daily = 100;
  const p = computeProgress(
    period(26_000, 14_000),
    { surplusBankCents: 0, snapshots: [] } satisfies AppState,
    100,
    daily
  );
  assert.equal(p.redPct, 0);
  assert.notEqual(p.phase, "red");
});
