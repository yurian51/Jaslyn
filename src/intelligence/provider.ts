import type { LLMProvider, ReasoningRequest, ReasoningResult } from "../types.js";

export class DeterministicProvider implements LLMProvider {
  readonly name = "deterministic";

  async reason(request: ReasoningRequest): Promise<ReasoningResult> {
    return {
      summary: `Jaslyn received: ${request.instruction}`,
      proposedSteps: [
        "Understand the requested outcome.",
        "Build a minimal executable plan.",
        "Execute only permitted actions.",
        "Verify the result before reporting success."
      ]
    };
  }
}
