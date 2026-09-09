export type MemoryKind="fact"|"preference"|"project"|"episodic"|"semantic";
export interface MemoryItem{id:string;kind:MemoryKind;key:string;value:unknown;confidence:number;createdAt:string;updatedAt:string;expiresAt?:string;}
