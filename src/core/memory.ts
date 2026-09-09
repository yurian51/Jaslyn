import type { MemoryRecord, MemoryStore } from "../types.js";

export class InMemoryStore implements MemoryStore {
  private readonly records: MemoryRecord[] = [];

  async put(record: MemoryRecord): Promise<void> {
    this.records.push(record);
  }

  async search(namespace: string, query: string, limit = 10): Promise<MemoryRecord[]> {
    const q = query.toLowerCase();
    return this.records
      .filter((r) => r.namespace === namespace && r.content.toLowerCase().includes(q))
      .slice(-limit)
      .reverse();
  }
}
