import test from "node:test";
import assert from "node:assert/strict";
import { NetworkAdapterRegistry, createWifiPlan } from "../../src/network/wifi-billing.mjs";
import { NetworkEnforcementOrchestrator } from "../../src/network/enforcement.mjs";

const plan = createWifiPlan({
  id: "weekly-20mbps",
  name: "Weekly 20 Mbps",
  currency: "TZS",
  priceMinor: 15000,
  durationSeconds: 604800,
  dataLimitBytes: 20_000_000_000,
  downloadKbps: 20_000,
  uploadKbps: 10_000
});

function registryWith(adapter, capabilities = ["bandwidth"]) {
  const registry = new NetworkAdapterRegistry();
  registry.register({ protocol: "MERAKI_DASHBOARD_API", capabilities, adapter });
  return registry;
}

test("unsupported protocol fails closed without invoking an adapter", async () => {
  let called = false;
  const orchestrator = new NetworkEnforcementOrchestrator({ registry: registryWith({
    health: async () => ({ ok: true }),
    enforcePolicy: async () => { called = true; return { ok: true }; }
  }) });
  const result = await orchestrator.enforce({ protocol: "SNMP", plan, client: { macAddress: "00:11:22:33:44:55" } });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "UNSUPPORTED_NETWORK_PROTOCOL");
  assert.equal(called, false);
});

test("missing capability blocks enforcement before network mutation", async () => {
  let called = false;
  const orchestrator = new NetworkEnforcementOrchestrator({ registry: registryWith({
    health: async () => ({ ok: true }),
    enforcePolicy: async () => { called = true; return { ok: true }; }
  }, []) });
  const result = await orchestrator.enforce({ protocol: "MERAKI_DASHBOARD_API", plan, client: { username: "alice" } });
  assert.equal(result.reason, "ADAPTER_CAPABILITY_MISSING");
  assert.deepEqual(result.missingCapabilities, ["bandwidth"]);
  assert.equal(called, false);
});

test("unhealthy adapter blocks enforcement", async () => {
  let called = false;
  const orchestrator = new NetworkEnforcementOrchestrator({ registry: registryWith({
    health: async () => ({ ok: false, status: "offline", code: "TIMEOUT", secret: "must-not-leak" }),
    enforcePolicy: async () => { called = true; return { ok: true }; }
  }) });
  const result = await orchestrator.enforce({ protocol: "MERAKI_DASHBOARD_API", plan, client: { username: "alice" } });
  assert.equal(result.reason, "NETWORK_ADAPTER_UNHEALTHY");
  assert.deepEqual(result.health, { ok: false, status: "offline", code: "TIMEOUT" });
  assert.equal(called, false);
});

test("healthy adapter receives normalized provider-neutral policy", async () => {
  let received;
  const orchestrator = new NetworkEnforcementOrchestrator({ registry: registryWith({
    health: async () => ({ ok: true }),
    enforcePolicy: async (request) => { received = request; return { ok: true, remotePolicyId: "gp-123" }; }
  }) });
  const result = await orchestrator.enforce({ protocol: "MERAKI_DASHBOARD_API", plan, client: { macAddress: "00-11-22-33-44-55" }, context: { requestId: "req-1" } });
  assert.equal(result.status, "enforced");
  assert.equal(received.client.macAddress, "00-11-22-33-44-55");
  assert.deepEqual(received.policy.bandwidth, { downloadKbps: 20_000, uploadKbps: 10_000 });
  assert.equal(received.policy.quota, 20_000_000_000);
  assert.equal(received.context.requestId, "req-1");
  assert.deepEqual(result.result, { ok: true, remotePolicyId: "gp-123" });
});

test("adapter rejection is surfaced as a failed enforcement result", async () => {
  const orchestrator = new NetworkEnforcementOrchestrator({ registry: registryWith({
    health: async () => ({ ok: true }),
    enforcePolicy: async () => ({ ok: false, code: "RATE_LIMITED" })
  }) });
  const result = await orchestrator.enforce({ protocol: "MERAKI_DASHBOARD_API", plan, client: { username: "alice" } });
  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "NETWORK_POLICY_REJECTED");
  assert.deepEqual(result.result, { ok: false, code: "RATE_LIMITED" });
});
