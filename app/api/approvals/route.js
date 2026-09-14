import { NextResponse } from "next/server";
import { JsonApprovalStore } from "../../../src/benchmark/approval-store.mjs";
import { authorizeRequest } from "../../../src/security/api-auth.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "cache-control": "no-store" } });
  try {
    const store = await new JsonApprovalStore().load();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const rawLimit = Number(url.searchParams.get("limit") || 50);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 50;
    return NextResponse.json({ approvals: store.list({ status, limit }) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to read approval queue." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
