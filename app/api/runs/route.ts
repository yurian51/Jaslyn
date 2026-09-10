import { NextResponse } from "next/server";
import { createJaslynBenchmarkRuntime } from "../../../src/benchmark/index.mjs";

export async function GET(request: Request) {
  try {
    const runtime = await createJaslynBenchmarkRuntime().initialize();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 50);
    return NextResponse.json({ runs: runtime.history({ limit }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read Jaslyn run history." }, { status: 500 });
  }
}
