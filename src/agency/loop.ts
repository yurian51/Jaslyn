import type { Objective } from "../mind/types.js";
export interface LoopAction { objective:Objective; attempt:number; shouldContinue:boolean; reason:string; }
export class AutonomousLoop {
  constructor(private readonly maxIterations=12){}
  next(objective:Objective, attempt:number, success:boolean):LoopAction {
    if(success) return {objective,attempt,shouldContinue:false,reason:"Objective verified."};
    if(attempt>=this.maxIterations) return {objective,attempt,shouldContinue:false,reason:"Autonomous iteration limit reached."};
    return {objective,attempt:attempt+1,shouldContinue:true,reason:"Objective not verified; recovery iteration permitted."};
  }
}
