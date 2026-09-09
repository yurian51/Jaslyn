export interface ToolDefinition{name:string;description:string;sideEffect:"none"|"reversible"|"irreversible";execute:(input:unknown)=>Promise<unknown>|unknown;}
export interface ActionResult{tool:string;success:boolean;output?:unknown;error?:string;durationMs:number;}
