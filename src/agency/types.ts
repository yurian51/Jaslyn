import type { Objective, Priority } from "../mind/types.js";
export type AutonomyMode="assist"|"supervised"|"autonomous";
export interface ObjectiveRun { objective:Objective; attempt:number; status:"queued"|"running"|"blocked"|"completed"|"failed"; startedAt?:string; finishedAt?:string; error?:string; }
export interface BackgroundTask { id:string; name:string; schedule:string; enabled:boolean; priority:Priority; lastRunAt?:string; nextRunAt?:string; }
