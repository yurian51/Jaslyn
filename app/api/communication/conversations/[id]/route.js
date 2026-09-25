import { NextResponse } from "next/server";
import { requireSession } from "../../../../../src/net/auth.mjs";
import { getConversation } from "../../../../../src/communication/store.mjs";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const session = await requireSession(request);
    const conversation = await getConversation(session, params.id);
    if (!conversation) return NextResponse.json({ ok:false, error:"CONVERSATION_NOT_FOUND" }, { status:404 });
    return NextResponse.json({ ok:true, conversation }, { headers: { "Cache-Control":"no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok:false, error:message }, { status: message==="AUTH_REQUIRED" ? 401 : 400 });
  }
}
