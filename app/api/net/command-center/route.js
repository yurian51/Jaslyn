import { NextResponse } from "next/server";
import { z } from "zod";
import { getCommandCenterSnapshot } from "../../../../../src/net/command-center.mjs";

export const dynamic = "force-dynamic";

const querySchema = z.object({ organizationId: z.string().uuid().optional() });

export async function GET(request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ organizationId: url.searchParams.get("organizationId") || undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, error: "organizationId must be a valid UUID." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const snapshot = await getCommandCenterSnapshot(parsed.data);
  return NextResponse.json(snapshot, { status: snapshot.ok || !snapshot.configured ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
