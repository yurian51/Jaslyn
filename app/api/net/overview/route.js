import { NextResponse } from "next/server";
import { databaseHealth, getNetworkRuntime, checkNetworkHealth } from "../../../../src/net/runtime.mjs";
import { MikroTikRestProvider } from "../../../../src/net/providers/mikrotik-rest.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = getNetworkRuntime();
  const [network, database] = await Promise.all([checkNetworkHealth(), databaseHealth()]);
  if (!runtime.configured) {
    return NextResponse.json({ ok: false, configured: false, source: "jaslyn-net-control-plane", metrics: {}, health: { network, database }, runtime, message: "Live Jaslyn Net data sources are not configured. No production metrics are fabricated." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const metrics = { CUSTOMERS: "—", "ACTIVE SESSIONS": "—", "SETTLED REVENUE": "—", "ONLINE DEVICES": "—", "DATA USAGE": "—", "NETWORK HEALTH": network.ok ? "HEALTHY" : "UNKNOWN" };
  if (!runtime.capabilities.mikrotikHealth) {
    return NextResponse.json({ ok: database.ok, configured: true, source: database.configured ? "postgresql" : "jaslyn-net-control-plane", metrics, health: { network, database }, runtime, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  }

  const provider = new MikroTikRestProvider({ baseUrl: process.env.JASLYN_MIKROTIK_URL, username: process.env.JASLYN_MIKROTIK_USERNAME, password: process.env.JASLYN_MIKROTIK_PASSWORD });
  try {
    const sessions = await provider.listHotspotActive();
    metrics["ACTIVE SESSIONS"] = String(sessions.length);
    metrics["ONLINE DEVICES"] = network.ok ? "1" : "0";
    return NextResponse.json({ ok: network.ok || database.ok, configured: true, source: "mikrotik-rest", metrics, health: { network, database }, runtime, sessionSource: "/ip/hotspot/active", fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    metrics["ONLINE DEVICES"] = network.ok ? "1" : "0";
    metrics["NETWORK HEALTH"] = network.ok ? "DEGRADED" : "UNKNOWN";
    return NextResponse.json({ ok: false, configured: true, source: "mikrotik-rest", metrics, health: { network, database }, runtime, error: error instanceof Error ? error.message : String(error), fetchedAt: new Date().toISOString() }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
