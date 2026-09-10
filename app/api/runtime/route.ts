import { NextResponse } from "next/server";
import { createJaslynBenchmarkRuntime } from "../../../src/benchmark/index.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runtime = await createJaslynBenchmarkRuntime().initialize();
    const providers = await runtime.health({ timeoutMs: 5_000 });
    const approvals = runtime.approvals({ limit: 200 });
    const runs = runtime.history({ limit: 200 });
    const pendingApprovals = approvals.filter((item) => item.status === "pending").length;
    const verifiedRuns = runs.filter((item) => item.verified === true).length;
    const failedRuns = runs.filter((item) => item.status === "failed").length;

    return NextResponse.json({
      ok: true,
      runtime: {
        name: "Jaslyn",
        mode: "self-hosted",
        inferenceConfigured: Boolean(process.env.JASLYN_INFERENCE_URL),
        model: process.env.JASLYN_MODEL || "jaslyn",
        models: String(process.env.JASLYN_MODELS || process.env.JASLYN_MODEL || "jaslyn").split(",").map((value) => value.trim()).filter(Boolean),
        capabilities: {
          persistentMemory: true,
          persistentRunHistory: true,
          persistentApprovals: true,
          concurrentFanout: true,
          providerFailover: true,
          providerHealthChecks: true,
          cancellableExecution: true,
          approvalGates: true,
          verifiedToolExecution: true,
          oneTimeApprovalReplayProtection: true,
        },
      },
      providers,
      metrics: {
        runs: runs.length,
        verifiedRuns,
        failedRuns,
        pendingApprovals,
        approvals: approvals.length,
      },
      generatedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to inspect Jaslyn runtime." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
