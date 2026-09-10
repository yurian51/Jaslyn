import { NextResponse } from "next/server";
import { JsonApprovalStore } from "../../../src/benchmark/approval-store.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const store = await new JsonApprovalStore().load();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const rawLimit = Number(url.searchParams.get("limit") || 50);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 50;
    return NextResponse.json({ approvals: store.list({ status, limit }) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read approval queue." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
