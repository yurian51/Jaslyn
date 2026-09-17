import { NextResponse } from "next/server";
import { activateVerifiedPayment } from "../../../../../src/net/lifecycle.mjs";
import { hasSecret } from "../../../../../src/net/auth.mjs";
import { z } from "zod";

const schema = z.object({
  paymentId: z.string().uuid(),
  correlationId: z.string().min(1).max(200).optional(),
});

export async function POST(request) {
  if (!hasSecret(request, "JASLYN_PAYMENT_ACTIVATION_KEY", "x-jaslyn-payment-activation-key")) {
    return NextResponse.json({ ok: false, error: "Unauthorized payment activation request." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "paymentId must be a valid UUID." }, { status: 400 });

  try {
    const result = await activateVerifiedPayment(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /not found/i.test(message) ? 404 : /not verified|mismatch|not attached/i.test(message) ? 409 : 422;
    return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
