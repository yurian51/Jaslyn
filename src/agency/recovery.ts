export type RecoveryAction="retry"|"replan"|"escalate"|"stop";
export interface RecoveryResult { action:RecoveryAction; delayMs:number; reason:string; }
export class AgencyRecovery {
  decide(attempt:number, transient:boolean):RecoveryResult {
    if(attempt>=3) return {action:"replan",delayMs:0,reason:"Retry budget exhausted; replan instead of looping blindly."};
    if(transient) return {action:"retry",delayMs:Math.min(30000,1000*2**attempt),reason:"Transient failure; exponential backoff."};
    return {action:"escalate",delayMs:0,reason:"Failure is not classified as safely recoverable."};
  }
}
