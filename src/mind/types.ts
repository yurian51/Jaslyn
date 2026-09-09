export type Priority = "low" | "normal" | "high" | "critical";
export type GoalStatus = "draft" | "ready" | "running" | "blocked" | "completed" | "failed" | "cancelled";
export interface Goal { id:string; title:string; outcome:string; priority:Priority; status:GoalStatus; createdAt:string; }
export interface Objective { id:string; goalId:string; title:string; outcome:string; dependsOn:string[]; status:GoalStatus; priority:Priority; }
export interface Decision { action:string; reason:string; confidence:number; risk:"low"|"medium"|"high"; requiresApproval:boolean; }
export interface MindContext { goal:Goal; objectives:Objective[]; constraints:string[]; facts:Record<string,unknown>; }
