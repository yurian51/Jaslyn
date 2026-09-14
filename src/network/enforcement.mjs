import { buildEnforcementPolicy, normalizeClientIdentity } from "./wifi-billing.mjs";

const REQUIRED_CAPABILITIES = Object.freeze(["bandwidth"]);

export class NetworkEnforcementOrchestrator {
  #registry;
  constructor({ registry }) { if (!registry || typeof registry.get !== "function") throw new TypeError("registry with get() is required"); this.#registry = registry; }
  async enforce({ protocol, plan, client, context = {} }) {
    const registration = this.#registry.get(protocol);
    if (!registration) return { ok: false, status: "blocked", reason: "UNSUPPORTED_NETWORK_PROTOCOL", protocol: String(protocol ?? "").toUpperCase(), client: client ?? null };
    let policy; let normalizedClient;
    try { policy = buildEnforcementPolicy(plan); normalizedClient = normalizeClientIdentity(client); }
    catch (error) { return { ok: false, status: "blocked", reason: "INVALID_NETWORK_REQUEST", protocol: registration.protocol, error: safeError(error), client: client ?? null }; }
    const missing = REQUIRED_CAPABILITIES.filter((capability) => !registration.capabilities.includes(capability));
    if (missing.length) return { ok: false, status: "blocked", reason: "ADAPTER_CAPABILITY_MISSING", missingCapabilities: missing, protocol: registration.protocol, client: normalizedClient };
    let health;
    try { health = await registration.adapter.health({ context }); }
    catch (error) { return { ok: false, status: "blocked", reason: "NETWORK_ADAPTER_HEALTHCHECK_FAILED", protocol: registration.protocol, error: safeError(error), client: normalizedClient }; }
    if (!health?.ok) return { ok: false, status: "blocked", reason: "NETWORK_ADAPTER_UNHEALTHY", protocol: registration.protocol, health: sanitizeHealth(health), client: normalizedClient };
    let result;
    try { result = await registration.adapter.enforcePolicy({ client: normalizedClient, policy, context }); }
    catch (error) { return { ok: false, status: "failed", reason: "NETWORK_POLICY_ENFORCEMENT_FAILED", protocol: registration.protocol, error: safeError(error), client: normalizedClient }; }
    if (!result?.ok) return { ok: false, status: "failed", reason: "NETWORK_POLICY_REJECTED", protocol: registration.protocol, result: safeResult(result), client: normalizedClient };
    return { ok: true, status: "enforced", protocol: registration.protocol, client: normalizedClient, policy, result: safeResult(result) };
  }
}
function sanitizeHealth(health) { if (!health || typeof health !== "object") return null; return { ok: Boolean(health.ok), status: health.status == null ? null : String(health.status), code: health.code == null ? null : String(health.code) }; }
function safeError(error) { return { code: error?.code == null ? "NETWORK_ADAPTER_ERROR" : String(error.code), message: error?.message == null ? "Network adapter operation failed" : String(error.message) }; }
function safeResult(result) { if (!result || typeof result !== "object") return result ?? null; const safe = {}; for (const [key, value] of Object.entries(result)) { if (/token|secret|password|authorization|api[-_]?key/i.test(key)) continue; safe[key] = value; } return safe; }
