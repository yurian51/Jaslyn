import { NextResponse } from "next/server";
import { z } from "zod";
import { JaslynProvider } from "../../../src/intelligence/provider";
import { DeepExecutionCoordinator } from "../../../src/core/deep-execution";
import { runPythonTool } from "../../../src/bridge/python-runner";

const schema = z.object({
  instruction: z.string().trim().min(1).max(8000),
  context: z.record(z.string(), z.unknown()).optional(),
  maxSteps: z.number().int().min(1).max(100).default(100),
});

export async function POST(request: Request) {
  try {
    if (process.env.JASLYN_REQUIRE_API_KEY === "1") {
      const suppliedKey = request.headers.get("x-jaslyn-key") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      const keyCheck = await runPythonTool({ tool: "api_key_verify", args: { key: suppliedKey || "" } });
      if (!keyCheck.valid) return NextResponse.json({ error: "A valid Jaslyn API key is required." }, { status: 401 });
    }
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Instruction is required." }, { status: 400 });

    const provider = new JaslynProvider();
    const reasoning = await provider.reason({
      instruction: parsed.data.instruction,
      context: parsed.data.context ?? {}
    });

    const objectives = reasoning.proposedSteps.length > 0
      ? reasoning.proposedSteps
      : ["Inspect the requested objective", "Prepare an operational response", "Verify the response boundary"];
    const phases = ["Observe current signals", "Normalize inputs", "Check constraints", "Prioritize work", "Prepare action", "Execute bounded action", "Observe result", "Reconcile outcome", "Verify evidence", "Record learning"];
    const executionPlan = Array.from({ length: parsed.data.maxSteps }, (_, index) => {
      const iteration = Math.floor(index / phases.length) + 1;
      const phaseIndex = index % phases.length;
      const objective = objectives[index % objectives.length];
      const phase = phases[phaseIndex];
      return {
        id: `iteration-${iteration}-checkpoint-${phaseIndex + 1}`,
        description: `Iteration ${iteration}/10 · ${phase}: ${objective}`,
        requiresApproval: Boolean(reasoning.needsApproval) && phaseIndex === 5,
      };
    });
    const execution = await new DeepExecutionCoordinator(parsed.data.maxSteps).run(executionPlan, {
      requiresApproval: Boolean(reasoning.needsApproval),
    });

    return NextResponse.json({
      status: reasoning.needsApproval ? "approval_required" : "planned",
      goal: parsed.data.instruction,
      reasoning: reasoning.summary,
      intent: reasoning.intent,
      decision: reasoning.decision,
      needsApproval: reasoning.needsApproval,
      approvalReason: reasoning.approvalReason,
      steps: execution.events.filter((event) => event.status === "verified" || event.status === "blocked").map((event) => `${event.description} · ${event.status}`),
      execution,
      provider: provider.name,
      model: process.env.JASLYN_MODEL || "jaslyn"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Jaslyn could not reach its private inference server.";
    return NextResponse.json({ status: "brain_offline", error: message }, { status: 503 });
  }
}
