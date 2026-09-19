import { randomUUID } from "node:crypto";
import { withTransaction } from "./db.mjs";
import { transition } from "./state.mjs";

const statuses = new Set(["INITIATED", "PENDING", "VERIFIED", "SETTLED", "FAILED", "REVERSED", "REFUNDED"]);

export function normalizePaymentEvent(input) {
  if (!input?.organizationId || !input?.provider || !input?.providerTransactionId || !input?.customerId || input.amountMinor == null || !input?.currency) throw new Error("organizationId, provider, providerTransactionId, customerId, amountMinor and currency are required");
  const amountMinor = Number(input.amountMinor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error("amountMinor must be a safe non-negative integer");
  const currency = String(input.currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a 3-letter ISO code");
  const status = input.status ?? "PENDING";
  if (!statuses.has(status)) throw new Error(`Unsupported payment state: ${status}`);
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
  if (Number.isNaN(receivedAt.getTime())) throw new Error("receivedAt must be a valid timestamp");
  const correlationId = input.correlationId ? String(input.correlationId) : null;
  if (correlationId && !/^[0-9a-f-]{36}$/i.test(correlationId)) throw new Error("correlationId must be a UUID");
  return { organizationId: String(input.organizationId), provider: String(input.provider), providerTransactionId: String(input.providerTransactionId), customerId: String(input.customerId), subscriptionId: input.subscriptionId ? String(input.subscriptionId) : null, amountMinor, currency, status, providerReference: input.providerReference ? String(input.providerReference) : null, receivedAt: receivedAt.toISOString(), correlationId };
}

export function mergePaymentState(current, incoming) {
  if (!current) return { state: incoming.status, changed: true };
  if (current.status === incoming.status) return { state: current.status, changed: false };
  return { state: transition("payment", current.status, incoming.status), changed: true };
}

export async function recordPaymentEvent(input) {
  const payment = normalizePaymentEvent(input);
  return withTransaction(async (client) => {
    const existingResult = await client.query(
      `select id, organization_id, customer_id, subscription_id, amount_minor, currency, status, provider_reference, received_at, verified_at, correlation_id
       from net_payments
       where provider = $1 and provider_transaction_id = $2
       for update`,
      [payment.provider, payment.providerTransactionId],
    );
    const existing = existingResult.rows[0];

    if (!existing) {
      let correlationId = payment.correlationId;
      if (!correlationId && payment.subscriptionId) {
        const subscriptionResult = await client.query(
          `select correlation_id from net_subscriptions where id = $1 and customer_id = $2 for update`,
          [payment.subscriptionId, payment.customerId],
        );
        correlationId = subscriptionResult.rows[0]?.correlation_id ?? null;
      }
      correlationId ||= randomUUID();
      const result = await client.query(
        `insert into net_payments (organization_id, customer_id, subscription_id, provider, provider_transaction_id, amount_minor, currency, status, provider_reference, received_at, verified_at, correlation_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,case when $8 in ('VERIFIED','SETTLED') then $10::timestamptz else null end,$11)
         returning id, organization_id, customer_id, subscription_id, provider, provider_transaction_id, amount_minor, currency, status, provider_reference, received_at, verified_at, correlation_id`,
        [payment.organizationId, payment.customerId, payment.subscriptionId, payment.provider, payment.providerTransactionId, payment.amountMinor, payment.currency, payment.status, payment.providerReference, payment.receivedAt, correlationId],
      );
      return result.rows[0];
    }

    if (existing.organization_id !== payment.organizationId || existing.customer_id !== payment.customerId || String(existing.amount_minor) !== String(payment.amountMinor) || existing.currency !== payment.currency) {
      throw new Error("Payment identity or amount mismatch for an existing provider transaction");
    }
    if (existing.subscription_id && payment.subscriptionId && existing.subscription_id !== payment.subscriptionId) {
      throw new Error("Payment subscription mismatch for an existing provider transaction");
    }
    if (existing.correlation_id && payment.correlationId && existing.correlation_id !== payment.correlationId) {
      throw new Error("Payment correlation mismatch for an existing provider transaction");
    }

    const merged = mergePaymentState(existing, payment);
    if (!merged.changed) return existing;

    const result = await client.query(
      `update net_payments
       set status = $2,
           subscription_id = coalesce(subscription_id, $3),
           provider_reference = coalesce($4, provider_reference),
           received_at = least(coalesce(received_at, $5::timestamptz), $5::timestamptz),
           verified_at = case when $2 in ('VERIFIED','SETTLED') then coalesce(verified_at, $5::timestamptz) else verified_at end,
           updated_at = now()
       where id = $1
       returning id, organization_id, customer_id, subscription_id, provider, provider_transaction_id, amount_minor, currency, status, provider_reference, received_at, verified_at, correlation_id`,
      [existing.id, merged.state, payment.subscriptionId, payment.providerReference, payment.receivedAt],
    );
    return result.rows[0];
  });
}
