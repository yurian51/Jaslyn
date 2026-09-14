import { NextResponse } from "next/server";
import { z } from "zod";
import { runPythonTool } from "../../../src/bridge/python-runner.mjs";
import { authorizeRequest } from "../../../src/security/api-auth.mjs";

const schema = z.object({ source: z.string().min(1).max(50000), maxSteps: z.number().int().min(1).max(10000).default(10000) });
const MAX_REQUEST_BYTES = 128 * 1024;

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
    if (!parsed.success) return NextResponse.json({ ok: false, error: "JasLang source is required." }, { status: 400 });
    const result = await runPythonTool({ tool: "run_jaslang", args: parsed.data });
    return NextResponse.json({ ...result, ok: true, runtime: "jaslyn" });
  } catch {
    return NextResponse.json({ ok: false, runtime: "jaslyn", error: "JasLang execution failed." }, { status: 503 });
  }
}
