import { NextResponse } from "next/server";
import { checkNetworkHealth, databaseHealth, getNetworkRuntime } from "../../../../src/net/runtime.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = getNetworkRuntime();
  const [network, database] = await Promise.all([checkNetworkHealth(), databaseHealth()]);
  const ok = network.ok || database.ok;
  return NextResponse.json({ ok, runtime, network, database, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
