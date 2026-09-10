import { NextResponse } from "next/server";
import { createJaslynBenchmarkRuntime } from "../../../../src/benchmark/index.mjs";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    if (!id || id.length > 128) return NextResponse.json({ error: "A valid approval id is required." }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const decision = body?.decision;
    if (decision !== "approved" && decision !== "rejected") return NextResponse.json({ error: "Decision must be approved or rejected." }, { status: 400 });
    const runtime = await createJaslynBenchmarkRuntime().initialize();
    await runtime.approvalStore.decide(id, decision);
    if (decision === "rejected") {
      const approval = runtime.approvalStore.get(id);
      return NextResponse.json({ approval, executed: false, execution: null }, { headers: { "cache-control": "no-store" } });
    }
    const execution = await runtime.executeApprovedApproval(id);
    if (!execution.ok) return NextResponse.json({ approval: execution.approval, executed: false, execution, error: execution.error || "Approved action failed." }, { status: 502, headers: { "cache-control": "no-store" } });
    return NextResponse.json({ approval: execution.approval, executed: true, execution }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to decide approval.";
    const status = /not found/i.test(message) ? 404 : /already|expired|not approved/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
