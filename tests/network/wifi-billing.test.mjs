import test from "node:test";
import assert from "node:assert/strict";
import { createWifiPlan, NetworkAdapterRegistry, WifiBillingEngine, buildEnforcementPolicy } from "../../src/network/wifi-billing.mjs";

const plan = createWifiPlan({
  id: "daily-10mbps",
  name: "Daily 10 Mbps",
  currency: "TZS",
  priceMinor: 5000,
  durationSeconds: 86400,
  dataLimitBytes: 5_000_000_000,
  downloadKbps: 10_000,
  uploadKbps: 5_000,
  simultaneousDevices: 2
});

test("plan normalization rejects invalid currency and negative prices", () => {
  assert.throws(() => createWifiPlan({ ...plan, currency: "XXX" }), /Unsupported currency/);
  assert.throws(() => createWifiPlan({ ...plan, priceMinor: -1 }), /priceMinor/);
});

test("client identity normalizes MAC addresses", () => {
  const engine = new WifiBillingEngine({ idFactory: () => "session-1", clock: () => 1_000_000 });
  engine.addPlan(plan);
  const session = engine.startSession({ planId: plan.id, client: { macAddress: "AA-BB-CC-DD-EE-FF" } });
  assert.equal(session.client.macAddress, "aa:bb:cc:dd:ee:ff");
});

test("simultaneous-device limit is enforced", () => {
  let nextId = 0;
  const engine = new WifiBillingEngine({ idFactory: () => `s-${++nextId}`, clock: () => 1000 });
  engine.addPlan({ ...plan, simultaneousDevices: 1 });
  engine.startSession({ planId: plan.id, client: { username: "subscriber-1" } });
  assert.throws(
    () => engine.startSession({ planId: plan.id, client: { username: "subscriber-1" } }),
    /SIMULTANEOUS_DEVICE_LIMIT_REACHED/
  );
});

test("usage cannot be recorded after session closure", () => {
  let now = 1000;
  const engine = new WifiBillingEngine({ idFactory: () => "s-1", clock: () => now });
  engine.addPlan(plan);
  engine.startSession({ planId: plan.id, client: { ipAddress: "10.0.0.10" } });
  now = 2000;
  engine.closeSession("s-1");
  assert.throws(() => engine.recordUsage("s-1", { downloadBytes: 1 }), /SESSION_NOT_ACTIVE/);
});

test("enforcement policy is provider-neutral and preserves bandwidth/quota", () => {
  const policy = buildEnforcementPolicy(plan);
  assert.deepEqual(policy, {
    planId: "daily-10mbps",
    bandwidth: { downloadKbps: 10_000, uploadKbps: 5_000 },
    quota: 5_000_000_000,
    durationSeconds: 86400
  });
});

test("adapter registry requires real health and enforcement methods", () => {
  const registry = new NetworkAdapterRegistry();
  assert.throws(
    () => registry.register({ protocol: "MERAKI_DASHBOARD_API", adapter: {} }),
    /health\(\) and enforcePolicy\(\)/
  );
  registry.register({
    protocol: "MERAKI_DASHBOARD_API",
    capabilities: ["bandwidth", "bandwidth"],
    adapter: { health: async () => ({ ok: true }), enforcePolicy: async () => ({ ok: true }) }
  });
  assert.deepEqual(registry.list(), [{ protocol: "MERAKI_DASHBOARD_API", capabilities: ["bandwidth"] }]);
});
