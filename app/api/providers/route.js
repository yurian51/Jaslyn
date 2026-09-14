import { NextResponse } from "next/server";
import { createJaslynBenchmarkRuntime } from "../../../src/benchmark/index.mjs";
import { authorizeRequest } from "../../../src/security/api-auth.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status, headers: { "cache-control": "no-store" } });
  try {
    const runtime = await createJaslynBenchmarkRuntime().initialize();
    const health = await runtime.health({ timeoutMs: 5000 });
    return NextResponse.json({ ok: health.some((provider) => provider.ok), providers: health, capabilities: { persistentMemory: true, persistentRunHistory: true, persistentApprovals: true, concurrentFanout: true, providerFailover: true, providerHealthChecks: true, cancellableExecution: true, approvalGates: true, verifiedToolExecution: true, oneTimeApprovalReplayProtection: true }, checkedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, providers: [], error: "Unable to inspect Jaslyn providers." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
