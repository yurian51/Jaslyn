export function reconcilePaymentAccess({ payment, subscription, network }) {
  const issues = [];
  const financialValid = ["VERIFIED", "SETTLED"].includes(payment?.status);
  const subscriptionActive = subscription?.status === "ACTIVE" && new Date(subscription.expiresAt).getTime() > Date.now();
  const networkAuthorized = network?.authorization === "AUTHORIZED";

  if (financialValid && subscriptionActive && !networkAuthorized) issues.push({ code: "PAID_BUT_NOT_AUTHORIZED", severity: "HIGH", action: "VERIFY_AUTHORIZATION" });
  if (!financialValid && networkAuthorized) issues.push({ code: "NETWORK_ACCESS_WITHOUT_VALID_PAYMENT", severity: "CRITICAL", action: "VERIFY_ENTITLEMENT_BEFORE_REVOCATION" });
  if (payment?.status === "REVERSED" && networkAuthorized) issues.push({ code: "REVERSED_PAYMENT_STILL_AUTHORIZED", severity: "CRITICAL", action: "REVOKE_ACCESS_AND_AUDIT" });
  if (subscriptionActive && network?.sessionActive === true && network?.lastAccountingAt) {
    const ageMs = Date.now() - new Date(network.lastAccountingAt).getTime();
    if (Number.isFinite(ageMs) && ageMs > 10 * 60 * 1000) issues.push({ code: "STALE_ACCOUNTING", severity: "HIGH", action: "MARK_SESSION_STALE_AND_VERIFY" });
  }

  return { consistent: issues.length === 0, issues, checkedAt: new Date().toISOString() };
}

export function reconcileDesiredActual(desired, actual) {
  const drift = [];
  const keys = new Set([...Object.keys(desired ?? {}), ...Object.keys(actual ?? {})]);
  for (const key of keys) {
    if (JSON.stringify(desired?.[key]) !== JSON.stringify(actual?.[key])) drift.push({ field: key, desired: desired?.[key] ?? null, actual: actual?.[key] ?? null });
  }
  return { driftDetected: drift.length > 0, drift, checkedAt: new Date().toISOString() };
}
