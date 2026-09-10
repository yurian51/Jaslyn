import { NextResponse } from "next/server";
import { z } from "zod";
import { runPythonTool } from "../../../src/bridge/python-runner";
import { createJaslynBenchmarkRuntime } from "../../../src/benchmark/index.mjs";

const schema = z.object({
  messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().max(20000) })).min(1).max(100),
  temperature: z.number().min(0).max(1).default(0.2),
  model: z.string().min(1).max(120).optional(),
  fanout: z.boolean().default(false),
});

const JASLYN_SYSTEM = `You are Jaslyn, an independent general-purpose AI agent. You can help with conversation, analysis, writing, coding, debugging, planning, research, and structured work. You are not GPT, Claude, Gemini, Copilot, Manus, or a clone of another product. Be direct, accurate, and useful. Never claim an external action happened without execution evidence. Keep hidden chain-of-thought private; provide concise reasoning summaries, plans, assumptions, and verifiable results.`;

export async function POST(request: Request) {
  try {
    if (process.env.JASLYN_REQUIRE_API_KEY === "1") {
      const supplied = request.headers.get("x-jaslyn-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      const check = await runPythonTool({ tool: "api_key_verify", args: { key: supplied || "" } });
      if (!check.valid) return NextResponse.json({ error: "A valid Jaslyn API key is required." }, { status: 401 });
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Valid messages are required." }, { status: 400 });
    const lastUser = [...parsed.data.messages].reverse().find((message) => message.role === "user")?.content;
    if (!lastUser) return NextResponse.json({ error: "A user message is required." }, { status: 400 });

    if (!process.env.JASLYN_INFERENCE_URL) return NextResponse.json({ error: "Configure JASLYN_INFERENCE_URL for Jaslyn's self-hosted model brain." }, { status: 503 });

    const runtime = await createJaslynBenchmarkRuntime({
      provider: { id: "jaslyn-local", model: parsed.data.model || process.env.JASLYN_MODEL || "jaslyn" },
      maxIterations: 8,
    }).initialize();

    const context = {
      system: JASLYN_SYSTEM,
      conversation: parsed.data.messages,
      temperature: parsed.data.temperature,
    };

    const result = await runtime.run(lastUser, {
      providerId: "jaslyn-local",
      context,
      fanout: parsed.data.fanout,
    });

    if (result.mode === "fanout") {
      return NextResponse.json({ provider: "jaslyn-benchmark", mode: "fanout", comparison: result.comparison, events: result.events });
    }

    const content = result.reasoning?.summary || result.reasoning?.decision || "Jaslyn completed a reasoning pass without a final summary.";
    return NextResponse.json({
      provider: "jaslyn",
      model: result.provider,
      message: { role: "assistant", content },
      reasoning: result.reasoning,
      plan: result.steps,
      toolResults: result.toolResults,
      outcome: result.outcome,
      verified: result.verified,
      events: result.events,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Jaslyn chat failed." }, { status: 500 });
  }
}
