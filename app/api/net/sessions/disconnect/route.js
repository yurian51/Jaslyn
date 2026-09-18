import { NextResponse } from "next/server";
import { z } from "zod";
import { createNetworkProvider } from "../../../../../src/net/providers/registry.mjs";
import { assertCapability } from "../../../../../src/net/providers/contract.mjs";
import { hasSecret } from "../../../../../src/net/auth.mjs";

const schema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(["hotspot", "pppoe"]).default("hotspot"),
  reason: z.string().trim().min(1).max(300).optional(),
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function providerFromEnvironment() {
  if (!(process.env.JASLYN_MIKROTIK_URL && process.env.JASLYN_MIKROTIK_USERNAME && process.env.JASLYN_MIKROTIK_PASSWORD)) return null;
  return createNetworkProvider({
    type: "mikrotik-rest",
    baseUrl: process.env.JASLYN_MIKROTIK_URL,
    username: process.env.JASLYN_MIKROTIK_USERNAME,
    password: process.env.JASLYN_MIKROTIK_PASSWORD,
  });
}

export async function POST(request) {
  if (!hasSecret(request, "JASLYN_NET_COMMAND_KEY", "x-jaslyn-net-key")) {
    return NextResponse.json({ ok: false, error: "Network command authorization is not configured or is invalid." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "id, type and an optional reason are required; type must be hotspot or pppoe." }, { status: 400 });
  }

  const provider = providerFromEnvironment();
  if (!provider) return NextResponse.json({ ok: false, error: "MikroTik REST credentials are not configured." }, { status: 503 });

  try {
    assertCapability(provider, "disconnect");
    const result = await provider.disconnect({ type: parsed.data.type, id: parsed.data.id });
    let verified = false;
    let verificationAttempts = 0;

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      verificationAttempts = attempt;
      await sleep(250 * attempt);
      const sessions = await provider.getSessions();
      const remaining = parsed.data.type === "hotspot" ? sessions.hotspot : sessions.pppoe;
      verified = !remaining.some((session) => session?.id === parsed.data.id);
      if (verified) break;
    }

    return NextResponse.json({
      ok: verified,
      command: "DISCONNECT_USER",
      target: parsed.data.id,
      sessionType: parsed.data.type,
      reason: parsed.data.reason ?? "operator_request",
      provider: provider.name,
      result,
      verified,
      verificationAttempts,
      verificationRequired: true,
    }, { status: verified ? 200 : 409, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      verified: false,
      verificationRequired: true,
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
