import { NextResponse } from "next/server";
import { z } from "zod";
import { runPythonTool } from "../../../src/bridge/python-runner.mjs";
import { authorizeRequest } from "../../../src/security/api-auth.mjs";

const MAX_REQUEST_BYTES = 256 * 1024;
const schema = z.object({ tool: z.enum(["system_snapshot", "workspace_list", "text_stats", "memory_store", "memory_search", "memory_list", "memory_delete", "api_key_create", "api_key_list", "api_key_revoke", "api_key_verify", "detect_language", "create_language", "run_jaslang"]), args: z.record(z.string(), z.unknown()).optional() });

export async function GET(request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ runtime: "python3", tools: [{ name: "system_snapshot", scope: "read-only" }, { name: "workspace_list", scope: "read-only" }, { name: "text_stats", scope: "pure" }, { name: "memory_store", scope: "persistent-write" }, { name: "memory_search", scope: "read-only" }, { name: "memory_list", scope: "read-only" }, { name: "memory_delete", scope: "persistent-delete" }, { name: "detect_language", scope: "read-only" }, { name: "create_language", scope: "workspace-write" }, { name: "run_jaslang", scope: "sandboxed-execution" }] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BYTES)) return NextResponse.json({ ok: false, error: "Request payload is too large." }, { status: 413 });
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_REQUEST_BYTES) return NextResponse.json({ ok: false, error: "Request payload is too large." }, { status: 413 });
    let body;
    try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return NextResponse.json({ ok: false, error: "Request body must contain valid JSON." }, { status: 400 }); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Unknown Python tool request." }, { status: 400 });
    const result = await runPythonTool(parsed.data);
    return NextResponse.json({ ...result, runtime: "python3" });
  } catch {
    return NextResponse.json({ ok: false, runtime: "python3", error: "Python worker failed." }, { status: 503 });
  }
}
