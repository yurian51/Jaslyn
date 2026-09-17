import { timingSafeEqual } from "node:crypto";

export function hasSecret(request, envName, headerName) {
  const expected = process.env[envName]?.trim();
  if (!expected) return false;
  const supplied = request.headers.get(headerName) || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
