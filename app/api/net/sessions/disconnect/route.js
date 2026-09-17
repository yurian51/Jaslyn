import { NextResponse } from "next/server";
import { z } from "zod";
import { MikroTikRestProvider } from "../../../../../src/net/providers/mikrotik-rest.mjs";

const schema = z.object({ id: z.string().min(1).max(100), reason: z.string().trim().min(1).max(300).optional() });

function authorized(request) {
  const expected = process.env.JASLYN_NET_COMMAND_KEY?.trim();
  if (!expected) return false;
  const supplied = request.headers.get("x-jaslyn-net-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return supplied === expected;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Network command authorization is not configured or is invalid." }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ ok: false, error: "A valid HotSpot session id is required." }, { status: 400 });
  if (!(process.env.JASLYN_MIKROTIK_URL && process.env.JASLYN_MIKROTIK_USERNAME && process.env.JASLYN_MIKROTIK_PASSWORD)) return NextResponse.json({ ok: false, error: "MikroTik REST credentials are not configured." }, { status: 503 });

  const provider = new MikroTikRestProvider({ baseUrl: process.env.JASLYN_MIKROTIK_URL, username: process.env.JASLYN_MIKROTIK_USERNAME, password: process.env.JASLYN_MIKROTIK_PASSWORD });
  try {
    const result = await provider.disconnectHotspotSession(parsed.data.id);
    let verified = false;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await sleep(250 * attempt);
      const sessions = await provider.listHotspotActive();
      verified = !sessions.some((session) => session?.[".id"] === parsed.data.id);
      if (verified) break;
    }
    return NextResponse.json({ ok: verified, command: "DISCONNECT_USER", target: parsed.data.id, reason: parsed.data.reason ?? "operator_request", provider: "mikrotik-rest", result, verified, verificationAttempts: 4 }, { status: verified ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), verified: false }, { status: 502 });
  }
}
