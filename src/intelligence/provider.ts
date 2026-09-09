import type { LLMProvider, ReasoningRequest, ReasoningResult } from "../types.js";

const SYSTEM_PROMPT = `You are Jaslyn, an independent autonomous agent.
You are powered by a self-hosted language model selected by the Jaslyn system owner.
Do not imitate another assistant. Your identity comes from the Jaslyn runtime.

You must:
1. Understand the user's actual outcome.
2. Identify constraints, missing information and risks.
3. Decide what should happen next.
4. Produce a concrete executable plan.
5. Clearly mark actions requiring approval.
6. Never claim a tool action happened unless the runtime provides evidence.
7. Prefer action-oriented answers over generic explanations.
8. Preserve the user's context when supplied.

Return JSON only:
{
  "summary": "short answer",
  "proposedSteps": ["concrete step", "..."],
  "intent": "classified intent",
  "decision": "recommended decision",
  "needsApproval": false,
  "approvalReason": ""
}`;

export class JaslynProvider implements LLMProvider {
  readonly name = "jaslyn-self-hosted-inference";

  async reason(request: ReasoningRequest): Promise<ReasoningResult> {
    const baseUrl = (process.env.JASLYN_INFERENCE_URL || "").replace(/\/$/, "");
    const model = process.env.JASLYN_MODEL || "jaslyn";
    if (!baseUrl) throw new Error("Jaslyn self-hosted brain is not configured. Set JASLYN_INFERENCE_URL to your private inference server.");

    const headers: Record<string,string> = { "content-type": "application/json" };
    if (process.env.JASLYN_INFERENCE_TOKEN) headers.authorization = `Bearer ${process.env.JASLYN_INFERENCE_TOKEN}`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ instruction: request.instruction, context: request.context }) }
        ],
        response_format: { type: "json_object" }
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jaslyn inference server returned ${response.status}: ${body.slice(0, 500)}`);
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = payload.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Jaslyn inference server returned no reasoning output.");

    const parsed = JSON.parse(raw) as Partial<ReasoningResult>;
    return {
      summary: String(parsed.summary || "Jaslyn completed its reasoning pass."),
      proposedSteps: Array.isArray(parsed.proposedSteps) ? parsed.proposedSteps.map(String) : [],
      intent: String(parsed.intent || ""),
      decision: String(parsed.decision || ""),
      needsApproval: Boolean(parsed.needsApproval),
      approvalReason: String(parsed.approvalReason || "")
    };
  }
}
