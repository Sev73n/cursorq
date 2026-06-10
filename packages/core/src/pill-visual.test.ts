import assert from "node:assert/strict";
import { test } from "node:test";
import { PILL_RED_RATIO, buildProgressPaint } from "./pill-visual.js";

test("at 100% daily ratio: no red or orange", () => {
  const p = buildProgressPaint(
    {
      cycleLimitCents: 40_000,
      cycleRemainingCents: 26_000,
      surplusBankCents: 0,
      todayUsedCents: 100,
      dailyBudgetCents: 100,
    },
    { daysLeft: 20 }
  );
  assert.equal(p.redPct, 0);
  assert.ok(p.bluePct > 0.5);
  assert.notEqual(p.phase, "red");
  assert.notEqual(p.phase, "orange");
});

test("at 200% daily ratio with high bluePct: orange (not red)", () => {
  const p = buildProgressPaint(
    {
      cycleLimitCents: 40_000,
      cycleRemainingCents: 26_000,
      surplusBankCents: 0,
      todayUsedCents: 200,
      dailyBudgetCents: 100,
    },
    { daysLeft: 20 }
  );
  assert.ok(p.redPct > 0, `redPct=${p.redPct}`);
  assert.equal(p.phase, "orange");
});

test("at 200% daily ratio with low bluePct: red", () => {
  const p = buildProgressPaint(
    {
      cycleLimitCents: 40_000,
      cycleRemainingCents: 8_000,
      surplusBankCents: 0,
      todayUsedCents: 200,
      dailyBudgetCents: 100,
    },
    { daysLeft: 20 }
  );
  assert.ok(p.redPct > 0, `redPct=${p.redPct}`);
  assert.equal(p.phase, "red");
  assert.ok(p.bluePct <= 0.5, `bluePct=${p.bluePct}`);
});

test("low remaining lowers blue", () => {
  const high = buildProgressPaint(
    {
      cycleLimitCents: 40_000,
      cycleRemainingCents: 36_000,
      surplusBankCents: 0,
      todayUsedCents: 10,
      dailyBudgetCents: 100,
    },
    { daysLeft: 28 }
  );
  const low = buildProgressPaint(
    {
      cycleLimitCents: 40_000,
      cycleRemainingCents: 4_000,
      surplusBankCents: 0,
      todayUsedCents: 10,
      dailyBudgetCents: 100,
    },
    { daysLeft: 28 }
  );
  assert.ok(high.bluePct > low.bluePct + 0.5);
  assert.equal(low.redPct, 0);
});

test("PILL_RED_RATIO is 2", () => {
  assert.equal(PILL_RED_RATIO, 2);
});
