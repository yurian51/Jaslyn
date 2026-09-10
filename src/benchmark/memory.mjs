import crypto from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 25;

export class JsonMemory {
  constructor(file = process.env.JASLYN_MEMORY_FILE || ".jaslyn/memory.json", { maxRecords = 2_000, lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS } = {}) {
    this.file = file;
    this.maxRecords = Math.max(10, Number(maxRecords) || 2_000);
    this.lockTimeoutMs = Math.max(250, Number(lockTimeoutMs) || DEFAULT_LOCK_TIMEOUT_MS);
    this.lockPath = `${file}.lock`;
    this.records = [];
  }

  async load() {
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw);
      this.records = Array.isArray(parsed) ? parsed.slice(-this.maxRecords) : [];
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this.records = [];
    }
    return this;
  }

  async remember(record) {
    return this.#mutate((records) => {
      const item = {
        id: record.id || crypto.randomUUID(),
        namespace: record.namespace || "default",
        content: String(record.content ?? ""),
        metadata: record.metadata && typeof record.metadata === "object" ? record.metadata : {},
        createdAt: record.createdAt || new Date().toISOString(),
      };
      records.push(item);
      if (records.length > this.maxRecords) records.splice(0, records.length - this.maxRecords);
      return item;
    });
  }

  search(query, { namespace, limit = 8 } = {}) {
    const q = String(query || "").toLowerCase().trim();
    return this.records
      .filter((r) => !namespace || r.namespace === namespace)
      .map((r) => ({ record: r, score: score(r, q) }))
      .filter((x) => !q || x.score > 0)
      .sort((a, b) => b.score - a.score || b.record.createdAt.localeCompare(a.record.createdAt))
      .slice(0, Math.max(1, Math.min(200, Number(limit) || 8)))
      .map((x) => x.record);
  }

  async #mutate(mutator) {
    await this.#acquireLock();
    try {
      await this.load();
      const result = await mutator(this.records);
      await this.#flush();
      return result;
    } finally {
      await rm(this.lockPath, { recursive: true, force: true }).catch(() => {});
    }
  }

  async #acquireLock() {
    const started = Date.now();
    await mkdir(dirname(this.file), { recursive: true });
    while (true) {
      try {
        await mkdir(this.lockPath, { recursive: false });
        return;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        if (Date.now() - started >= this.lockTimeoutMs) throw new Error(`Memory store lock timeout after ${this.lockTimeoutMs}ms.`);
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      }
    }
  }

  async #flush() {
    const directory = dirname(this.file);
    await mkdir(directory, { recursive: true });
    const tmp = `${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(this.records, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(tmp, this.file);
  }
}

function score(record, query) {
  if (!query) return 1;
  const haystack = `${record.content} ${JSON.stringify(record.metadata)}`.toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  return terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
}
