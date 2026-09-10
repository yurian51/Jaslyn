import { NextResponse } from "next/server";
import { z } from "zod";
import { runPythonTool } from "../../../src/bridge/python-runner.mjs";

const schema = z.object({ action: z.enum(["create", "list", "revoke"]), label: z.string().trim().min(1).max(80).optional(), id: z.string().uuid().optional() });
export async function GET() { const result = await runPythonTool({ tool: "api_key_list" }); return NextResponse.json({ provider: "jaslyn", ...result }); }
export async function POST(request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid API key operation." }, { status: 400 });
  try {
    if (parsed.data.action === "create") return NextResponse.json({ provider: "jaslyn", ...(await runPythonTool({ tool: "api_key_create", args: { label: parsed.data.label || "Jaslyn client" } })) });
    if (parsed.data.action === "revoke") { if (!parsed.data.id) return NextResponse.json({ ok: false, error: "Key id is required." }, { status: 400 }); return NextResponse.json({ provider: "jaslyn", ...(await runPythonTool({ tool: "api_key_revoke", args: { id: parsed.data.id } })) }); }
    return NextResponse.json({ provider: "jaslyn", ...(await runPythonTool({ tool: "api_key_list" })) });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "API key operation failed." }, { status: 500 }); }
}
