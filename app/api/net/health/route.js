import { NextResponse } from "next/server";
import { checkNetworkHealth, getNetworkRuntime } from "../../../../src/net/runtime.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = getNetworkRuntime();
  const health = await checkNetworkHealth();
  return NextResponse.json({ ok: health.ok, runtime, health, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
