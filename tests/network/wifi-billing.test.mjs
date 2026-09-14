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

test("plan normalization rejects unsupported currency and invalid monetary units", () => {
  assert.throws(() => createWifiPlan({ ...plan, currency: "NOT" }), /Unsupported currency/);
  assert.throws(() => createWifiPlan({ ...plan, currency: "US" }), /Unsupported currency/);
  assert.throws(() => createWifiPlan({ ...plan, priceMinor: -1 }), /priceMinor/);
  assert.throws(() => createWifiPlan({ ...plan, priceMinor: 1.5 }), /priceMinor.*integer/);
  assert.throws(() => createWifiPlan({ ...plan, dataLimitBytes: 1.5 }), /dataLimitBytes.*integer/);
  assert.throws(() => createWifiPlan({ ...plan, downloadKbps: 1.5 }), /downloadKbps.*integer/);
  assert.throws(() => createWifiPlan({ ...plan, simultaneousDevices: 1.5 }), /simultaneousDevices.*integer/);
  assert.equal(createWifiPlan({ ...plan, currency: "EUR" }).currency, "EUR");
});

test("client identity normalizes MAC addresses and validates IP addresses", () => {
  const engine = new WifiBillingEngine({ idFactory: () => "session-1", clock: () => 1_000_000 });
  engine.addPlan(plan);
  const session = engine.startSession({ planId: plan.id, client: { macAddress: "AA-BB-CC-DD-EE-FF" } });
  assert.equal(session.client.macAddress, "aa:bb:cc:dd:ee:ff");
  assert.throws(() => engine.startSession({ planId: plan.id, client: { ipAddress: "not-an-ip" } }), /valid IPv4 or IPv6/);
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

test("expired sessions are closed automatically and no longer consume device slots", () => {
  let now = 1000;
  let nextId = 0;
  const shortPlan = { ...plan, durationSeconds: 10, simultaneousDevices: 1 };
  const engine = new WifiBillingEngine({ idFactory: () => `s-${++nextId}`, clock: () => now });
  engine.addPlan(shortPlan);
  const first = engine.startSession({ planId: shortPlan.id, client: { username: "subscriber-1" } });
  now = 11_000;
  assert.equal(engine.expireSessions(), 1);
  assert.equal(engine.getSession(first.id).status, "closed");
  const second = engine.startSession({ planId: shortPlan.id, client: { username: "subscriber-1" } });
  assert.equal(second.status, "active");
  assert.equal(second.id, "s-2");
});

test("usage at or after expiry closes the session and rejects the write", () => {
  let now = 1000;
  const shortPlan = { ...plan, durationSeconds: 10 };
  const engine = new WifiBillingEngine({ idFactory: () => "s-1", clock: () => now });
  engine.addPlan(shortPlan);
  engine.startSession({ planId: shortPlan.id, client: { ipAddress: "10.0.0.10" } });
  now = 11_000;
  assert.throws(() => engine.recordUsage("s-1", { downloadBytes: 1 }), /SESSION_EXPIRED/);
  const session = engine.getSession("s-1");
  assert.equal(session.status, "closed");
  assert.equal(session.endedAt, 11_000);
});

test("usage rejects non-integer byte counters and preserves quota state on rejection", () => {
  const engine = new WifiBillingEngine({ idFactory: () => "s-1", clock: () => 1000 });
  engine.addPlan({ ...plan, dataLimitBytes: 100 });
  engine.startSession({ planId: plan.id, client: { ipAddress: "10.0.0.10" } });
  assert.throws(() => engine.recordUsage("s-1", { downloadBytes: 1.5 }), /downloadBytes.*integer/);
  assert.throws(() => engine.recordUsage("s-1", { downloadBytes: 101 }), /DATA_QUOTA_EXCEEDED/);
  assert.deepEqual(engine.getSession("s-1").usage, { uploadBytes: 0, downloadBytes: 0 });
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

test("manual close clamps billing session to plan duration", () => {
  const shortPlan = { ...plan, durationSeconds: 10 };
  const engine = new WifiBillingEngine({ idFactory: () => "s-1" });
  engine.addPlan(shortPlan);
  engine.startSession({ planId: shortPlan.id, client: { username: "subscriber-1" }, startedAt: 1000 });
  const closed = engine.closeSession("s-1", { endedAt: 100_000 });
  assert.equal(closed.endedAt, 11_000);
  assert.equal(closed.chargedMinor, 5000);
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
