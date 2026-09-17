import { NextResponse } from "next/server";
import { getNetworkRuntime } from "../../../../src/net/runtime.mjs";
import { MikroTikRestProvider } from "../../../../src/net/providers/mikrotik-rest.mjs";

export const dynamic = "force-dynamic";

function configured() {
  return Boolean(process.env.JASLYN_MIKROTIK_URL && process.env.JASLYN_MIKROTIK_USERNAME && process.env.JASLYN_MIKROTIK_PASSWORD);
}

export async function GET() {
  if (!configured()) return NextResponse.json({ ok: false, configured: false, sessions: [], error: "MikroTik REST credentials are not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const provider = new MikroTikRestProvider({ baseUrl: process.env.JASLYN_MIKROTIK_URL, username: process.env.JASLYN_MIKROTIK_USERNAME, password: process.env.JASLYN_MIKROTIK_PASSWORD });
  try {
    const sessions = await provider.listHotspotActive();
    return NextResponse.json({ ok: true, runtime: getNetworkRuntime(), source: "mikrotik-rest:/ip/hotspot/active", sessions, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, configured: true, sessions: [], error: error instanceof Error ? error.message : String(error) }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
