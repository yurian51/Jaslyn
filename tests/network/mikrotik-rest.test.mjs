import test from "node:test";
import assert from "node:assert/strict";
import { createMikrotikRestAdapter } from "../../src/network/adapters/mikrotik-rest.mjs";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); }
  };
}

test("MikroTik adapter health checks RouterOS and hides credentials", async () => {
  const requests = [];
  const adapter = createMikrotikRestAdapter({
    baseUrl: "https://router.example.test",
    username: "jaslyn-net",
    password: "super-secret",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response([{ version: "7.18.2" }]);
    }
  });

  const result = await adapter.health();
  assert.deepEqual(result, { ok: true, status: "online", version: "7.18.2" });
  assert.equal(requests[0].url, "https://router.example.test/rest/system/resource");
  assert.match(requests[0].options.headers.authorization, /^Basic /);
  assert.equal(requests[0].options.body, undefined);
  assert.equal(requests[0].options.signal instanceof AbortSignal, true);
});

test("MikroTik adapter creates an idempotent simple queue for IPv4 bandwidth", async () => {
  const requests = [];
  const adapter = createMikrotikRestAdapter({
    baseUrl: "https://router.example.test/",
    username: "jaslyn-net",
    password: "secret",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.includes("queue/simple?")) return response([]);
      return response({ ".id": "*42" });
    }
  });

  const result = await adapter.enforcePolicy({
    client: { ipAddress: "10.0.0.20" },
    policy: {
      planId: "daily-10mbps",
      bandwidth: { downloadKbps: 10_000, uploadKbps: 5_000 }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.action, "created");
  assert.equal(result.remotePolicyId, "*42");
  assert.equal(requests[0].url, "https://router.example.test/rest/queue/simple?name=jaslyn-10.0.0.20");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    name: "jaslyn-10.0.0.20",
    target: "10.0.0.20/32",
    "max-limit": "5k/10k",
    comment: "Jaslyn Net daily-10mbps"
  });
});

test("MikroTik adapter updates an existing queue instead of duplicating it", async () => {
  const requests = [];
  const adapter = createMikrotikRestAdapter({
    baseUrl: "https://router.example.test",
    username: "jaslyn-net",
    password: "secret",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.includes("queue/simple?")) return response([{ ".id": "*99" }]);
      return response(null);
    }
  });

  const result = await adapter.enforcePolicy({
    client: { ipAddress: "192.168.1.10" },
    policy: { planId: "weekly", bandwidth: { downloadKbps: 20_000, uploadKbps: 10_000 } }
  });

  assert.equal(result.action, "updated");
  assert.equal(result.remotePolicyId, "*99");
  assert.equal(requests[1].options.method, "PATCH");
  assert.equal(requests[1].url, "https://router.example.test/rest/queue/simple/*99");
});

test("MikroTik adapter rejects MAC-only clients because simple queues need an IP target", async () => {
  const adapter = createMikrotikRestAdapter({
    baseUrl: "https://router.example.test",
    username: "jaslyn-net",
    password: "secret",
    fetchImpl: async () => response([])
  });
  await assert.rejects(
    () => adapter.enforcePolicy({ client: { macAddress: "00:11:22:33:44:55" }, policy: { planId: "daily", bandwidth: { downloadKbps: 1000 } } }),
    /requires client\.ipAddress/
  );
});

test("MikroTik adapter fails closed on timeout", async () => {
  const adapter = createMikrotikRestAdapter({
    baseUrl: "https://router.example.test",
    username: "jaslyn-net",
    password: "secret",
    timeoutMs: 10,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })
  });
  const result = await adapter.health();
  assert.deepEqual(result, { ok: false, status: "offline", code: "TIMEOUT" });
});
