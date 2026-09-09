import type { Decision, MindContext } from "./types.js";
export class DecisionEngine {
  decide(context:MindContext):Decision {
    const risky=/delete|destroy|transfer|publish|send|deploy|purchase|payment/i.test(context.goal.outcome);
    return {action:risky?"prepare-and-request-approval":"execute-safe-plan",reason:risky?"The goal may create an external or irreversible side effect.":"The goal can begin through the safe execution path.",confidence:0.92,risk:risky?"high":"low",requiresApproval:risky};
  }
}
