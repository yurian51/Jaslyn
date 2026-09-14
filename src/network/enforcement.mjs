import { buildEnforcementPolicy } from "./wifi-billing.mjs";

const REQUIRED_CAPABILITIES = Object.freeze(["bandwidth"]);

export class NetworkEnforcementOrchestrator {
  #registry;

  constructor({ registry }) {
    if (!registry || typeof registry.get !== "function") throw new TypeError("registry with get() is required");
    this.#registry = registry;
  }

  async enforce({ protocol, plan, client, context = {} }) {
    const registration = this.#registry.get(protocol);
    if (!registration) {
      return {
        ok: false,
        status: "blocked",
        reason: "UNSUPPORTED_NETWORK_PROTOCOL",
        protocol: String(protocol ?? "").toUpperCase(),
        client: client ?? null
      };
    }

    const policy = buildEnforcementPolicy(plan);
    const missing = REQUIRED_CAPABILITIES.filter((capability) => !registration.capabilities.includes(capability));
    if (missing.length) {
      return {
        ok: false,
        status: "blocked",
        reason: "ADAPTER_CAPABILITY_MISSING",
        missingCapabilities: missing,
        protocol: registration.protocol,
        client: client ?? null
      };
    }

    const health = await registration.adapter.health({ context });
    if (!health?.ok) {
      return {
        ok: false,
        status: "blocked",
        reason: "NETWORK_ADAPTER_UNHEALTHY",
        protocol: registration.protocol,
        health: sanitizeHealth(health),
        client: client ?? null
      };
    }

    const result = await registration.adapter.enforcePolicy({
      client,
      policy,
      context
    });

    if (!result?.ok) {
      return {
        ok: false,
        status: "failed",
        reason: "NETWORK_POLICY_REJECTED",
        protocol: registration.protocol,
        result: result ?? null,
        client: client ?? null
      };
    }

    return {
      ok: true,
      status: "enforced",
      protocol: registration.protocol,
      client: client ?? null,
      policy,
      result
    };
  }
}

function sanitizeHealth(health) {
  if (!health || typeof health !== "object") return null;
  return {
    ok: Boolean(health.ok),
    status: health.status == null ? null : String(health.status),
    code: health.code == null ? null : String(health.code)
  };
}
