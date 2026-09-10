import { NextResponse } from "next/server";
import { JsonApprovalStore } from "../../../../src/benchmark/approval-store.mjs";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id || id.length > 128) return NextResponse.json({ error: "A valid approval id is required." }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const decision = body?.decision;
    if (decision !== "approved" && decision !== "rejected") return NextResponse.json({ error: "Decision must be approved or rejected." }, { status: 400 });
    const store = await new JsonApprovalStore().load();
    const approval = await store.decide(id, decision);
    return NextResponse.json({ approval }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to decide approval.";
    const status = /not found/i.test(message) ? 404 : /already/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
