import type { BackgroundTask } from "./types.js";
export class BackgroundTaskRegistry {
  private readonly tasks=new Map<string,BackgroundTask>();
  register(task:BackgroundTask){this.tasks.set(task.id,task);return task;}
  list(){return [...this.tasks.values()];}
  due(now=Date.now()){return this.list().filter(t=>t.enabled && (!t.nextRunAt || Date.parse(t.nextRunAt)<=now));}
}
