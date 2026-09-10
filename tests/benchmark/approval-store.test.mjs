import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { JsonApprovalStore } from "../../src/benchmark/approval-store.mjs";

function file() {
  return path.join(os.tmpdir(), `jaslyn-approval-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

test("approval store persists pending and approved decisions", async () => {
  const filePath = file();
  const first = await new JsonApprovalStore(filePath).load();
  const pending = await first.create({ runId: "run-1", tool: "workspace.write", input: { path: "README.md" }, reason: "External workspace mutation." });
  assert.equal(pending.status, "pending");
  assert.ok(pending.expiresAt);

  const second = await new JsonApprovalStore(filePath).load();
  assert.equal(second.get(pending.id).status, "pending");
  const approved = await second.decide(pending.id, "approved");
  assert.equal(approved.status, "approved");

  const third = await new JsonApprovalStore(filePath).load();
  assert.equal(third.get(pending.id).status, "approved");
});

test("approval store prevents a second decision and replay", async () => {
  const filePath = file();
  const store = await new JsonApprovalStore(filePath).load();
  const pending = await store.create({ runId: "run-2", tool: "external.send", input: {}, reason: "External action." });
  await store.decide(pending.id, "approved");
  const claimed = await store.claimApproved(pending.id);
  assert.equal(claimed.status, "consumed");
  await assert.rejects(() => store.claimApproved(pending.id), /already|consumed|not approved/i);
  await assert.rejects(() => store.decide(pending.id, "rejected"), /already consumed/);
});

test("approval store expires stale pending requests", async () => {
  const filePath = file();
  const store = await new JsonApprovalStore(filePath).load();
  const pending = await store.create({ runId: "run-3", tool: "external.send", input: { value: 1 }, reason: "External action." });
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  raw[0].expiresAt = new Date(Date.now() - 1000).toISOString();
  await writeFile(filePath, JSON.stringify(raw, null, 2), "utf8");
  const reloaded = await new JsonApprovalStore(filePath).load();
  assert.equal(reloaded.get(pending.id).status, "expired");
  await assert.rejects(() => reloaded.decide(pending.id, "approved"), /already expired/);
});
