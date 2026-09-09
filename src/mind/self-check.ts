import type { Decision, MindContext } from "./types.js";
export interface MindCheck { valid:boolean; issues:string[]; }
export class MindSelfCheck {
  inspect(context:MindContext,decision:Decision):MindCheck {
    const issues:string[]=[];
    if(!context.goal.outcome) issues.push("Goal has no measurable outcome.");
    if(context.objectives.length===0) issues.push("No objectives were derived.");
    if(decision.confidence<0.6) issues.push("Decision confidence is below execution threshold.");
    return {valid:issues.length===0,issues};
  }
}
