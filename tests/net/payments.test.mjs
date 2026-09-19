import test from "node:test";
import assert from "node:assert/strict";
import { mergePaymentState, normalizePaymentEvent } from "../../src/net/payments.mjs";

test("payment normalization preserves an explicit correlation id", () => {
  const payment = normalizePaymentEvent({
    organizationId: "org-1",
    provider: "mpesa",
    providerTransactionId: "tx-1",
    customerId: "customer-1",
    amountMinor: 15000,
    currency: "tzs",
    correlationId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(payment.currency, "TZS");
  assert.equal(payment.correlationId, "11111111-1111-4111-8111-111111111111");
});

test("payment state merge rejects non-canonical state jumps", () => {
  assert.throws(
    () => mergePaymentState({ status: "PENDING" }, { status: "SETTLED" }),
    /Invalid payment transition: PENDING -> SETTLED/,
  );
});

test("payment normalization rejects malformed correlation ids", () => {
  assert.throws(
    () => normalizePaymentEvent({
      organizationId: "org-1",
      provider: "mpesa",
      providerTransactionId: "tx-1",
      customerId: "customer-1",
      amountMinor: 15000,
      currency: "TZS",
      correlationId: "not-a-uuid",
    }),
    /correlationId must be a UUID/,
  );
});
