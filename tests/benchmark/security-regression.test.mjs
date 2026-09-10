import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { BenchmarkRuntime } from "../../src/benchmark/runtime.mjs";
import { JsonMemory } from "../../src/benchmark/memory.mjs";
import { JsonRunStore } from "../../src/benchmark/run-store.mjs";
import { JsonApprovalStore } from "../../src/benchmark/approval-store.mjs";

function makeProvider() {
  return {
    id: "security-test-provider",
    async health() { return { ok: true }; },
    async reason() {
      return {
        summary: "The protected action requires explicit approval.",
        proposedSteps: ["Request approval before executing the protected action."],
        toolCalls: [{ id: "protected-1", name: "protected.action", input: { value: "sensitive" } }],
      };
    },
  };
}

async function makeRuntime(dir) {
  return new BenchmarkRuntime({
    providers: [makeProvider()],
    tools: [{
      name: "protected.action",
      description: "Protected side-effecting action.",
      requiresApproval: true,
      execute: async () => ({ executed: true }),
    }],
    policy: { approvalRequired: ["protected.action"] },
    memory: new JsonMemory(join(dir, "memory.json")),
    runStore: new JsonRunStore(join(dir, "runs.json")),
    approvalStore: new JsonApprovalStore(join(dir, "approvals.json")),
    maxIterations: 1,
  }).initialize();
}

test("generic approve=true cannot bypass protected tool approval", async () => {
  const dir = await mkdtemp(join(os.tmpdir(), "jaslyn-approval-bypass-"));
  try {
    const runtime = await makeRuntime(dir);
    const result = await runtime.run("execute the protected action", { approve: true });
    assert.equal(result.status, "blocked");
    assert.equal(result.toolResults.length, 1);
    assert.equal(result.toolResults[0].blocked, true);
    assert.equal(result.toolResults[0].approvalId !== null, true);
    assert.equal(result.approvals.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("approved protected action is one-time and exact-action bound", async () => {
  const dir = await mkdtemp(join(os.tmpdir(), "jaslyn-approval-exact-"));
  try {
    const runtime = await makeRuntime(dir);
    const result = await runtime.run("execute the protected action");
    const approvalId = result.approvals[0].id;
    await runtime.approvalStore.decide(approvalId, "approved");
    const first = await runtime.executeApprovedApproval(approvalId);
    assert.equal(first.ok, true);
    await assert.rejects(() => runtime.executeApprovedApproval(approvalId), /already|expired|not approved/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
