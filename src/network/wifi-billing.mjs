import { randomUUID } from "node:crypto";

const SUPPORTED_CURRENCIES = new Set([
  "TZS", "KES", "UGX", "RWF", "BIF", "ETB", "NGN", "GHS", "ZAR", "USD", "EUR", "GBP"
]);

const ADAPTER_PROTOCOLS = new Set([
  "MIKROTIK_API",
  "MERAKI_DASHBOARD_API",
  "UNIFI_API",
  "OPENWRT_API",
  "RADIUS",
  "GENERIC_HTTP"
]);

function assertFinitePositive(value, field) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${field} must be a finite positive number`);
  return value;
}

function assertNonNegative(value, field) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${field} must be a finite non-negative number`);
  return value;
}

function normalizeMac(mac) {
  const value = String(mac ?? "").trim().toLowerCase().replace(/[^0-9a-f]/g, "");
  if (!/^[0-9a-f]{12}$/.test(value)) throw new TypeError("macAddress must contain exactly 12 hexadecimal characters");
  return value.match(/.{2}/g).join(":");
}

function normalizeCurrency(currency) {
  const value = String(currency ?? "").trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(value)) throw new TypeError(`Unsupported currency: ${value || "empty"}`);
  return value;
}

function normalizePlan(plan) {
  if (!plan || typeof plan !== "object") throw new TypeError("plan is required");
  const normalized = {
    id: String(plan.id ?? "").trim(),
    name: String(plan.name ?? "").trim(),
    currency: normalizeCurrency(plan.currency),
    priceMinor: assertNonNegative(plan.priceMinor, "priceMinor"),
    durationSeconds: assertFinitePositive(plan.durationSeconds, "durationSeconds"),
    dataLimitBytes: plan.dataLimitBytes == null ? null : assertFinitePositive(plan.dataLimitBytes, "dataLimitBytes"),
    downloadKbps: plan.downloadKbps == null ? null : assertFinitePositive(plan.downloadKbps, "downloadKbps"),
    uploadKbps: plan.uploadKbps == null ? null : assertFinitePositive(plan.uploadKbps, "uploadKbps"),
    simultaneousDevices: plan.simultaneousDevices == null ? 1 : Math.max(1, Math.floor(assertFinitePositive(plan.simultaneousDevices, "simultaneousDevices")))
  };
  if (!normalized.id || !normalized.name) throw new TypeError("plan.id and plan.name are required");
  return Object.freeze(normalized);
}

export function createWifiPlan(plan) {
  return normalizePlan(plan);
}

export function normalizeClientIdentity(identity) {
  if (!identity || typeof identity !== "object") throw new TypeError("client identity is required");
  const macAddress = identity.macAddress ? normalizeMac(identity.macAddress) : null;
  const username = identity.username == null ? null : String(identity.username).trim();
  const ipAddress = identity.ipAddress == null ? null : String(identity.ipAddress).trim();
  if (!macAddress && !username && !ipAddress) throw new TypeError("client identity requires macAddress, username, or ipAddress");
  return Object.freeze({ macAddress, username: username || null, ipAddress: ipAddress || null });
}

export class WifiBillingEngine {
  #plans = new Map();
  #sessions = new Map();
  #clock;
  #idFactory;

  constructor({ clock = () => Date.now(), idFactory = randomUUID } = {}) {
    this.#clock = clock;
    this.#idFactory = idFactory;
  }

