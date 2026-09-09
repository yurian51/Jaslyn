import { NextResponse } from "next/server";
import { z } from "zod";
import { runPythonTool } from "../../../src-js/runtime/python-bridge.js";
import { complete } from "../../../src-js/runtime/provider.js";

const schema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string().max(20000),
    }),
  ).min(1).max(100),
  temperature: z.number().min(0).max(1).default(0.2),
});

const JASLYN_SYSTEM = `You are Jaslyn, an independent general-purpose AI agent. Your identity is Jaslyn, not a third-party assistant or model. Be direct, accurate, and useful. Never claim an external action happened without runtime evidence. Keep hidden chain-of-thought private and return concise reasoning summaries, plans, assumptions, and verifiable results. Ask for approval before consequential external actions.`;

export async function POST(request) {
  try {
    if (process.env.JASLYN_REQUIRE_API_KEY === "1") {
      const supplied =
        request.headers.get("x-jaslyn-key") ||
        request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "") ||
        "";
      const check = await runPythonTool({ tool: "api_key_verify", args: { key: supplied } });
      if (!check.valid) {
        return NextResponse.json({ error: "A valid Jaslyn API key is required." }, { status: 401 });
      }
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Valid messages are required." }, { status: 400 });
    }

    const messages = [
      { role: "system", content: JASLYN_SYSTEM },
      ...parsed.data.messages,
    ];
    const result = await complete(messages, { temperature: parsed.data.temperature });

    return NextResponse.json({
      provider: "jaslyn",
      model: result.model,
      message: { role: "assistant", content: result.content },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Jaslyn chat failed.";
    const status = message.includes("inference") || message.includes("configured") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
