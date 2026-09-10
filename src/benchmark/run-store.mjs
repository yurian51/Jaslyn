import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import { dirname } from "node:path";

const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 25;

export class JsonRunStore {
  constructor(filePath = ".jaslyn/runs.json", { maxRuns = 1000, lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS } = {}) {
    this.filePath = filePath;
    this.maxRuns = Math.max(10, Number(maxRuns) || 1000);
    this.lockTimeoutMs = Math.max(250, Number(lockTimeoutMs) || DEFAULT_LOCK_TIMEOUT_MS);
    this.lockPath = `${filePath}.lock`;
    this.runs = [];
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.runs = Array.isArray(parsed) ? parsed.slice(-this.maxRuns) : [];
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this.runs = [];
    }
    return this;
  }

  list({ limit = 50 } = {}) {
    return this.runs.slice(-Math.max(1, Math.min(200, Number(limit) || 50))).reverse();
  }

  get(id) {
    return this.runs.find((run) => run.id === id) || null;
  }

  async append(run) {
    await this.#acquireLock();
    try {
      await this.load();
      this.runs.push(sanitizeRun(run));
      if (this.runs.length > this.maxRuns) this.runs.splice(0, this.runs.length - this.maxRuns);
      await this.#persist();
      return run;
    } finally {
      await rm(this.lockPath, { recursive: true, force: true }).catch(() => {});
    }
  }

  async #acquireLock() {
    const started = Date.now();
    await mkdir(dirname(this.filePath), { recursive: true });
    while (true) {
      try {
        await mkdir(this.lockPath, { recursive: false });
        return;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        if (Date.now() - started >= this.lockTimeoutMs) throw new Error(`Run store lock timeout after ${this.lockTimeoutMs}ms.`);
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      }
    }
  }

  async #persist() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(this.runs, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temp, this.filePath);
  }
}

function sanitizeRun(run) {
  return {
    id: String(run.id),
    goal: String(run.goal || ""),
    provider: run.provider ? String(run.provider) : null,
    mode: run.mode ? String(run.mode) : "single",
    status: String(run.status || "completed"),
    startedAt: String(run.startedAt || new Date().toISOString()),
    finishedAt: String(run.finishedAt || new Date().toISOString()),
    verified: Boolean(run.verified),
    outcome: run.outcome || null,
    stepCount: Number(run.stepCount) || 0,
    toolCount: Number(run.toolCount) || 0,
  };
}
