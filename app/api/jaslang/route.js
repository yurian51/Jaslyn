import { NextResponse } from "next/server";
import { z } from "zod";
import { runPythonTool } from "../../../src/bridge/python-runner.mjs";

const schema = z.object({ source: z.string().min(1).max(50000), maxSteps: z.number().int().min(1).max(10000).default(10000) });
export async function POST(request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "JasLang source is required." }, { status: 400 });
  try { const result = await runPythonTool({ tool: "run_jaslang", args: parsed.data }); return NextResponse.json({ ...result, ok: true, runtime: "jaslyn" }); }
  catch (error) { return NextResponse.json({ ok: false, runtime: "jaslyn", error: error instanceof Error ? error.message : "JasLang execution failed." }, { status: 400 }); }
}
