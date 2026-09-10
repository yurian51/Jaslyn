import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { BenchmarkRuntime } from "../../src/benchmark/runtime.mjs";
import { JsonMemory } from "../../src/benchmark/memory.mjs";
import { JsonRunStore } from "../../src/benchmark/run-store.mjs";
import { JsonApprovalStore } from "../../src/benchmark/approval-store.mjs";

function stores() {
  const dir = os.tmpdir();
  const id = `jaslyn-resilience-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    memory: new JsonMemory({ filePath: path.join(dir, `${id}-memory.json`) }),
    runStore: new JsonRunStore({ filePath: path.join(dir, `${id}-runs.json`) }),
    approvalStore: new JsonApprovalStore(path.join(dir, `${id}-approvals.json`)),
  };
}

test("runtime fails over to the next provider when the primary errors", async () => {
  const { memory, runStore, approvalStore } = stores();
  const calls = [];
  const runtime = new BenchmarkRuntime({
    providers: [
      { id: "primary", model: "primary", async reason() { calls.push("primary"); throw new Error("primary unavailable"); } },
      { id: "secondary", model: "secondary", async reason() { calls.push("secondary"); return { summary: "Recovered through the secondary provider.", proposedSteps: ["Return verified fallback result."], decision: "use-secondary" }; } },
    ], memory, runStore, approvalStore, providerTimeoutMs: 1000,
  });
  await runtime.initialize();
  const result = await runtime.run("recover from provider outage");
  assert.equal(result.provider, "secondary");
  assert.deepEqual(calls, ["primary", "secondary"]);
  assert.ok(result.events.some((event) => event.type === "provider.failover"));
  assert.equal(result.status, "completed");
});

test("runtime skips an unhealthy provider before reasoning", async () => {
  const { memory, runStore, approvalStore } = stores();
  let primaryReasoned = false;
  const runtime = new BenchmarkRuntime({
    providers: [
      { id: "unhealthy", model: "unhealthy", async health() { throw new Error("offline"); }, async reason() { primaryReasoned = true; return { summary: "should not run" }; } },
      { id: "healthy", model: "healthy", async health() {}, async reason() { return { summary: "Healthy provider selected." }; } },
    ], memory, runStore, approvalStore, providerTimeoutMs: 1000,
  });
  await runtime.initialize();
  const result = await runtime.run("choose a healthy provider");
  assert.equal(primaryReasoned, false);
  assert.equal(result.provider, "healthy");
  assert.ok(result.events.some((event) => event.type === "provider.unhealthy"));
});

test("runtime persists an audit record when every provider fails", async () => {
  const { memory, runStore, approvalStore } = stores();
  const runtime = new BenchmarkRuntime({
    providers: [
      { id: "a", model: "a", async reason() { throw new Error("a offline"); } },
      { id: "b", model: "b", async reason() { throw new Error("b offline"); } },
    ], memory, runStore, approvalStore, providerTimeoutMs: 1000,
  });
  await runtime.initialize();
  const result = await runtime.run("record total provider outage");
  assert.equal(result.status, "failed");
  assert.equal(result.verified, false);
  assert.match(result.error, /All Jaslyn providers failed/);
  assert.equal(runtime.getRun(result.goal.id).status, "failed");
});

test("tool execution receives an abort signal when the timeout fires", async () => {
  const { memory, runStore, approvalStore } = stores();
  let aborted = false;
  const runtime = new BenchmarkRuntime({
    providers: [{ id: "local", model: "local", async reason() { return { summary: "Tool attempted.", proposedSteps: ["Run the slow tool."], toolCalls: [{ id: "slow-1", name: "slow.tool", input: {} }] }; } }],
    tools: [{ name: "slow.tool", async execute(_input, { signal }) { await new Promise((resolve) => { signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }); }); throw new Error("aborted"); } }],
    memory, runStore, approvalStore, toolTimeoutMs: 250,
  });
  await runtime.initialize();
  const result = await runtime.run("abort a slow tool");
  assert.equal(aborted, true);
  assert.equal(result.status, "failed");
  assert.equal(result.outcome.failed, 1);
});
