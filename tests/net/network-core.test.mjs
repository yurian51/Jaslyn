import test from "node:test";
import assert from "node:assert/strict";
import { transition, createCommand, applyCommandResult, deriveEntitlement } from "../../src/net/state.mjs";
import { compileNetworkPolicy, compileRadiusMikrotik } from "../../src/net/policy.mjs";
import { reconcilePaymentAccess, reconcileDesiredActual } from "../../src/net/reconcile.mjs";

test("payment lifecycle rejects invalid jumps", () => {
  assert.equal(transition("payment", "INITIATED", "PENDING"), "PENDING");
  assert.throws(() => transition("payment", "INITIATED", "SETTLED"), /Invalid payment transition/);
});

test("command lifecycle records retryable provider failure", () => {
  const command = createCommand({ commandId: "cmd-1", actor: "operator-1", target: "session-1", provider: "mikrotik-rest" });
  const sent = { ...command, status: transition("command", command.status, "SENT") };
  const result = applyCommandResult(sent, { accepted: false, retryable: true, error: "timeout" });
  assert.equal(result.status, "RETRYING");
  assert.equal(result.attempts, 1);
});

test("entitlement requires both verified payment and active subscription", () => {
  const subscription = { status: "ACTIVE", expiresAt: new Date(Date.now() + 3600000).toISOString() };
  assert.deepEqual(deriveEntitlement({ status: "VERIFIED" }, subscription), { state: "ACTIVE", reason: "PAYMENT_AND_SUBSCRIPTION_VALID" });
  assert.equal(deriveEntitlement({ status: "PENDING" }, subscription).state, "PENDING");
});

test("network policy remains vendor-neutral before adapter compilation", () => {
  const policy = compileNetworkPolicy({ id: "10mb-7d", name: "10 Mbps / 7 days", downloadMbps: 10, uploadMbps: 5, quotaBytes: 20_000_000_000, validitySeconds: 604800, deviceLimit: 2 });
  assert.equal(policy.vendorNeutral, true);
  assert.equal(policy.authorization.sessionTimeoutSeconds, 604800);
  const radius = compileRadiusMikrotik(policy);
  assert.equal(radius.attributes["Mikrotik-Rate-Limit"], "10M/5M");
  assert.equal(radius.attributes["Session-Timeout"], "604800");
  assert.deepEqual(radius.unsupportedWithoutAdapter, ["quotaBytes"]);
});

test("reconciliation catches paid but unauthorized access", () => {
  const result = reconcilePaymentAccess({
    payment: { status: "SETTLED" },
    subscription: { status: "ACTIVE", expiresAt: new Date(Date.now() + 3600000).toISOString() },
    network: { authorization: "DENIED", sessionActive: false, lastAccountingAt: null },
  });
  assert.equal(result.consistent, false);
  assert.equal(result.issues[0].code, "PAID_BUT_NOT_AUTHORIZED");
});

test("reconciliation catches network access after payment reversal", () => {
  const result = reconcilePaymentAccess({
    payment: { status: "REVERSED" },
    subscription: { status: "ACTIVE", expiresAt: new Date(Date.now() + 3600000).toISOString() },
    network: { authorization: "AUTHORIZED", sessionActive: true, lastAccountingAt: new Date().toISOString() },
  });
  assert.equal(result.consistent, false);
  assert.equal(result.issues[0].code, "NETWORK_ACCESS_WITHOUT_VALID_PAYMENT");
  assert.equal(result.issues.some((issue) => issue.code === "REVERSED_PAYMENT_STILL_AUTHORIZED"), true);
});

test("configuration drift is explicit and auditable", () => {
  const result = reconcileDesiredActual({ rateMbps: 10, vlan: 20 }, { rateMbps: 5, vlan: 20 });
  assert.equal(result.driftDetected, true);
  assert.deepEqual(result.drift[0], { field: "rateMbps", desired: 10, actual: 5 });
});
