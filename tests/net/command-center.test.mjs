import test from "node:test";
import assert from "node:assert/strict";
import { formatBytes } from "../../src/net/command-center.mjs";
import { normalizeCommand } from "../../src/net/commands.mjs";

test("formatBytes uses readable units", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1024 ** 2), "1.0 MB");
});

test("command parser normalizes whitespace and casing", () => {
  assert.equal(normalizeCommand("  SHOW   OFFLINE   ROUTERS "), "show offline routers");
});

test("command parser rejects arbitrary commands", () => {
  assert.throws(() => normalizeCommand("drop database"), /Unsupported command/);
});
