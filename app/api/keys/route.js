import { NextResponse } from "next/server";
import { z } from "zod";
import { runPythonTool } from "../../../src/bridge/python-runner.mjs";
import { authorizeRequest } from "../../../src/security/api-auth.mjs";

const schema = z.object({ action: z.enum(["create", "list", "revoke"]), label: z.string().trim().min(1).max(80).optional(), id: z.string().uuid().optional() });

async function authorized(request) {
  const result = await authorizeRequest(request);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status, headers: { "cache-control": "no-store" } });
  return null;
}

export async function GET(request) {
  const denied = await authorized(request);
  if (denied) return denied;
  try {
    const result = await runPythonTool({ tool: "api_key_list" });
    return NextResponse.json({ provider: "jaslyn", ...result }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to read API keys." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request) {
  const denied = await authorized(request);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Request body must contain valid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid API key operation." }, { status: 400 });
  try {
    if (parsed.data.action === "create") return NextResponse.json({ provider: "jaslyn", ...(await runPythonTool({ tool: "api_key_create", args: { label: parsed.data.label || "Jaslyn client" } })) });
    if (parsed.data.action === "revoke") {
      if (!parsed.data.id) return NextResponse.json({ ok: false, error: "Key id is required." }, { status: 400 });
      return NextResponse.json({ provider: "jaslyn", ...(await runPythonTool({ tool: "api_key_revoke", args: { id: parsed.data.id } })) });
    }
    return NextResponse.json({ provider: "jaslyn", ...(await runPythonTool({ tool: "api_key_list" })) });
  } catch {
    return NextResponse.json({ ok: false, error: "API key operation failed." }, { status: 503 });
  }
}
