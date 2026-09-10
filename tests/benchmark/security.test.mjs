import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { BenchmarkRuntime } from "../../src/benchmark/runtime.mjs";
import { JsonMemory } from "../../src/benchmark/memory.mjs";
import { JsonRunStore } from "../../src/benchmark/run-store.mjs";
import { JsonApprovalStore } from "../../src/benchmark/approval-store.mjs";

test("request-level approve flag cannot bypass a protected tool", async () => {
  const dir = await mkdtemp(join(os.tmpdir(), "jaslyn-security-"));
  let executed = 0;
  const runtime = new BenchmarkRuntime({
    memory: new JsonMemory(join(dir, "memory.json")),
    runStore: new JsonRunStore(join(dir, "runs.json")),
    approvalStore: new JsonApprovalStore(join(dir, "approvals.json")),
    providers: [{
      id: "local",
      model: "local",
      health: async () => {},
      reason: async () => ({
        summary: "protected action requested",
        proposedSteps: ["request authorization"],
        needsApproval: false,
        toolCalls: [{ name: "protected.write", input: { value: "must-not-run" } }],
      }),
    }],
    tools: [{
      name: "protected.write",
      description: "Protected side effect",
      requiresApproval: true,
      execute: async () => { executed += 1; return "executed"; },
    }],
    maxIterations: 1,
  });

  try {
    await runtime.initialize();
    const result = await runtime.run("perform protected write", { providerId: "local", approve: true });
    assert.equal(executed, 0);
    assert.equal(result.status, "blocked");
    assert.equal(result.outcome.blocked, 1);
    assert.equal(result.approvals.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
