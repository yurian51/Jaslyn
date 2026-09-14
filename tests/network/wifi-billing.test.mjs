import test from "node:test";
import assert from "node:assert/strict";
import { createWifiPlan, NetworkAdapterRegistry, WifiBillingEngine, buildEnforcementPolicy } from "../../src/network/wifi-billing.mjs";

const plan = createWifiPlan({ id: "daily-10mbps", name: "Daily 10 Mbps", currency: "TZS", priceMinor: 5000, durationSeconds: 86400, dataLimitBytes: 5_000_000_000, downloadKbps: 10_000, uploadKbps: 5_000, simultaneousDevices: 2 });

test("plan and identity validation are strict", () => {
  assert.throws(() => createWifiPlan({ ...plan, currency: "NOT" }), /Unsupported currency/);
  assert.throws(() => createWifiPlan({ ...plan, priceMinor: 1.5 }), /priceMinor.*integer/);
  const engine = new WifiBillingEngine({ idFactory: () => "s-1", clock: () => 1000 }); engine.addPlan(plan);
  assert.equal(engine.startSession({ planId: plan.id, client: { macAddress: "AA-BB-CC-DD-EE-FF" } }).client.macAddress, "aa:bb:cc:dd:ee:ff");
  assert.throws(() => engine.startSession({ planId: plan.id, client: { ipAddress: "not-an-ip" } }), /valid IPv4 or IPv6/);
});

test("subscriber device limits and duplicate sessions are enforced", () => {
  let nextId = 0; const engine = new WifiBillingEngine({ idFactory: () => `s-${++nextId}`, clock: () => 1000 }); engine.addPlan({ ...plan, simultaneousDevices: 2 });
  engine.startSession({ planId: plan.id, client: { subscriberId: "sub-1", macAddress: "00:11:22:33:44:55" } });
  engine.startSession({ planId: plan.id, client: { subscriberId: "sub-1", macAddress: "00:11:22:33:44:66" } });
  assert.throws(() => engine.startSession({ planId: plan.id, client: { subscriberId: "sub-1", macAddress: "00:11:22:33:44:77" } }), /SIMULTANEOUS_DEVICE_LIMIT_REACHED/);
  assert.throws(() => engine.startSession({ planId: plan.id, client: { subscriberId: "sub-1", macAddress: "00:11:22:33:44:55" } }), /SIMULTANEOUS_DEVICE_LIMIT_REACHED|CLIENT_SESSION_ALREADY_ACTIVE/);
});

test("sessions expire, quota is atomic, and purchased plan terms are immutable", () => {
  let now = 1000; const engine = new WifiBillingEngine({ idFactory: () => "s-1", clock: () => now });
  engine.addPlan({ ...plan, durationSeconds: 10, dataLimitBytes: 100, priceMinor: 5000, downloadKbps: 1000 });
  const session = engine.startSession({ planId: plan.id, client: { username: "alice" } });
  assert.throws(() => engine.recordUsage(session.id, { downloadBytes: 101 }), /DATA_QUOTA_EXCEEDED/);
  assert.deepEqual(engine.getSession(session.id).usage, { uploadBytes: 0, downloadBytes: 0 });
  engine.upsertPlan({ ...plan, durationSeconds: 100, dataLimitBytes: 1000, priceMinor: 9000, downloadKbps: 50_000 });
  assert.equal(engine.getSession(session.id).policy.durationSeconds, 10);
  now = 11_000; assert.equal(engine.expireSessions(), 1); const closed = engine.getSession(session.id); assert.equal(closed.status, "closed"); assert.equal(closed.chargedMinor, 5000);
});

test("enforcement policy and adapter registry are provider-neutral", () => {
  assert.deepEqual(buildEnforcementPolicy(plan), { planId: plan.id, bandwidth: { downloadKbps: 10_000, uploadKbps: 5_000 }, quota: 5_000_000_000, durationSeconds: 86400 });
  const registry = new NetworkAdapterRegistry();
  assert.throws(() => registry.register({ protocol: "MERAKI_DASHBOARD_API", capabilities: "bandwidth", adapter: {} }), /capabilities must be an array/);
  registry.register({ protocol: "MERAKI_DASHBOARD_API", capabilities: ["bandwidth", "bandwidth"], adapter: { health: async () => ({ ok: true }), enforcePolicy: async () => ({ ok: true }) } });
  assert.deepEqual(registry.list(), [{ protocol: "MERAKI_DASHBOARD_API", capabilities: ["bandwidth"] }]);
});
