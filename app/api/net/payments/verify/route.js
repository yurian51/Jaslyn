import { NextResponse } from "next/server";
import { verifyPaymentEvent } from "../../../../../src/net/payments.mjs";
import { hasSecret } from "../../../../../src/net/auth.mjs";

export async function POST(request) {
  if (!hasSecret(request, "JASLYN_PAYMENT_VERIFICATION_KEY", "x-jaslyn-payment-verification-key")) {
    return NextResponse.json({ ok: false, error: "Payment verification authorization is not configured or is invalid." }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, verified: false, error: "DATABASE_URL is not configured." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const payment = await verifyPaymentEvent(body);
    return NextResponse.json({
      ok: true,
      verified: true,
      payment,
      entitlementChanged: false,
      accessChanged: false,
      message: "Payment verified. Separate entitlement activation remains required.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /not found/i.test(message) ? 404 : /mismatch|cannot be verified/i.test(message) ? 409 : 422;
    return NextResponse.json({ ok: false, verified: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
