import { NextResponse } from "next/server";
import { requireSession } from "../../../../src/net/auth.mjs";
import { createConversation, listConversations } from "../../../../src/communication/store.mjs";

export const dynamic = "force-dynamic";

function errorResponse(error) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message === "AUTH_REQUIRED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
  return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request) {
  try {
    const session = await requireSession(request);
    const url = new URL(request.url);
    return NextResponse.json({ ok: true, conversations: await listConversations(session, { limit: url.searchParams.get("limit") }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const session = await requireSession(request);
    const input = await request.json();
    const conversation = await createConversation(session, input || {});
    return NextResponse.json({ ok: true, conversation }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
