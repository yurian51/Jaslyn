import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonMemory {
  constructor(file = process.env.JASLYN_MEMORY_FILE || ".jaslyn/memory.json") {
    this.file = file;
    this.records = [];
  }

  async load() {
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw);
      this.records = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this.records = [];
    }
    return this;
  }

  async remember(record) {
    const item = {
      id: record.id || crypto.randomUUID(),
      namespace: record.namespace || "default",
      content: String(record.content ?? ""),
      metadata: record.metadata && typeof record.metadata === "object" ? record.metadata : {},
      createdAt: record.createdAt || new Date().toISOString(),
    };
    this.records.push(item);
    if (this.records.length > 2_000) this.records = this.records.slice(-2_000);
    await this.#flush();
    return item;
  }

  search(query, { namespace, limit = 8 } = {}) {
    const q = String(query || "").toLowerCase().trim();
    return this.records
      .filter((r) => !namespace || r.namespace === namespace)
      .map((r) => ({ record: r, score: score(r, q) }))
      .filter((x) => !q || x.score > 0)
      .sort((a, b) => b.score - a.score || b.record.createdAt.localeCompare(a.record.createdAt))
      .slice(0, limit)
      .map((x) => x.record);
  }

  async #flush() {
    const directory = dirname(this.file);
    await mkdir(directory, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(this.records, null, 2), { mode: 0o600 });
    await rename(tmp, this.file);
  }
}

function score(record, query) {
  if (!query) return 1;
  const haystack = `${record.content} ${JSON.stringify(record.metadata)}`.toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  return terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
}
