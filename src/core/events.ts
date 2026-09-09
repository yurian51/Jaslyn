export type JaslynEvent =
  | { type: "run.started"; runId: string; at: string }
  | { type: "plan.created"; runId: string; planId: string; at: string }
  | { type: "tool.started"; runId: string; tool: string; at: string }
  | { type: "tool.completed"; runId: string; tool: string; at: string }
  | { type: "tool.failed"; runId: string; tool: string; error: string; at: string }
  | { type: "run.verified"; runId: string; success: boolean; at: string };

export type EventHandler = (event: JaslynEvent) => void | Promise<void>;

export class EventBus {
  private readonly handlers = new Map<JaslynEvent["type"], Set<EventHandler>>();

  on(type: JaslynEvent["type"], handler: EventHandler): () => void {
    const set = this.handlers.get(type) ?? new Set<EventHandler>();
    set.add(handler);
    this.handlers.set(type, set);
    return () => set.delete(handler);
  }

  async emit(event: JaslynEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? new Set<EventHandler>();
    await Promise.all([...handlers].map((handler) => handler(event)));
  }
}
