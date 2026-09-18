import { NextResponse } from "next/server";
import { databaseHealth, getNetworkRuntime, checkNetworkHealth, getNetworkProvider } from "../../../../src/net/runtime.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = getNetworkRuntime();
  const [network, database] = await Promise.all([checkNetworkHealth(), databaseHealth()]);
  if (!runtime.configured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      source: "jaslyn-net-control-plane",
      metrics: {},
      health: { network, database },
      runtime,
      message: "Live Jaslyn Net data sources are not configured. No production metrics are fabricated.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const metrics = {
    CUSTOMERS: "—",
    "ACTIVE SESSIONS": "—",
    "SETTLED REVENUE": "—",
    "ONLINE DEVICES": "—",
    "DATA USAGE": "—",
    "NETWORK HEALTH": network.ok ? "HEALTHY" : "UNKNOWN",
  };

  const provider = getNetworkProvider();
  if (!provider || !runtime.capabilities.sessions) {
    return NextResponse.json({
      ok: database.ok || network.ok,
      configured: true,
      source: database.configured ? "postgresql" : "jaslyn-net-control-plane",
      metrics,
      health: { network, database },
      runtime,
      fetchedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const [sessions, devices] = await Promise.all([provider.getSessions(), provider.getDevices()]);
    const hotspotCount = sessions.hotspot.length;
    const pppoeCount = sessions.pppoe.length;
    metrics["ACTIVE SESSIONS"] = String(hotspotCount + pppoeCount);
    metrics["ONLINE DEVICES"] = String(network.ok ? devices.length : 0);
    return NextResponse.json({
      ok: network.ok || database.ok,
      configured: true,
      source: provider.name,
      metrics,
      health: { network, database },
      runtime,
      sessionSource: { hotspot: "ip/hotspot/active", pppoe: "ppp/active" },
      deviceSource: "system/identity + system/resource",
      sessionCounts: { hotspot: hotspotCount, pppoe: pppoeCount },
      fetchedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    metrics["NETWORK HEALTH"] = network.ok ? "DEGRADED" : "UNKNOWN";
    return NextResponse.json({
      ok: false,
      configured: true,
      source: provider.name,
      metrics,
      health: { network, database },
      runtime,
      error: error instanceof Error ? error.message : String(error),
      fetchedAt: new Date().toISOString(),
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
