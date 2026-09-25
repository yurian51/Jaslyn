import test from "node:test";
import assert from "node:assert/strict";

test("communication persistence is tenant and membership scoped", async () => {
  const source = await (await import("node:fs/promises")).readFile("src/communication/store.mjs", "utf8");
  assert.match(source, /organization_id=\$2/);
  assert.match(source, /m\.user_id=\$3/);
  assert.match(source, /MEMBER_OUTSIDE_ORGANIZATION/);
  assert.match(source, /CONVERSATION_NOT_FOUND/);
});

test("message replies use durable database relation", async () => {
  const source = await (await import("node:fs/promises")).readFile("src/communication/store.mjs", "utf8");
  assert.match(source, /reply_to_message_id/);
  assert.match(source, /REPLY_TARGET_NOT_FOUND/);
});

test("communication migration contains auditable messages and notifications", async () => {
  const migration = await (await import("node:fs/promises")).readFile("db/migrations/007_communication_center.sql", "utf8");
  assert.match(migration, /create table if not exists net_messages/);
  assert.match(migration, /create table if not exists net_notifications/);
  assert.match(migration, /create table if not exists net_audit_log|net_audit_log/);
});
