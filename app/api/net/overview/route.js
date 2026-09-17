import { NextResponse } from "next/server";
import { getNetworkRuntime, checkNetworkHealth } from "../../../../src/net/runtime.mjs";
import { MikroTikRestProvider } from "../../../../src/net/providers/mikrotik-rest.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = getNetworkRuntime();
  const health = await checkNetworkHealth();
  if (!runtime.configured) {
    return NextResponse.json({ ok: false, configured: false, source: "jaslyn-net-control-plane", metrics: {}, health, runtime, message: "Live Jaslyn Net data sources are not configured. No production metrics are fabricated." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const provider = new MikroTikRestProvider({ baseUrl: process.env.JASLYN_MIKROTIK_URL, username: process.env.JASLYN_MIKROTIK_USERNAME, password: process.env.JASLYN_MIKROTIK_PASSWORD });
  try {
    const sessions = await provider.listHotspotActive();
    const metrics = {
      CUSTOMERS: "—",
      "ACTIVE SESSIONS": String(sessions.length),
      "SETTLED REVENUE": "—",
      "ONLINE DEVICES": health.ok ? "1" : "0",
      "DATA USAGE": "—",
      "NETWORK HEALTH": health.ok ? "HEALTHY" : "UNKNOWN",
    };
    return NextResponse.json({ ok: health.ok, configured: true, source: "mikrotik-rest", metrics, health, runtime, sessionSource: "/ip/hotspot/active", fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, configured: true, source: "mikrotik-rest", metrics: { "ACTIVE SESSIONS": "—", "ONLINE DEVICES": health.ok ? "1" : "0", "NETWORK HEALTH": health.ok ? "DEGRADED" : "UNKNOWN" }, health, runtime, error: error instanceof Error ? error.message : String(error), fetchedAt: new Date().toISOString() }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
