import assert from "node:assert/strict";
import { test } from "node:test";
import { daysLeftInCycle } from "./budget.js";
import { DEBUG_AS_OF_MS, progressForDebugScenario } from "./debug-scenarios.js";

test("doneToday scenario daysLeft matches billing end at DEBUG_AS_OF_MS", () => {
  const p = progressForDebugScenario("doneToday");
  assert.ok(p.daysLeft >= 18 && p.daysLeft <= 22);
});

test("progress daysLeft follows billingCycleEnd when asOfMs set", () => {
  const end = DEBUG_AS_OF_MS + 5 * 86_400_000;
  assert.equal(daysLeftInCycle(end, DEBUG_AS_OF_MS), 5);
});
