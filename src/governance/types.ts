export type Risk="low"|"medium"|"high"|"critical";
export interface PolicyDecision{allowed:boolean;requiresApproval:boolean;risk:Risk;reason:string;}
