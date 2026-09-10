import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonRunStore {
  constructor(filePath = ".jaslyn/runs.json", { maxRuns = 1000 } = {}) {
    this.filePath = filePath;
    this.maxRuns = Math.max(10, Number(maxRuns) || 1000);
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
    this.runs.push(sanitizeRun(run));
    if (this.runs.length > this.maxRuns) this.runs.splice(0, this.runs.length - this.maxRuns);
    await this.#persist();
    return run;
  }

  async #persist() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
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
