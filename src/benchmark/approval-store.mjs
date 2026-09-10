import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";

export class JsonApprovalStore {
  constructor(filePath = ".jaslyn/approvals.json", { maxRecords = 500 } = {}) {
    this.filePath = filePath;
    this.maxRecords = Math.max(20, Number(maxRecords) || 500);
    this.records = [];
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.records = Array.isArray(parsed) ? parsed.slice(-this.maxRecords) : [];
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this.records = [];
    }
    return this;
  }

  get(id) {
    return this.records.find((record) => record.id === id) || null;
  }

  list({ status, limit = 50 } = {}) {
    const filtered = status ? this.records.filter((record) => record.status === status) : this.records;
    return filtered.slice(-Math.max(1, Math.min(200, Number(limit) || 50))).reverse();
  }

  async create({ runId, tool, input, reason }) {
    if (!runId || !tool) throw new Error("Approval records require a runId and tool.");
    const record = {
      id: crypto.randomUUID(),
      runId: String(runId),
      tool: String(tool),
      input: cloneSafe(input),
      reason: String(reason || "Approval required."),
      status: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };
    this.records.push(record);
    this.#trim();
    await this.#persist();
    return record;
  }

  async decide(id, decision) {
    const record = this.get(id);
    if (!record) throw new Error("Approval request not found.");
    if (record.status !== "pending") throw new Error(`Approval request is already ${record.status}.`);
    if (decision !== "approved" && decision !== "rejected") throw new Error("Decision must be approved or rejected.");
    record.status = decision;
    record.decidedAt = new Date().toISOString();
    await this.#persist();
    return record;
  }

  #trim() {
    if (this.records.length > this.maxRecords) this.records.splice(0, this.records.length - this.maxRecords);
  }

  async #persist() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(this.records, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temp, this.filePath);
  }
}

function cloneSafe(value) {
  if (value === undefined) return null;
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}
