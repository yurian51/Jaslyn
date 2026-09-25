import { NextResponse } from "next/server"; import { clearSessionCookie, revokeSession } from "../../../../src/net/auth.mjs";
export const dynamic="force-dynamic";
export async function POST(request){await revokeSession(request);return NextResponse.json({ok:true},{headers:{"Set-Cookie":clearSessionCookie(),"Cache-Control":"no-store"}})}