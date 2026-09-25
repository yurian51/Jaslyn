import { NextResponse } from "next/server";
import { requireSession } from "../../../../../../src/net/auth.mjs";
import { createMessage } from "../../../../../../src/communication/store.mjs";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  try {
    const session = await requireSession(request);
    const message = await createMessage(session, params.id, await request.json());
    return NextResponse.json({ ok:true, message }, { status:201, headers:{"Cache-Control":"no-store"} });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message==="AUTH_REQUIRED" ? 401 : message==="CONVERSATION_NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ ok:false, error:message }, { status });
  }
}
