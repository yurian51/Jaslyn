import { NextResponse } from "next/server";
import { createJaslynBenchmarkRuntime } from "../../../../src/benchmark/index.mjs";
import { authorizeRequest } from "../../../../src/security/api-auth.mjs";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "cache-control": "no-store" } });
  try {
    const { id } = await params;
    if (!id || id.length > 128) return NextResponse.json({ error: "A valid Jaslyn run id is required." }, { status: 400 });
    const runtime = await createJaslynBenchmarkRuntime().initialize();
    const run = runtime.getRun(id);
    if (!run) return NextResponse.json({ error: "Jaslyn run not found." }, { status: 404 });
    return NextResponse.json({ run }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to read Jaslyn run." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
