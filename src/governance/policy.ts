import type {PolicyDecision,Risk} from "./types.js";
export class GovernancePolicy{
 evaluate(action:string,sideEffect:"none"|"reversible"|"irreversible"):PolicyDecision{
  const risk:Risk=sideEffect==="irreversible"?"critical":sideEffect==="reversible"?"medium":"low";
  const approval=sideEffect!=="none"||/delete|transfer|payment|publish|send|deploy/i.test(action);
  return{allowed:true,requiresApproval:approval,risk,reason:approval?"External or consequential side effect requires explicit approval.":"No consequential side effect detected."};
 }
}