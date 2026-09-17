import { MikroTikRestProvider } from "./providers/mikrotik-rest.mjs";
import { compileNetworkPolicy, compileRadiusMikrotik, normalizePlan } from "./policy.mjs";
import { reconcilePaymentAccess } from "./reconcile.mjs";
import { databaseHealth } from "./db.mjs";

function env(name) {
  const value = process.env[name];
  return value?.trim() || null;
}

export function getNetworkRuntime() {
  const providerConfigured = Boolean(env("JASLYN_MIKROTIK_URL") && env("JASLYN_MIKROTIK_USERNAME") && env("JASLYN_MIKROTIK_PASSWORD"));
  const databaseConfigured = Boolean(env("DATABASE_URL"));
  return {
    configured: providerConfigured || databaseConfigured,
    provider: providerConfigured ? "mikrotik-rest" : null,
    capabilities: {
      policyCompiler: true,
      reconciliation: true,
      durableAuthorization: databaseConfigured,
      paymentActivationBoundary: Boolean(databaseConfigured && env("JASLYN_PAYMENT_ACTIVATION_KEY")),
      mikrotikHealth: providerConfigured,
      hotspotSessions: providerConfigured,
      networkCommands: providerConfigured,
      radiusTransport: false,
      persistentBilling: databaseConfigured,
      transactionalDatabase: databaseConfigured,
    },
  };
}

export async function checkNetworkHealth() {
  const runtime = getNetworkRuntime();
  if (!runtime.capabilities.mikrotikHealth) return { ok: false, configured: false, provider: null, error: "MikroTik REST credentials are not configured." };
  const provider = new MikroTikRestProvider({
    baseUrl: env("JASLYN_MIKROTIK_URL"),
    username: env("JASLYN_MIKROTIK_USERNAME"),
    password: env("JASLYN_MIKROTIK_PASSWORD"),
  });
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
