import test from "node:test";
import assert from "node:assert/strict";
import { accountingFingerprint, normalizeAccounting } from "../../src/net/accounting.mjs";

test("normalizes RADIUS accounting and rejects malformed values", () => {
  const event = normalizeAccounting({
    nasIdentifier: "nas-01",
    acctSessionId: "session-01",
    username: "alice",
    macAddress: "aa:bb:cc:dd:ee:ff",
    ipAddress: "10.0.0.10",
    acctStatusType: "Interim-Update",
    sessionTime: 120,
    inputOctets: 1000,
    outputOctets: 2000,
    receivedAt: "2026-09-19T10:00:00.000Z",
  });
  assert.equal(event.acctStatusType, "Interim-Update");
  assert.equal(accountingFingerprint(event), accountingFingerprint({ ...event }));
  assert.throws(() => normalizeAccounting({ nasIdentifier: "nas-01", acctSessionId: "session-01", acctStatusType: "Bogus" }));
});
