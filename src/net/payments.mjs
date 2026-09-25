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


export async function verifyPaymentEvent(input) {
  const payment = normalizePaymentEvent({ ...input, status: "VERIFIED" });
  if (!payment.providerReference) throw new Error("providerReference is required for payment verification");
  if (!payment.subscriptionId) throw new Error("subscriptionId is required for payment verification");

  return withTransaction(async (client) => {
    const result = await client.query(
      `select p.id, p.organization_id, p.customer_id, p.subscription_id, p.provider,
              p.provider_transaction_id, p.amount_minor, p.currency, p.status,
              p.provider_reference, p.correlation_id,
              s.customer_id as subscription_customer_id, s.correlation_id as subscription_correlation_id,
              pl.organization_id as plan_organization_id, pl.price_minor, pl.currency as plan_currency
       from net_payments p
       join net_subscriptions s on s.id = p.subscription_id
       join net_plans pl on pl.id = s.plan_id
       where p.provider = $1 and p.provider_transaction_id = $2
       for update of p, s, pl`,
      [payment.provider, payment.providerTransactionId],
    );
    const existing = result.rows[0];
    if (!existing) throw new Error("Payment not found");

    if (existing.organization_id !== payment.organizationId ||
        existing.customer_id !== payment.customerId ||
        existing.subscription_id !== payment.subscriptionId ||
        existing.subscription_customer_id !== payment.customerId ||
        existing.plan_organization_id !== payment.organizationId) {
      throw new Error("Payment customer, organization or subscription mismatch");
    }
    if (String(existing.amount_minor) !== String(payment.amountMinor) ||
        String(existing.price_minor) !== String(payment.amountMinor)) {
      throw new Error("Payment amount mismatch");
    }
    if (String(existing.currency).toUpperCase() !== payment.currency ||
        String(existing.plan_currency).toUpperCase() !== payment.currency) {
      throw new Error("Payment currency mismatch");
    }
    if (existing.correlation_id && payment.correlationId && existing.correlation_id !== payment.correlationId) {
      throw new Error("Payment correlation mismatch");
    }
    if (existing.provider_reference && existing.provider_reference !== payment.providerReference) {
      throw new Error("Provider reference mismatch");
    }

    if (["VERIFIED", "SETTLED"].includes(existing.status)) return { ...existing, idempotent: true };

    if (!["INITIATED", "PENDING"].includes(existing.status)) {
      throw new Error(`Payment cannot be verified from state ${existing.status}`);
    }

    const updated = await client.query(
      `update net_payments
       set status = 'VERIFIED',
           provider_reference = $2,
           verified_at = coalesce(verified_at, $3::timestamptz),
           updated_at = now()
       where id = $1
       returning id, organization_id, customer_id, subscription_id, provider,
                 provider_transaction_id, amount_minor, currency, status,
                 provider_reference, received_at, verified_at, correlation_id`,
      [existing.id, payment.providerReference, payment.receivedAt],
    );

    const invoiceResult = await client.query(
      `select id, total_minor, paid_minor, status
       from net_invoices
       where organization_id = $1 and customer_id = $2 and subscription_id = $3
         and status not in ('CANCELLED','REFUNDED','PAID')
       order by due_at nulls last, created_at asc
       limit 1
       for update`,
      [payment.organizationId, payment.customerId, payment.subscriptionId],
    );
    const invoice = invoiceResult.rows[0];
    let invoiceSettlement = null;
    if (invoice) {
      const outstanding = BigInt(invoice.total_minor) - BigInt(invoice.paid_minor);
      const amount = BigInt(payment.amountMinor);
      if (amount > outstanding) throw new Error("Payment exceeds the outstanding invoice balance");
      const allocation = await client.query(
        `insert into net_invoice_payments (invoice_id, payment_id, amount_minor)
         values ($1,$2,$3)
         on conflict (invoice_id,payment_id) do nothing
         returning amount_minor`,
        [invoice.id, existing.id, payment.amountMinor],
      );
      if (allocation.rowCount) {
        const nextPaid = BigInt(invoice.paid_minor) + amount;
        const nextStatus = nextPaid === BigInt(invoice.total_minor) ? "PAID" : "PARTIALLY_PAID";
        await client.query(
          `update net_invoices
           set paid_minor = $2, status = $3, paid_at = case when $3 = 'PAID' then coalesce(paid_at, now()) else paid_at end, updated_at = now()
           where id = $1`,
          [invoice.id, nextPaid.toString(), nextStatus],
        );
        invoiceSettlement = { invoiceId: invoice.id, allocatedMinor: payment.amountMinor, status: nextStatus };
      } else {
        invoiceSettlement = { invoiceId: invoice.id, allocatedMinor: 0, status: invoice.status, idempotent: true };
      }
    }

    return { ...updated.rows[0], idempotent: false, invoiceSettlement };
  });
}
