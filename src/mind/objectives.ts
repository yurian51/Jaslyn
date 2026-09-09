import type { Goal, Objective } from "./types.js";
export class ObjectiveEngine {
  derive(goal:Goal): Objective[] {
    const base=[
      ["Understand the desired outcome.","Define what success means and identify constraints."],
      ["Plan the work.","Order the smallest actionable steps and dependencies."],
      ["Execute permitted actions.","Use only registered capabilities within policy."],
      ["Verify the outcome.","Collect evidence that the requested outcome actually happened."]
    ];
    return base.map(([title,outcome],i)=>({id:crypto.randomUUID(),goalId:goal.id,title,outcome,dependsOn:i?[crypto.randomUUID()]:[],status:"ready",priority:goal.priority})) as Objective[];
  }
}
