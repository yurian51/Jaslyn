import { NextResponse } from "next/server";
import { normalizeAccounting, persistAccounting } from "../../../../src/net/accounting.mjs";

function authorized(request) {
  const expected = process.env.JASLYN_ACCOUNTING_INGEST_KEY?.trim();
  if (!expected) return false;
  const supplied = request.headers.get("x-jaslyn-accounting-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return supplied === expected;
}

export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Accounting ingestion authorization is not configured or is invalid." }, { status: 401 });
  try {
    const payload = normalizeAccounting(await request.json());
    if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, persisted: false, event: payload, error: "DATABASE_URL is not configured; accounting was not persisted." }, { status: 503 });
    const session = await persistAccounting(payload);
    return NextResponse.json({ ok: true, persisted: true, session, source: "trusted-radius-accounting-bridge", receivedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, persisted: false, error: error instanceof Error ? error.message : String(error) }, { status: 422 });
  }
}
