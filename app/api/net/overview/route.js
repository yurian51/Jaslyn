import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: false,
    source: "jaslyn-net-control-plane",
    metrics: {},
    message: "Live Jaslyn Net data sources are not configured. No production metrics are fabricated.",
  }, { headers: { "Cache-Control": "no-store" } });
}
