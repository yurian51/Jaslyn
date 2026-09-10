import { createProvider } from "./provider-registry.mjs";

export function createSelfHostedProvider({ id = "jaslyn-local", baseUrl = process.env.JASLYN_INFERENCE_URL, model = process.env.JASLYN_MODEL || "jaslyn" } = {}) {
  if (!baseUrl) throw new Error("Set JASLYN_INFERENCE_URL before starting Jaslyn.");
  const normalized = baseUrl.replace(/\/$/, "");
  return createProvider({
    id,
    name: "Jaslyn Self-Hosted Brain",
    model,
    health: async () => {
      const response = await fetch(`${normalized}/models`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Inference health returned ${response.status}`);
    },
    reason: async ({ instruction, context = {} }) => {
      const system = [
        "You are Jaslyn, an independent autonomous AI agent.",
        "Follow: Understand -> Context -> Plan -> Policy -> Approve -> Execute -> Observe -> Verify -> Recover -> Remember.",
        "Do not imitate or identify as another AI product.",
        "Never claim an external action happened without evidence from a tool result.",
        "Return JSON with summary, proposedSteps, intent, decision, needsApproval, approvalReason, and optional toolCalls.",
      ].join("\n");
      const response = await fetch(`${normalized}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(process.env.JASLYN_INFERENCE_TOKEN ? { authorization: `Bearer ${process.env.JASLYN_INFERENCE_TOKEN}` } : {}) },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          stream: false,
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify({ instruction, context }) },
          ],
          response_format: { type: "json_object" },
        }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Jaslyn inference returned ${response.status}: ${(await response.text()).slice(0, 400)}`);
      const payload = await response.json();
      const raw = payload?.choices?.[0]?.message?.content;
      if (!raw) throw new Error("Jaslyn inference returned no content.");
      try {
        return JSON.parse(raw);
      } catch {
        return { summary: String(raw), proposedSteps: [], needsApproval: false, approvalReason: "", raw: String(raw) };
      }
    },
  });
}
