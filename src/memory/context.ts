import type {MemoryItem} from "./types.js";
export class ContextEngine{
 build(goal:string,memories:MemoryItem[]){return {goal,relevantMemory:memories.slice(0,20),generatedAt:new Date().toISOString()};}
}