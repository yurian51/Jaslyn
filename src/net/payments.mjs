import { withTransaction } from "./db.mjs";

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
  return { organizationId: String(input.organizationId), provider: String(input.provider), providerTransactionId: String(input.providerTransactionId), customerId: String(input.customerId), subscriptionId: input.subscriptionId ? String(input.subscriptionId) : null, amountMinor, currency, status, providerReference: input.providerReference ? String(input.providerReference) : null, receivedAt: receivedAt.toISOString() };
}

export async function recordPaymentEvent(input) {
  const payment = normalizePaymentEvent(input);
  return withTransaction(async (client) => {
    const result = await client.query(
      `insert into net_payments (organization_id, customer_id, subscription_id, provider, provider_transaction_id, amount_minor, currency, status, provider_reference, received_at, verified_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,case when $8 in ('VERIFIED','SETTLED') then $10::timestamptz else null end)
       on conflict (provider, provider_transaction_id) do update set
         provider_reference=coalesce(excluded.provider_reference, net_payments.provider_reference),
         received_at=least(coalesce(net_payments.received_at, excluded.received_at), excluded.received_at),
         updated_at=now()
       returning id, organization_id, provider, provider_transaction_id, amount_minor, currency, status, received_at, verified_at`,
      [payment.organizationId, payment.customerId, payment.subscriptionId, payment.provider, payment.providerTransactionId, payment.amountMinor, payment.currency, payment.status, payment.providerReference, payment.receivedAt]
    );
    return result.rows[0];
  });
}
