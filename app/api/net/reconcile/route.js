import { NextResponse } from "next/server";
import { reconcileAccess } from "../../../../src/net/runtime.mjs";
import { z } from "zod";

const schema = z.object({
  payment: z.object({ status: z.enum(["INITIATED", "PENDING", "VERIFIED", "SETTLED", "FAILED", "REVERSED", "REFUNDED"]) }),
  subscription: z.object({ status: z.string(), expiresAt: z.string() }),
  network: z.object({ authorization: z.string(), sessionActive: z.boolean().optional(), lastAccountingAt: z.string().nullable().optional() }),
});

export async function POST(request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid reconciliation state." }, { status: 400 });
  return NextResponse.json({ ok: true, reconciliation: reconcileAccess(parsed.data) }, { headers: { "Cache-Control": "no-store" } });
}
