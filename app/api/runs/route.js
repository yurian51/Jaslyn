import { NextResponse } from "next/server";
import { createJaslynBenchmarkRuntime } from "../../../src/benchmark/index.mjs";
export const dynamic = "force-dynamic";
export async function GET(request) { try { const runtime = await createJaslynBenchmarkRuntime().initialize(); const url = new URL(request.url); const rawLimit = Number(url.searchParams.get("limit") || 50); const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 50; return NextResponse.json({ runs: runtime.history({ limit }) }, { headers: { "cache-control": "no-store" } }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read Jaslyn run history." }, { status: 500, headers: { "cache-control": "no-store" } }); } }
