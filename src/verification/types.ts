export interface Evidence{source:string;claim:string;value:unknown;}
export interface VerificationResult{verified:boolean;score:number;evidence:Evidence[];failures:string[];}
