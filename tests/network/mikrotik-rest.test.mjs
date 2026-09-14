import test from "node:test";
import assert from "node:assert/strict";
import { createMikrotikRestAdapter } from "../../src/network/adapters/mikrotik-rest.mjs";

function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(body); } }; }

test("MikroTik health uses RouterOS REST and does not send a body", async () => {
  const requests = []; const adapter = createMikrotikRestAdapter({ baseUrl: "https://router.example.test", username: "jaslyn-net", password: "secret", fetchImpl: async (url, options) => { requests.push({ url, options }); return response([{ version: "7.18.2" }]); } });
  assert.deepEqual(await adapter.health(), { ok: true, status: "online", version: "7.18.2" }); assert.equal(requests[0].url, "https://router.example.test/rest/system/resource"); assert.equal(requests[0].options.body, undefined); assert.match(requests[0].options.headers.authorization, /^Basic /);
});

test("MikroTik enforcement creates an idempotent IPv4 simple queue", async () => {
  const requests = []; const adapter = createMikrotikRestAdapter({ baseUrl: "https://router.example.test/", username: "jaslyn-net", password: "secret", fetchImpl: async (url, options) => { requests.push({ url, options }); return url.includes("queue/simple?") ? response([]) : response({ ".id": "*42" }); } });
  const result = await adapter.enforcePolicy({ client: { ipAddress: "10.0.0.20" }, policy: { planId: "daily", bandwidth: { downloadKbps: 10_000, uploadKbps: 5_000 } } });
  assert.deepEqual(result, { ok: true, action: "created", remotePolicyId: "*42", response: { ".id": "*42" } });
  assert.equal(requests[0].url, "https://router.example.test/rest/queue/simple?name=jaslyn-10.0.0.20"); assert.deepEqual(JSON.parse(requests[1].options.body), { name: "jaslyn-10.0.0.20", target: "10.0.0.20/32", "max-limit": "5k/10k", comment: "Jaslyn Net daily" });
});

test("MikroTik enforcement updates an existing queue and handles IPv6 targets", async () => {
  const requests = []; const adapter = createMikrotikRestAdapter({ baseUrl: "https://router.example.test", username: "jaslyn-net", password: "secret", fetchImpl: async (url, options) => { requests.push({ url, options }); return url.includes("queue/simple?") ? response([{ ".id": "*99" }]) : response(null); } });
  const result = await adapter.enforcePolicy({ client: { ipAddress: "2001:db8::10" }, policy: { planId: "ipv6", bandwidth: { downloadKbps: 2000, uploadKbps: 1000 } } });
  assert.equal(result.action, "updated"); assert.equal(result.remotePolicyId, "*99"); assert.equal(requests[1].options.method, "PATCH"); assert.equal(JSON.parse(requests[1].options.body).target, "2001:db8::10/128");
});

test("MikroTik adapter rejects non-IP clients and reports timeouts", async () => {
  const adapter = createMikrotikRestAdapter({ baseUrl: "https://router.example.test", username: "jaslyn-net", password: "secret", timeoutMs: 10, fetchImpl: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  await assert.rejects(() => adapter.enforcePolicy({ client: { macAddress: "00:11:22:33:44:55" }, policy: { planId: "daily", bandwidth: { downloadKbps: 1000 } } }), /requires a valid client\.ipAddress/);
  assert.deepEqual(await adapter.health(), { ok: false, status: "offline", code: "TIMEOUT" });
});
