import { NextResponse } from "next/server";
import { createJaslynBenchmarkRuntime } from "../../../src/benchmark/index.mjs";
import { runPythonTool } from "../../../src/bridge/python-runner.mjs";

export async function POST(request) {
  try {
    if (process.env.JASLYN_REQUIRE_API_KEY === "1") {
      const suppliedKey = request.headers.get("x-jaslyn-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      const keyCheck = await runPythonTool({ tool: "api_key_verify", args: { key: suppliedKey || "" } });
      if (!keyCheck.valid) return NextResponse.json({ error: "A valid Jaslyn API key is required." }, { status: 401 });
    }
    const body = await request.json();
    const instruction = String(body?.instruction || "").trim();
    const maxSteps = Math.max(1, Math.min(100, Number(body?.maxSteps) || 100));
    if (!instruction || instruction.length > 8000) return NextResponse.json({ error: "Instruction is required and must be at most 8000 characters." }, { status: 400 });
    const runtime = await createJaslynBenchmarkRuntime({ maxIterations: Math.min(32, Math.ceil(maxSteps / 3)) }).initialize();
    const result = await runtime.run(instruction, { context: body?.context && typeof body.context === "object" ? body.context : {} });
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ status: "brain_offline", error: error instanceof Error ? error.message : "Jaslyn could not reach its private inference server." }, { status: 503 }); }
}
