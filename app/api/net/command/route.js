import { NextResponse } from "next/server";
import { z } from "zod";
import { executeReadCommand } from "../../../../../src/net/commands.mjs";

export const dynamic = "force-dynamic";

const schema = z.object({
  command: z.string().trim().min(1).max(120),
  organizationId: z.string().uuid().optional(),
});

export async function POST(request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "A command is required." }, { status: 400 });
  const result = await executeReadCommand(parsed.data.command, { organizationId: parsed.data.organizationId });
  return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
