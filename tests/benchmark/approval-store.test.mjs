import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { JsonApprovalStore } from "../../src/benchmark/approval-store.mjs";

function file() {
  return path.join(os.tmpdir(), `jaslyn-approval-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

test("approval store persists pending and approved decisions", async () => {
  const filePath = file();
  const first = await new JsonApprovalStore(filePath).load();
  const pending = await first.create({ runId: "run-1", tool: "workspace.write", input: { path: "README.md" }, reason: "External workspace mutation." });
  assert.equal(pending.status, "pending");

  const second = await new JsonApprovalStore(filePath).load();
  assert.equal(second.get(pending.id).status, "pending");
  const approved = await second.decide(pending.id, "approved");
  assert.equal(approved.status, "approved");

  const third = await new JsonApprovalStore(filePath).load();
  assert.equal(third.get(pending.id).status, "approved");
});

test("approval store prevents a second decision", async () => {
  const filePath = file();
  const store = await new JsonApprovalStore(filePath).load();
  const pending = await store.create({ runId: "run-2", tool: "external.send", input: {}, reason: "External action." });
  await store.decide(pending.id, "rejected");
  await assert.rejects(() => store.decide(pending.id, "approved"), /already rejected/);
});
