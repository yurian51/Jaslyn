import { NextResponse } from "next/server";
import { createJaslynBenchmarkRuntime } from "../../../src/benchmark/index.mjs";
import { runPythonTool } from "../../../src/bridge/python-runner.mjs";

function jsonError(message, status) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  try {
    if (process.env.JASLYN_REQUIRE_API_KEY === "1") {
      const suppliedKey = request.headers.get("x-jaslyn-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      const keyCheck = await runPythonTool({ tool: "api_key_verify", args: { key: suppliedKey || "" } });
      if (!keyCheck.valid) return jsonError("A valid Jaslyn API key is required.", 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must contain valid JSON.", 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("Request body must be a JSON object.", 400);
    }

    const instruction = String(body.instruction || "").trim();
    const parsedMaxSteps = Number(body.maxSteps);
    const maxSteps = Number.isFinite(parsedMaxSteps) ? Math.max(1, Math.min(100, Math.trunc(parsedMaxSteps))) : 100;
    if (!instruction || instruction.length > 8000) {
      return jsonError("Instruction is required and must be at most 8000 characters.", 400);
    }

    const context = body.context == null ? {} : body.context;
    if (!context || typeof context !== "object" || Array.isArray(context)) {
      return jsonError("context must be a JSON object when provided.", 400);
    }

    const runtime = await createJaslynBenchmarkRuntime({
      maxIterations: Math.min(32, Math.ceil(maxSteps / 3)),
    }).initialize();
    const result = await runtime.run(instruction, { context });
    return NextResponse.json(result);
  } catch {
    return jsonError("Jaslyn could not process the request.", 503);
  }
}
