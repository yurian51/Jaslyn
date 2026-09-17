const finite = (value, name, min = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) throw new Error(`${name} must be a finite number >= ${min}`);
  return n;
};

export function normalizePlan(plan) {
  if (!plan?.id || !plan?.name) throw new Error("Plan id and name are required");
  const downloadMbps = finite(plan.downloadMbps, "downloadMbps", 0.001);
  const uploadMbps = finite(plan.uploadMbps, "uploadMbps", 0.001);
  const quotaBytes = plan.quotaBytes == null ? null : finite(plan.quotaBytes, "quotaBytes");
  const validitySeconds = finite(plan.validitySeconds, "validitySeconds", 1);
  const deviceLimit = finite(plan.deviceLimit ?? 1, "deviceLimit", 1);
  return Object.freeze({ id: String(plan.id), name: String(plan.name), downloadMbps, uploadMbps, quotaBytes, validitySeconds, deviceLimit });
}

export function compileNetworkPolicy(plan) {
  const normalized = normalizePlan(plan);
  return Object.freeze({
    version: 1,
    planId: normalized.id,
    name: normalized.name,
    bandwidth: { downloadMbps: normalized.downloadMbps, uploadMbps: normalized.uploadMbps },
    quotaBytes: normalized.quotaBytes,
    validitySeconds: normalized.validitySeconds,
    deviceLimit: normalized.deviceLimit,
    authorization: { sessionTimeoutSeconds: normalized.validitySeconds, simultaneousSessions: normalized.deviceLimit },
    vendorNeutral: true,
  });
}

export function compileRadiusMikrotik(policy) {
  if (!policy?.bandwidth || !policy?.authorization) throw new Error("A normalized network policy is required");
  return {
    attributes: {
      "Mikrotik-Rate-Limit": `${policy.bandwidth.downloadMbps}M/${policy.bandwidth.uploadMbps}M`,
      "Session-Timeout": String(policy.authorization.sessionTimeoutSeconds),
      "Port-Limit": String(policy.authorization.simultaneousSessions),
    },
    unsupportedWithoutAdapter: policy.quotaBytes == null ? [] : ["quotaBytes"],
    sourcePolicyVersion: policy.version,
  };
}

export function policyFingerprint(policy) {
  return JSON.stringify({
    version: policy.version,
    planId: policy.planId,
    bandwidth: policy.bandwidth,
    quotaBytes: policy.quotaBytes,
    validitySeconds: policy.validitySeconds,
    deviceLimit: policy.deviceLimit,
  });
}
