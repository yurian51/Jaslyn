import assert from "node:assert/strict";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { BenchmarkRuntime } from "../src/benchmark/runtime.mjs";
import { JsonMemory } from "../src/benchmark/memory.mjs";
import { JsonRunStore } from "../src/benchmark/run-store.mjs";
import { JsonApprovalStore } from "../src/benchmark/approval-store.mjs";

const dir = await mkdtemp(join(os.tmpdir(), "jaslyn-selftest-"));
let sideEffects = 0;
try {
  const runtime = await new BenchmarkRuntime({
    providers: [{
      id: "selftest",
      model: "local-selftest",
      health: async () => {},
      reason: async () => ({
        summary: "Self-test completed",
        proposedSteps: ["execute safe tool", "verify persisted result"],
        needsApproval: false,
        toolCalls: [{ name: "echo", input: { ok: true } }],
      }),
    }],
    tools: [{
      name: "echo",
      description: "Deterministic self-test tool",
      execute: async (input) => ({ ...input, sideEffect: ++sideEffects }),
    }],
    memory: new JsonMemory(join(dir, "memory.json")),
    runStore: new JsonRunStore(join(dir, "runs.json")),
    approvalStore: new JsonApprovalStore(join(dir, "approvals.json")),
    maxIterations: 2,
  }).initialize();

  const result = await runtime.run("run the Jaslyn runtime self-test", { providerId: "selftest" });
  assert.equal(result.status, "completed");
  assert.equal(result.verified, true);
  assert.equal(result.outcome.completed, 1);
  assert.equal(sideEffects, 1);
  assert.equal(runtime.getRun(result.goal.id)?.verified, true);
  assert.ok(runtime.history({ limit: 1 }).length === 1);
  assert.ok(runtime.memory.search("self-test", { namespace: "episodic", limit: 1 }).length === 1);

  console.log(JSON.stringify({
    ok: true,
    provider: result.provider,
    status: result.status,
    verified: result.verified,
    completedTools: result.outcome.completed,
    events: result.events.length,
  }, null, 2));
} finally {
  await rm(dir, { recursive: true, force: true });
}
