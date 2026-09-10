import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { BenchmarkRuntime } from "../../src/benchmark/runtime.mjs";
import { JsonMemory } from "../../src/benchmark/memory.mjs";
import { JsonRunStore } from "../../src/benchmark/run-store.mjs";
import { JsonApprovalStore } from "../../src/benchmark/approval-store.mjs";

test("runtime inspection surfaces durable state and healthy providers", async () => {
  const dir = await mkdtemp(join(os.tmpdir(), "jaslyn-inspection-"));
  try {
    const runtime = await new BenchmarkRuntime({
      providers: [{ id: "local", model: "local", health: async () => {}, reason: async () => ({ summary: "ok" }) }],
      memory: new JsonMemory(join(dir, "memory.json")),
      runStore: new JsonRunStore(join(dir, "runs.json")),
      approvalStore: new JsonApprovalStore(join(dir, "approvals.json")),
    }).initialize();

    const health = await runtime.health({ timeoutMs: 1000 });
    assert.equal(health.length, 1);
    assert.equal(health[0].id, "local");
    assert.equal(health[0].ok, true);
    assert.deepEqual(runtime.history({ limit: 10 }), []);
    assert.deepEqual(runtime.approvals({ limit: 10 }), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
