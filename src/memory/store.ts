import type {MemoryItem,MemoryKind} from "./types.js";
export class MemoryStore{
 private items=new Map<string,MemoryItem>();
 put(input:Omit<MemoryItem,"id"|"createdAt"|"updatedAt">){const now=new Date().toISOString();const old=[...this.items.values()].find(x=>x.key===input.key&&x.kind===input.kind);const item={...input,id:old?.id??crypto.randomUUID(),createdAt:old?.createdAt??now,updatedAt:now};this.items.set(item.id,item);return item;}
 get(key:string,kind?:MemoryKind){return [...this.items.values()].filter(x=>x.key===key&&(!kind||x.kind===kind));}
 search(query:string){const q=query.toLowerCase();return [...this.items.values()].filter(x=>x.key.toLowerCase().includes(q)||JSON.stringify(x.value).toLowerCase().includes(q));}
}