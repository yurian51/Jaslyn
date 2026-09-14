import crypto from "node:crypto";
import { runPythonTool } from "../bridge/python-runner.mjs";

function suppliedCredential(request) {
  return request.headers.get("x-jaslyn-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function authorizeRequest(request) {
  const supplied = suppliedCredential(request);
  const adminKey = process.env.JASLYN_ADMIN_KEY;
  if (adminKey && safeEqual(supplied, adminKey)) return { ok: true, method: "admin" };
  if (!supplied) return { ok: false, status: 401, error: "A valid Jaslyn API key is required." };
  try {
    const result = await runPythonTool({ tool: "api_key_verify", args: { key: supplied } });
    if (result.valid === true) return { ok: true, method: "api-key" };
  } catch {
    return { ok: false, status: 503, error: "Authorization service is unavailable." };
  }
  return { ok: false, status: 401, error: "A valid Jaslyn API key is required." };
}
