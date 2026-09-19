import test from "node:test";
import assert from "node:assert/strict";
import { OmadaOpenApiProvider } from "../../src/net/providers/omada-openapi.mjs";

test("Omada Open API provider authenticates with client credentials and discovers sites/devices", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const path = String(url);
    if (path.includes("/openapi/authorize/token")) return new Response(JSON.stringify({ errorCode: 0, result: { accessToken: "token-1", expiresIn: 7200 } }), { status: 200 });
    if (path.endsWith("/openapi/v1/omada-1/sites?page=1&pageSize=100")) return new Response(JSON.stringify({ errorCode: 0, result: { data: [{ siteId: "site-1", name: "HQ" }] } }), { status: 200 });
    if (path.endsWith("/openapi/v1/omada-1/sites/site-1/devices?page=1&pageSize=100")) return new Response(JSON.stringify({ errorCode: 0, result: { data: [{ mac: "AA-BB", type: "ap", name: "AP-01", ip: "10.0.0.2", status: 1 }] } }), { status: 200 });
    if (path === "https://omada.example/api/info") return new Response(JSON.stringify({ errorCode: 0, result: { version: "6.2.0" } }), { status: 200 });
    throw new Error(`Unexpected URL: ${path}`);
  };
  try {
    const provider = new OmadaOpenApiProvider({ baseUrl: "https://omada.example", omadacId: "omada-1", clientId: "client-1", clientSecret: "secret-1" });
    const sites = await provider.getSites();
    const devices = await provider.getDevices("site-1");
    assert.deepEqual(sites[0], { id: "site-1", name: "HQ", raw: { siteId: "site-1", name: "HQ" } });
    assert.equal(devices[0].id, "AA-BB");
    assert.equal(devices[0].siteId, "site-1");
    assert.equal(calls.filter((call) => call.url.includes("/openapi/authorize/token")).length, 1);
    assert.equal(calls[0].init.body.includes('"omadacId":"omada-1"'), true);
    assert.equal(calls[1].init.headers.Authorization, "AccessToken=token-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Omada client refreshes once after a 401 instead of retrying arbitrary provider errors", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let tokenCalls = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const path = String(url);
    if (path.includes("/openapi/authorize/token")) {
      tokenCalls += 1;
      return new Response(JSON.stringify({ errorCode: 0, result: { accessToken: `token-${tokenCalls}`, expiresIn: 7200 } }), { status: 200 });
    }
    if (path === "https://omada.example/api/info" && tokenCalls === 1) return new Response("unauthorized", { status: 401 });
    if (path === "https://omada.example/api/info" && tokenCalls === 2) return new Response(JSON.stringify({ errorCode: 0, result: { version: "6.2.0" } }), { status: 200 });
    throw new Error(`Unexpected URL: ${path}`);
  };
  try {
    const provider = new OmadaOpenApiProvider({ baseUrl: "https://omada.example", omadacId: "omada-1", clientId: "client-1", clientSecret: "secret-1" });
    const identity = await provider.getIdentity();
    assert.equal(identity.result.version, "6.2.0");
    assert.equal(tokenCalls, 2);
    assert.equal(calls.filter((call) => call.url === "https://omada.example/api/info").length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Omada capability matrix does not claim unsupported session or disconnect controls", () => {
  const provider = new OmadaOpenApiProvider({ baseUrl: "https://omada.example", omadacId: "omada-1", clientId: "client-1", clientSecret: "secret-1" });
  const capabilities = provider.getCapabilities();
  assert.equal(capabilities.devices, true);
  assert.equal(capabilities.metrics, true);
  assert.equal(capabilities.clients, false);
  assert.equal(capabilities.sessions, false);
  assert.equal(capabilities.disconnect, false);
});