  addPlan(plan) {
    const normalized = normalizePlan(plan);
    if (this.#plans.has(normalized.id)) throw new Error(`Plan already exists: ${normalized.id}`);
    this.#plans.set(normalized.id, normalized);
    return normalized;
  }

  upsertPlan(plan) {
    const normalized = normalizePlan(plan);
    this.#plans.set(normalized.id, normalized);
    return normalized;
  }

  getPlan(planId) { return this.#plans.get(String(planId)) ?? null; }
  listPlans() { return [...this.#plans.values()]; }

  startSession({ planId, client, startedAt = this.#clock() }) {
    const plan = this.#plans.get(String(planId));
    if (!plan) throw new Error(`Unknown plan: ${planId}`);
    const identity = normalizeClientIdentity(client);
    if (!Number.isFinite(startedAt)) throw new TypeError("startedAt must be a timestamp");
    const activeForClient = [...this.#sessions.values()].filter((session) => session.status === "active" && sameIdentity(session.client, identity));
    if (activeForClient.length >= plan.simultaneousDevices) throw new Error("SIMULTANEOUS_DEVICE_LIMIT_REACHED");

    const id = String(this.#idFactory());
    const session = {
      id,
      planId: plan.id,
      client: identity,
      startedAt,
      endedAt: null,
      status: "active",
      usage: { uploadBytes: 0, downloadBytes: 0 },
      chargedMinor: 0,
      currency: plan.currency
    };
    this.#sessions.set(id, session);
    return snapshotSession(session, plan);
  }

  recordUsage(sessionId, { uploadBytes = 0, downloadBytes = 0, at = this.#clock() } = {}) {
    const session = this.#sessions.get(String(sessionId));
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    if (session.status !== "active") throw new Error("SESSION_NOT_ACTIVE");
    assertNonNegative(uploadBytes, "uploadBytes");
    assertNonNegative(downloadBytes, "downloadBytes");
    if (!Number.isFinite(at)) throw new TypeError("at must be a timestamp");
    if (at < session.startedAt) throw new Error("USAGE_TIMESTAMP_BEFORE_SESSION");
    const plan = this.#plans.get(session.planId);
    const nextTotal = session.usage.uploadBytes + session.usage.downloadBytes + uploadBytes + downloadBytes;
    if (plan.dataLimitBytes != null && nextTotal > plan.dataLimitBytes) throw new Error("DATA_QUOTA_EXCEEDED");
    if (at - session.startedAt > plan.durationSeconds * 1000) throw new Error("SESSION_DURATION_EXCEEDED");
    session.usage.uploadBytes += uploadBytes;
    session.usage.downloadBytes += downloadBytes;
    return snapshotSession(session, plan);
  }

  closeSession(sessionId, { endedAt = this.#clock() } = {}) {
    const session = this.#sessions.get(String(sessionId));
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    if (session.status !== "active") throw new Error("SESSION_NOT_ACTIVE");
    if (!Number.isFinite(endedAt) || endedAt < session.startedAt) throw new TypeError("endedAt must be a timestamp after startedAt");
    const plan = this.#plans.get(session.planId);
    session.endedAt = endedAt;
    session.status = "closed";
    session.chargedMinor = calculateCharge(plan, session.startedAt, endedAt, session.usage);
    return snapshotSession(session, plan);
  }

  getSession(sessionId) {
    const session = this.#sessions.get(String(sessionId));
    return session ? snapshotSession(session, this.#plans.get(session.planId)) : null;
  }

  listSessions({ status } = {}) {
    return [...this.#sessions.values()].filter((session) => !status || session.status === status).map((session) => snapshotSession(session, this.#plans.get(session.planId)));
  }
}

export class NetworkAdapterRegistry {
  #adapters = new Map();

  register({ protocol, capabilities = [], adapter }) {
    const key = String(protocol ?? "").trim().toUpperCase();
    if (!ADAPTER_PROTOCOLS.has(key)) throw new TypeError(`Unsupported adapter protocol: ${key}`);
    if (!adapter || typeof adapter !== "object") throw new TypeError("adapter is required");
    if (typeof adapter.health !== "function" || typeof adapter.enforcePolicy !== "function") throw new TypeError("adapter must expose health() and enforcePolicy()");
    const normalizedCapabilities = [...new Set(capabilities.map((value) => String(value).trim()).filter(Boolean))];
    this.#adapters.set(key, Object.freeze({ protocol: key, capabilities: Object.freeze(normalizedCapabilities), adapter }));
    return this.#adapters.get(key);
  }

  get(protocol) { return this.#adapters.get(String(protocol ?? "").trim().toUpperCase()) ?? null; }
  list() { return [...this.#adapters.values()].map(({ protocol, capabilities }) => ({ protocol, capabilities: [...capabilities] })); }
}

export function buildEnforcementPolicy(plan) {
  const normalized = normalizePlan(plan);
  return Object.freeze({
    planId: normalized.id,
    bandwidth: { downloadKbps: normalized.downloadKbps, uploadKbps: normalized.uploadKbps },
    quota: normalized.dataLimitBytes,
    durationSeconds: normalized.durationSeconds
  });
}

export function calculateCharge(plan, startedAt, endedAt, usage = { uploadBytes: 0, downloadBytes: 0 }) {
  const normalized = normalizePlan(plan);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) throw new TypeError("session timestamps must be valid and ordered");
  assertNonNegative(usage.uploadBytes, "usage.uploadBytes");
  assertNonNegative(usage.downloadBytes, "usage.downloadBytes");
  return endedAt === startedAt ? 0 : normalized.priceMinor;
}

function sameIdentity(a, b) {
  if (a.macAddress && b.macAddress) return a.macAddress === b.macAddress;
  if (a.username && b.username) return a.username === b.username;
  if (a.ipAddress && b.ipAddress) return a.ipAddress === b.ipAddress;
  return false;
}

function snapshotSession(session, plan) {
  return Object.freeze({
    id: session.id,
    planId: session.planId,
    client: session.client,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    status: session.status,
    usage: Object.freeze({ ...session.usage }),
    chargedMinor: session.chargedMinor,
    currency: plan?.currency ?? session.currency,
    policy: plan ? buildEnforcementPolicy(plan) : null
  });
}

export const WIFI_BILLING_CAPABILITIES = Object.freeze([
  "multi-currency-plans",
  "time-based-sessions",
  "data-usage-accounting",
  "bandwidth-policy-generation",
  "simultaneous-device-limits",
  "provider-neutral-adapter-registry",
  "mac-username-ip-client-identity",
  "fail-closed-validation"
]);
