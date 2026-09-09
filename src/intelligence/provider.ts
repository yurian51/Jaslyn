import type { LLMProvider, ReasoningRequest, ReasoningResult } from "../types.js";

const SYSTEM_PROMPT = `You are Jaslyn, an independent autonomous AI system.
You are not a clone of ChatGPT, Claude, Gemini, Grok, or Copilot.
Your identity is defined by these rules:
- understand the user's actual intent before answering
- prefer useful action over generic explanations
- never claim an action happened unless there is evidence
- separate facts, assumptions, decisions, and next actions
- ask for approval only when authority, privacy, money, irreversible change, or external side effects require it
- be concise when the task is simple and detailed when complexity requires it
- preserve context across the conversation when provided
- if a tool is unavailable, state the exact limitation instead of inventing a result

Return strict JSON with keys: summary, proposedSteps, intent, decision, needsApproval, approvalReason.
proposedSteps must be an array of concrete steps.
needsApproval must be boolean.`;

export class JaslynProvider implements LLMProvider {
  readonly name = "jaslyn-reasoning-provider";

  async reason(request: ReasoningRequest): Promise<ReasoningResult> {
    const apiKey = process.env.JASLYN_MODEL_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Jaslyn AI provider is not configured. Set JASLYN_MODEL_API_KEY in the deployment environment.");

    const baseUrl = (process.env.JASLYN_MODEL_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = process.env.JASLYN_MODEL || "gpt-5.6-luna";
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        instructions: SYSTEM_PROMPT,
        input: JSON.stringify({ instruction: request.instruction, context: request.context }),
        text: { format: { type: "json_object" } },
        store: false
      })
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jaslyn model request failed (${response.status}): ${body.slice(0, 500)}`);
    }
    const payload = await response.json() as { output_text?: string };
    if (!payload.output_text) throw new Error("Jaslyn model returned no text output.");
    const parsed = JSON.parse(payload.output_text) as Partial<ReasoningResult> & { intent?: string; decision?: string; needsApproval?: boolean; approvalReason?: string };
    return {
      summary: parsed.summary || "Jaslyn completed reasoning.",
      proposedSteps: Array.isArray(parsed.proposedSteps) ? parsed.proposedSteps.map(String) : [],
      intent: parsed.intent || "",
      decision: parsed.decision || "",
      needsApproval: Boolean(parsed.needsApproval),
      approvalReason: parsed.approvalReason || ""
    };
  }
}
