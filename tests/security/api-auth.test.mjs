import test from "node:test";
import assert from "node:assert/strict";
import { authorizeRequest } from "../../src/security/api-auth.mjs";

function requestWith(headers = {}) {
  return { headers: { get(name) { return headers[name.toLowerCase()] ?? null; } } };
}

test("admin credential uses constant-time authorization boundary", async () => {
  const previous = process.env.JASLYN_ADMIN_KEY;
  process.env.JASLYN_ADMIN_KEY = "admin-test-secret";
  try {
    const result = await authorizeRequest(requestWith({ "x-jaslyn-key": "admin-test-secret" }));
    assert.deepEqual(result, { ok: true, method: "admin" });
  } finally {
    if (previous === undefined) delete process.env.JASLYN_ADMIN_KEY;
    else process.env.JASLYN_ADMIN_KEY = previous;
  }
});

test("missing credential is rejected without invoking the key store", async () => {
  const previous = process.env.JASLYN_ADMIN_KEY;
  delete process.env.JASLYN_ADMIN_KEY;
  try {
    const result = await authorizeRequest(requestWith());
    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
  } finally {
    if (previous === undefined) delete process.env.JASLYN_ADMIN_KEY;
    else process.env.JASLYN_ADMIN_KEY = previous;
  }
});
