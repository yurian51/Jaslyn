import test from "node:test";
import assert from "node:assert/strict";
import { NetworkAdapterRegistry, createWifiPlan } from "../../src/network/wifi-billing.mjs";
import { NetworkEnforcementOrchestrator } from "../../src/network/enforcement.mjs";

const plan = createWifiPlan({ id: "weekly", name: "Weekly", currency: "TZS", priceMinor: 15000, durationSeconds: 604800, dataLimitBytes: 20_000_000_000, downloadKbps: 20_000, uploadKbps: 10_000 });
function registryWith(adapter, capabilities = ["bandwidth"]) { const registry = new NetworkAdapterRegistry(); registry.register({ protocol: "MERAKI_DASHBOARD_API", capabilities, adapter }); return registry; }

test("unsupported protocol and missing capabilities fail closed", async () => {
  let called = false; const orchestrator = new NetworkEnforcementOrchestrator({ registry: registryWith({ health: async () => ({ ok: true }), enforcePolicy: async () => { called = true; return { ok: true }; } }) });
  const unsupported = await orchestrator.enforce({ protocol: "SNMP", plan, client: { username: "alice" } }); assert.equal(unsupported.reason, "UNSUPPORTED_NETWORK_PROTOCOL"); assert.equal(called, false);
  const missing = await new NetworkEnforcementOrchestrator({ registry: registryWith({ health: async () => ({ ok: true }), enforcePolicy: async () => ({ ok: true }) }, []) }).enforce({ protocol: "MERAKI_DASHBOARD_API", plan, client: { username: "alice" } });
  assert.equal(missing.reason, "ADAPTER_CAPABILITY_MISSING");
});

test("invalid request and unhealthy adapter never mutate network state", async () => {
  let called = false; const orchestrator = new NetworkEnforcementOrchestrator({ registry: registryWith({ health: async () => { called = true; return { ok: false, status: "offline", code: "TIMEOUT", secret: "x" }; }, enforcePolicy: async () => ({ ok: true }) }) });
  const result = await orchestrator.enforce({ protocol: "MERAKI_DASHBOARD_API", plan, client: { ipAddress: "bad" } }); assert.equal(result.reason, "INVALID_NETWORK_REQUEST"); assert.equal(called, false);
  const healthyResult = await orchestrator.enforce({ protocol: "MERAKI_DASHBOARD_API", plan, client: { username: "alice" } }); assert.equal(healthyResult.reason, "NETWORK_ADAPTER_UNHEALTHY"); assert.deepEqual(healthyResult.health, { ok: false, status: "offline", code: "TIMEOUT" });
});

test("adapter exceptions and rejections are contained without credential leakage", async () => {
  const rejected = new NetworkEnforcementOrchestrator({ registry: registryWith({ health: async () => ({ ok: true }), enforcePolicy: async () => ({ ok: false, code: "RATE_LIMITED", apiKey: "secret", token: "secret" }) }) });
  const result = await rejected.enforce({ protocol: "MERAKI_DASHBOARD_API", plan, client: { username: "alice" } }); assert.equal(result.reason, "NETWORK_POLICY_REJECTED"); assert.deepEqual(result.result, { ok: false, code: "RATE_LIMITED" });
  const failed = new NetworkEnforcementOrchestrator({ registry: registryWith({ health: async () => ({ ok: true }), enforcePolicy: async () => { throw Object.assign(new Error("remote failed"), { code: "REMOTE_500" }); } }) });
  const failure = await failed.enforce({ protocol: "MERAKI_DASHBOARD_API", plan, client: { username: "alice" } }); assert.deepEqual(failure.error, { code: "REMOTE_500", message: "remote failed" });
});
