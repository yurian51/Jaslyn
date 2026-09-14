import { NextResponse } from "next/server";
import { createJaslynBenchmarkRuntime } from "../../../src/benchmark/index.mjs";
import { runPythonTool } from "../../../src/bridge/python-runner.mjs";
import { authorizeRequest } from "../../../src/security/api-auth.mjs";

const MAX_REQUEST_BYTES = 256 * 1024;

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  try {
    if (process.env.JASLYN_ALLOW_ANONYMOUS_API !== "1") {
      const auth = await authorizeRequest(request);
      if (!auth.ok) return jsonError(auth.error, auth.status);
    }

    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BYTES)) return jsonError("Request payload is too large.", 413);
    const rawBody = await request.arrayBuffer();
    if (rawBody.byteLength > MAX_REQUEST_BYTES) return jsonError("Request payload is too large.", 413);
    let body;
    try { body = JSON.parse(new TextDecoder().decode(rawBody)); } catch { return jsonError("Request body must contain valid JSON.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Request body must be a JSON object.", 400);

    const instruction = String(body.instruction || "").trim();
    const parsedMaxSteps = Number(body.maxSteps);
    const maxSteps = Number.isFinite(parsedMaxSteps) ? Math.max(1, Math.min(100, Math.trunc(parsedMaxSteps))) : 100;
    if (!instruction || instruction.length > 8000) return jsonError("Instruction is required and must be at most 8000 characters.", 400);

    const context = body.context == null ? {} : body.context;
    if (!context || typeof context !== "object" || Array.isArray(context)) return jsonError("context must be a JSON object when provided.", 400);

    const runtime = await createJaslynBenchmarkRuntime({ maxIterations: Math.min(32, Math.ceil(maxSteps / 3)) }).initialize();
    const result = await runtime.run(instruction, { context });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Jaslyn could not process the request.", 503);
  }
}
