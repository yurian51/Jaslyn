import test from "node:test";
import assert from "node:assert/strict";
import { DeterministicProvider } from "../src/intelligence/provider.js";
import { Planner } from "../src/core/planner.js";

test("planner creates an executable plan", async () => {
  const planner = new Planner(new DeterministicProvider());
  const plan = await planner.create({
    id: "test-goal",
    instruction: "test Jaslyn",
    createdAt: new Date().toISOString()
  });
  assert.equal(plan.goalId, "test-goal");
  assert.equal(plan.steps.length, 4);
});
