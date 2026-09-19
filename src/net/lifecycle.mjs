import { withTransaction } from "./db.mjs";
import { compileNetworkPolicy } from "./policy.mjs";

const VERIFIABLE_PAYMENT_STATES = new Set(["VERIFIED", "SETTLED"]);

function asIso(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid timestamp`);
  return date.toISOString();
}

function assertActivationPayment(payment, plan) {
  if (!VERIFIABLE_PAYMENT_STATES.has(payment.status)) throw new Error(`Payment ${payment.id} is not verified or settled`);
  if (payment.amount_minor !== plan.price_minor) throw new Error(`Payment amount mismatch for plan ${plan.id}`);
  if (payment.currency !== plan.currency) throw new Error(`Payment currency mismatch for plan ${plan.id}`);
}

export async function activateVerifiedPayment({ paymentId, correlationId = null, now = new Date().toISOString() }) {
  if (!paymentId) throw new Error("paymentId is required");
  const activationTime = asIso(now, "now");

  return withTransaction(async (client) => {
    const paymentResult = await client.query(
      `select id, organization_id, customer_id, subscription_id, amount_minor, currency, status, activation_applied_at, correlation_id
       from net_payments
       where id = $1
       for update`,
      [paymentId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new Error("Payment not found");
    if (!payment.subscription_id) throw new Error("Payment is not attached to a subscription");

    if (payment.correlation_id && correlationId && payment.correlation_id !== correlationId) {
      throw new Error("Payment correlation mismatch");
    }
    const effectiveCorrelationId = payment.correlation_id ?? correlationId;
    if (!effectiveCorrelationId) throw new Error("Payment correlation is missing");

    const subscriptionResult = await client.query(
      `select s.id, s.customer_id, s.plan_id, s.status, s.starts_at, s.expires_at, s.entitlement_version,
              s.correlation_id,
              p.organization_id, p.name as plan_name, p.currency, p.price_minor, p.download_mbps, p.upload_mbps,
              p.quota_bytes, p.validity_seconds, p.device_limit
       from net_subscriptions s
       join net_plans p on p.id = s.plan_id
       where s.id = $1 and s.customer_id = $2
       for update of s, p`,
      [payment.subscription_id, payment.customer_id],
    );
    const subscription = subscriptionResult.rows[0];
    if (!subscription) throw new Error("Subscription not found for payment customer");
    if (subscription.organization_id !== payment.organization_id) throw new Error("Payment organization mismatch");
    if (subscription.correlation_id && subscription.correlation_id !== effectiveCorrelationId) throw new Error("Subscription correlation mismatch");

    if (payment.activation_applied_at) {
      const authorizationResult = await client.query(
        `select id, subscription_id, state, policy, policy_version, desired_at, applied_at, last_verified_at
         from net_authorizations where subscription_id = $1`,
        [subscription.id],
      );
      const authorization = authorizationResult.rows[0] ?? null;
      return { paymentId: payment.id, correlationId: effectiveCorrelationId, idempotent: true, subscription, authorization, networkState: authorization?.state === "ACTIVE" ? "NETWORK_AUTHORIZED" : "PENDING_NETWORK_APPLY" };
    }

    assertActivationPayment(payment, subscription);

    const currentExpiry = new Date(subscription.expires_at);
    const base = currentExpiry.getTime() > new Date(activationTime).getTime() ? currentExpiry : new Date(activationTime);
    const expiresAt = new Date(base.getTime() + Number(subscription.validity_seconds) * 1000).toISOString();
    const nextVersion = Number(subscription.entitlement_version || 1) + 1;

    const updatedSubscription = await client.query(
      `update net_subscriptions
       set status = 'ACTIVE',
           correlation_id = $5,
           starts_at = case when starts_at > $2::timestamptz then $2::timestamptz else starts_at end,
           expires_at = $3::timestamptz,
           entitlement_version = $4,
           updated_at = now()
       where id = $1
       returning id, customer_id, plan_id, status, starts_at, expires_at, entitlement_version, correlation_id`,
      [subscription.id, activationTime, expiresAt, nextVersion, effectiveCorrelationId],
    );

    const policy = compileNetworkPolicy({
      id: subscription.plan_id, name: subscription.plan_name,
      downloadMbps: Number(subscription.download_mbps), uploadMbps: Number(subscription.upload_mbps),
      quotaBytes: subscription.quota_bytes == null ? null : Number(subscription.quota_bytes),
      validitySeconds: Number(subscription.validity_seconds), deviceLimit: Number(subscription.device_limit),
    });

    const authorization = await client.query(
      `insert into net_authorizations
        (organization_id, customer_id, subscription_id, state, policy, policy_version, source, desired_at, verification)
       values ($1,$2,$3,'PENDING',$4::jsonb,$5,$6,$7::timestamptz,$8::jsonb)
       on conflict (subscription_id) do update set
         customer_id = excluded.customer_id, state = 'PENDING', policy = excluded.policy,
         policy_version = excluded.policy_version, source = excluded.source, desired_at = excluded.desired_at, updated_at = now()
       returning id, subscription_id, state, policy, policy_version, desired_at, applied_at, last_verified_at`,
      [payment.organization_id, payment.customer_id, subscription.id, JSON.stringify(policy), nextVersion, "jaslyn-billing", activationTime, JSON.stringify({ reason: "PAYMENT_VERIFIED", paymentId: payment.id, correlationId: effectiveCorrelationId, networkAction: "PENDING" })],
    );

    const event = await client.query(
      `insert into net_events
        (organization_id, event_type, aggregate_type, aggregate_id, correlation_id, version, payload)
       values ($1,'subscription.activated','subscription',$2,$3,$4,$5::jsonb)
       returning id, event_type, aggregate_id, correlation_id, occurred_at`,
      [payment.organization_id, subscription.id, effectiveCorrelationId, nextVersion, JSON.stringify({ paymentId: payment.id, authorizationId: authorization.rows[0].id, expiresAt })],
    );

    await client.query(
      `insert into net_audit_log
        (organization_id, actor_id, action, target_type, target_id, correlation_id, before_state, after_state)
       values ($1,'system:payment-verification','SUBSCRIPTION_ACTIVATED','subscription',$2,$3,$4::jsonb,$5::jsonb)`,
      [payment.organization_id, subscription.id, effectiveCorrelationId, JSON.stringify({ status: subscription.status, expiresAt: subscription.expires_at }), JSON.stringify({ status: "ACTIVE", expiresAt, authorizationState: "PENDING" })],
    );

    await client.query(`update net_payments set activation_applied_at = $2::timestamptz, updated_at = now() where id = $1`, [payment.id, activationTime]);

    return { paymentId: payment.id, correlationId: effectiveCorrelationId, idempotent: false, subscription: updatedSubscription.rows[0], authorization: authorization.rows[0], event: event.rows[0], networkState: "PENDING_NETWORK_APPLY" };
  });
}

export function activationRequiresNetworkVerification(result) {
  return result?.networkState === "PENDING_NETWORK_APPLY" && result?.authorization?.state === "PENDING";
}
