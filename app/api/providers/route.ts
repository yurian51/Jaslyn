import { NextResponse } from "next/server";
import { createJaslynBenchmarkRuntime } from "../../../src/benchmark/index.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runtime = await createJaslynBenchmarkRuntime().initialize();
    const health = await runtime.health();
    return NextResponse.json({
      ok: health.some((provider) => provider.ok),
      providers: health,
      capabilities: {
        persistentMemory: true,
        persistentRunHistory: true,
        concurrentFanout: true,
        approvalGates: true,
        verifiedToolExecution: true,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, providers: [], error: error instanceof Error ? error.message : "Unable to inspect Jaslyn providers." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
