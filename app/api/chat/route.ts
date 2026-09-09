import { NextResponse } from "next/server";
import { z } from "zod";
import { runPythonTool } from "../../../src/bridge/python-runner";

const schema = z.object({
  messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().max(20000) })).min(1).max(100),
  temperature: z.number().min(0).max(1).default(0.2),
});

const JASLYN_SYSTEM = `You are Jaslyn, an independent general-purpose AI agent. You can help with conversation, analysis, writing, coding, debugging, planning, research, and structured work. You are not GPT, Claude, Gemini, Copilot, Manus, or a clone of another product. Be direct, accurate, and useful. Never claim an external action happened without execution evidence. Keep hidden chain-of-thought private; provide concise reasoning summaries, plans, assumptions, and verifiable results. Ask for approval before consequential external actions. You can use registered Jaslyn tools when the runtime authorizes them.`;

export async function POST(request: Request) {
  try {
    if (process.env.JASLYN_REQUIRE_API_KEY === "1") {
      const supplied = request.headers.get("x-jaslyn-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      const check = await runPythonTool({ tool: "api_key_verify", args: { key: supplied || "" } });
      if (!check.valid) return NextResponse.json({ error: "A valid Jaslyn API key is required." }, { status: 401 });
    }
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Valid messages are required." }, { status: 400 });
    const baseUrl = (process.env.JASLYN_INFERENCE_URL || "").replace(/\/$/, "");
    if (!baseUrl) return NextResponse.json({ error: "Configure JASLYN_INFERENCE_URL for Jaslyn's self-hosted model brain." }, { status: 503 });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (process.env.JASLYN_INFERENCE_TOKEN) headers.authorization = `Bearer ${process.env.JASLYN_INFERENCE_TOKEN}`;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: process.env.JASLYN_MODEL || "jaslyn", temperature: parsed.data.temperature, stream: false, messages: [{ role: "system", content: JASLYN_SYSTEM }, ...parsed.data.messages] }),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: `Jaslyn model returned ${response.status}.` }, { status: 502 });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "Jaslyn model returned no message." }, { status: 502 });
    return NextResponse.json({ provider: "jaslyn", model: process.env.JASLYN_MODEL || "jaslyn", message: { role: "assistant", content } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Jaslyn chat failed." }, { status: 500 });
  }
}
