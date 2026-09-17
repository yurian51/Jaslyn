import { NextResponse } from "next/server";
import { normalizeAccounting, persistAccounting } from "../../../../src/net/accounting.mjs";
import { hasSecret } from "../../../../src/net/auth.mjs";

export async function POST(request) {
  if (!hasSecret(request, "JASLYN_ACCOUNTING_INGEST_KEY", "x-jaslyn-accounting-key")) return NextResponse.json({ ok: false, error: "Accounting ingestion authorization is not configured or is invalid." }, { status: 401 });
  try {
    const payload = normalizeAccounting(await request.json());
    if (!process.env.DATABASE_URL) return NextResponse.json({ ok: false, persisted: false, event: payload, error: "DATABASE_URL is not configured; accounting was not persisted." }, { status: 503 });
    const session = await persistAccounting(payload);
    return NextResponse.json({ ok: true, persisted: true, session, source: "trusted-radius-accounting-bridge", receivedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, persisted: false, error: error instanceof Error ? error.message : String(error) }, { status: 422 });
  }
}
