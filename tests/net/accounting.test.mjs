import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAccounting } from "../../src/net/accounting.mjs";

test("normalizes RADIUS Start accounting without inventing values", () => {
  const event = normalizeAccounting({ nasIdentifier: "site-router-1", acctSessionId: "abc-123", acctStatusType: "Start", username: "customer-1", inputOctets: 0, outputOctets: 0, receivedAt: "2026-09-17T06:00:00Z" });
  assert.equal(event.nasIdentifier, "site-router-1");
  assert.equal(event.acctSessionId, "abc-123");
  assert.equal(event.inputOctets, 0);
  assert.equal(event.outputOctets, 0);
});

test("rejects malformed accounting counters", () => {
  assert.throws(() => normalizeAccounting({ nasIdentifier: "r1", acctSessionId: "s1", acctStatusType: "Interim-Update", inputOctets: "not-a-number" }), /inputOctets must be a finite/);
});

test("rejects unknown accounting status", () => {
  assert.throws(() => normalizeAccounting({ nasIdentifier: "r1", acctSessionId: "s1", acctStatusType: "Success" }), /valid acctStatusType/);
});
