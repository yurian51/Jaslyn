import test from "node:test";
import assert from "node:assert/strict";
import { MikroTikRestProvider } from "../../src/net/providers/mikrotik-rest.mjs";
import { assertCapability, UnsupportedCapabilityError } from "../../src/net/providers/contract.mjs";
import { createNetworkProvider, getProviderTypes } from "../../src/net/providers/registry.mjs";

test("MikroTik provider exposes explicit capabilities without claiming unsupported operations", () => {
  const provider = new MikroTikRestProvider({ baseUrl: "https://router.example", username: "user", password: "secret" });
  const capabilities = provider.getCapabilities();
  assert.equal(capabilities.sessions, true);
  assert.equal(capabilities.hotspot, true);
  assert.equal(capabilities.pppoe, true);
  assert.equal(capabilities.disconnect, true);
  assert.equal(capabilities.policy, false);
  assert.equal(capabilities.firmware, false);
  assert.doesNotThrow(() => assertCapability(provider, "sessions"));
  assert.throws(() => assertCapability(provider, "firmware"), UnsupportedCapabilityError);
});

test("provider registry creates only registered real adapters", () => {
  assert.deepEqual(getProviderTypes(), ["mikrotik-rest"]);
  const provider = createNetworkProvider({ type: "mikrotik-rest", baseUrl: "https://router.example", username: "user", password: "secret" });
  assert.equal(provider.name, "mikrotik-rest");
  assert.throws(() => createNetworkProvider({ type: "omada", baseUrl: "https://controller.example" }), UnsupportedCapabilityError);
});

test("MikroTik session discovery normalizes real hotspot and PPPoE records", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const path = String(url);
    const payload = path.endsWith("/ip/hotspot/active")
      ? [{ ".id": "*1", user: "alice", "mac-address": "AA:BB:CC:DD:EE:FF", address: "10.0.0.10", uptime: "1h" }]
      : [{ ".id": "*2", name: "bob", "caller-id": "11:22:33:44:55:66", address: "10.0.0.11", uptime: "20m" }];
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const provider = new MikroTikRestProvider({ baseUrl: "https://router.example", username: "user", password: "secret" });
    const result = await provider.getSessions();
    assert.equal(result.hotspot[0].username, "alice");
    assert.equal(result.hotspot[0].ipAddress, "10.0.0.10");
    assert.equal(result.pppoe[0].username, "bob");
    assert.equal(result.pppoe[0].callerId, "11:22:33:44:55:66");
    assert.equal(calls.length, 2);
    assert.equal(calls.some((url) => url.endsWith("/rest/ip/hotspot/active")), true);
    assert.equal(calls.some((url) => url.endsWith("/rest/ppp/active")), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MikroTik disconnect uses explicit session type and provider command", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const provider = new MikroTikRestProvider({ baseUrl: "https://router.example", username: "user", password: "secret" });
    await provider.disconnect({ type: "pppoe", id: "*7" });
    assert.equal(request.url, "https://router.example/rest/ppp/active/remove");
    assert.deepEqual(JSON.parse(request.init.body), { ".id": "*7" });
    assert.throws(() => provider.disconnect({ type: "unknown", id: "*7" }), /supported session type/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
