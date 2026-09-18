import { createNetworkProvider, getProviderTypes } from "./providers/registry.mjs";
import { compileNetworkPolicy, compileRadiusMikrotik, normalizePlan } from "./policy.mjs";
import { reconcilePaymentAccess } from "./reconcile.mjs";
import { databaseHealth } from "./db.mjs";

function env(name) {
  const value = process.env[name];
  return value?.trim() || null;
}

function mikrotikConfigured() {
  return Boolean(env("JASLYN_MIKROTIK_URL") && env("JASLYN_MIKROTIK_USERNAME") && env("JASLYN_MIKROTIK_PASSWORD"));
}

function omadaConfigured() {
  return Boolean(env("JASLYN_OMADA_URL") && env("JASLYN_OMADA_ID") && env("JASLYN_OMADA_CLIENT_ID") && env("JASLYN_OMADA_CLIENT_SECRET"));
}

function selectedProviderType() {
  const requested = env("JASLYN_NETWORK_PROVIDER");
  if (requested) return requested;
  if (mikrotikConfigured()) return "mikrotik-rest";
  if (omadaConfigured()) return "omada-openapi";
  return null;
}

export function getNetworkProvider() {
  const type = selectedProviderType();
  if (type === "mikrotik-rest" && mikrotikConfigured()) {
    return createNetworkProvider({
      type,
      baseUrl: env("JASLYN_MIKROTIK_URL"),
      username: env("JASLYN_MIKROTIK_USERNAME"),
      password: env("JASLYN_MIKROTIK_PASSWORD"),
    });
  }
  if (type === "omada-openapi" && omadaConfigured()) {
    return createNetworkProvider({
      type,
      baseUrl: env("JASLYN_OMADA_URL"),
      omadacId: env("JASLYN_OMADA_ID"),
      clientId: env("JASLYN_OMADA_CLIENT_ID"),
      clientSecret: env("JASLYN_OMADA_CLIENT_SECRET"),
    });
  }
  return null;
}
export function getNetworkRuntime() {
  const provider = getNetworkProvider();
  const databaseConfigured = Boolean(env("DATABASE_URL"));
  return {
    configured: Boolean(provider || databaseConfigured),
    provider: provider?.name ?? null,
    registeredProviders: getProviderTypes(),
    providerCapabilities: provider?.getCapabilities?.() ?? null,
    capabilities: {
      policyCompiler: true,
      reconciliation: true,
      durableAuthorization: databaseConfigured,
      paymentActivationBoundary: Boolean(databaseConfigured && env("JASLYN_PAYMENT_ACTIVATION_KEY")),
      providerHealth: Boolean(provider?.getCapabilities?.().health),
      mikrotikHealth: Boolean(provider?.name === "mikrotik-rest" && provider?.getCapabilities?.().health),
      sessions: Boolean(provider?.getCapabilities?.().sessions),
      hotspotSessions: Boolean(provider?.getCapabilities?.().hotspot),
      pppoeSessions: Boolean(provider?.getCapabilities?.().pppoe),
      clients: Boolean(provider?.getCapabilities?.().clients),
      devices: Boolean(provider?.getCapabilities?.().devices),
      interfaces: Boolean(provider?.getCapabilities?.().interfaces),
      telemetry: Boolean(provider?.getCapabilities?.().metrics),
      networkCommands: Boolean(provider?.getCapabilities?.().disconnect),
      radiusTransport: false,
      radiusAccountingTransport: Boolean(env("JASLYN_RADIUS_CLIENTS_JSON")),
      persistentBilling: databaseConfigured,
      transactionalDatabase: databaseConfigured,
    },
  };
}

export async function checkNetworkHealth() {
  const provider = getNetworkProvider();
  if (!provider) return { ok: false, configured: false, provider: null, error: "MikroTik REST credentials are not configured." };
  return { configured: true, ...(await provider.health()) };
}

export { databaseHealth };

export function compilePlan(plan) {
  const policy = compileNetworkPolicy(normalizePlan(plan));
  return { policy, radius: compileRadiusMikrotik(policy) };
}

export function reconcileAccess(input) {
  return reconcilePaymentAccess(input);
}
