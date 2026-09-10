import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { JsonApprovalStore } from "../../src/benchmark/approval-store.mjs";
import { JsonRunStore } from "../../src/benchmark/run-store.mjs";
import { JsonMemory } from "../../src/benchmark/memory.mjs";
import { BenchmarkRuntime } from "../../src/benchmark/runtime.mjs";

function temp(name) { return path.join(os.tmpdir(), `jaslyn-${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`); }

test("approved action consumes one exact tool invocation", async () => {
  const calls = [];
  const runtime = new BenchmarkRuntime({
    providers: [{ id: "test", health: async () => ({ ok: true }), reason: async () => ({ summary: "test" }) }],
    tools: [{ name: "external.send", requiresApproval: true, execute: async (input) => { calls.push(input); return { accepted: true, input }; } }],
    approvalStore: new JsonApprovalStore(temp("approval-exec")),
    runStore: new JsonRunStore(temp("run-exec")),
    memory: new JsonMemory(temp("memory-exec")),
  });
  await runtime.initialize();
  const approval = await runtime.approvalStore.create({ runId: "run-source", tool: "external.send", input: { message: "exact payload" }, reason: "External send." });
  await runtime.approvalStore.decide(approval.id, "approved");
  const result = await runtime.executeApprovedApproval(approval.id);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ message: "exact payload" }]);
  await assert.rejects(() => runtime.executeApprovedApproval(approval.id), /consumed|not approved/i);
});
