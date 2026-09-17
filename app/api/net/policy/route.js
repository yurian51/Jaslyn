import { NextResponse } from "next/server";
import { compilePlan } from "../../../../src/net/runtime.mjs";
import { z } from "zod";

const schema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(120),
  downloadMbps: z.number().positive(),
  uploadMbps: z.number().positive(),
  quotaBytes: z.number().nonnegative().nullable().optional(),
  validitySeconds: z.number().int().positive(),
  deviceLimit: z.number().int().positive().optional(),
});

export async function POST(request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid network plan." }, { status: 400 });
  try { return NextResponse.json({ ok: true, ...compilePlan(parsed.data) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 422 }); }
}
