import { NextResponse } from "next/server";
import { recordPaymentEvent } from "../../../../../src/net/payments.mjs";
import { hasSecret } from "../../../../../src/net/auth.mjs";

export async function POST(request) {
  if (!hasSecret(request, "JASLYN_PAYMENT_INGEST_KEY", "x-jaslyn-payment-key")) return NextResponse.json({ ok: false, error: "Payment ingestion authorization is not configured or is invalid." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, persisted: false, error: "DATABASE_URL is not configured." }, { status: 503 });
  try {
    const body = await request.json();
    const payment = await recordPaymentEvent({ ...body, status: "PENDING" });
    return NextResponse.json({ ok: true, persisted: true, payment, nextState: "PENDING", entitlementChanged: false, message: "Callback recorded. Provider verification must occur before entitlement or network authorization changes." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, persisted: false, error: error instanceof Error ? error.message : String(error) }, { status: 422 });
  }
}
