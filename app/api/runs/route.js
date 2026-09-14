import { NextResponse } from "next/server";
import { createJaslynBenchmarkRuntime } from "../../../src/benchmark/index.mjs";
import { authorizeRequest } from "../../../src/security/api-auth.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "cache-control": "no-store" } });
  try {
    const runtime = await createJaslynBenchmarkRuntime().initialize();
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") || 50);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 50;
    return NextResponse.json({ runs: runtime.history({ limit }) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to read Jaslyn run history." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
