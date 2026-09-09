import type { Goal, Priority } from "./types.js";
export class IntentEngine {
  normalize(input:string): Goal {
    const outcome=input.trim().replace(/\s+/g," ");
    if(!outcome) throw new Error("A non-empty goal is required.");
    const priority:Priority=/delete|remove|transfer|publish|deploy/i.test(outcome)?"high":"normal";
    return {id:crypto.randomUUID(),title:outcome.slice(0,96),outcome,priority,status:"ready",createdAt:new Date().toISOString()};
  }
}
