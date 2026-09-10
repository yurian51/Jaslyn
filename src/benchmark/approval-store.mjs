import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export class JsonApprovalStore {
  constructor(filePath = ".jaslyn/approvals.json", { maxRecords = 500, ttlMs = DEFAULT_TTL_MS } = {}) {
    this.filePath = filePath;
    this.maxRecords = Math.max(20, Number(maxRecords) || 500);
    this.ttlMs = Math.max(30_000, Number(ttlMs) || DEFAULT_TTL_MS);
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
    await this.#expire();
    return this;
  }

  get(id) {
    const record = this.records.find((candidate) => candidate.id === id) || null;
    if (record && record.status === "pending" && this.#isExpired(record)) return { ...record, status: "expired" };
    return record;
  }

  list({ status, limit = 50 } = {}) {
    const filtered = this.records.filter((record) => {
      if (record.status === "pending" && this.#isExpired(record)) return status === "expired";
      return !status || record.status === status;
    });
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
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
      decidedAt: null,
      consumedAt: null,
    };
    this.records.push(record);
    this.#trim();
    await this.#persist();
    return record;
  }

  async decide(id, decision) {
    await this.#expire();
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record) throw new Error("Approval request not found.");
    if (record.status !== "pending") throw new Error(`Approval request is already ${record.status}.`);
    if (decision !== "approved" && decision !== "rejected") throw new Error("Decision must be approved or rejected.");
    record.status = decision;
    record.decidedAt = new Date().toISOString();
    await this.#persist();
    return record;
  }

  async claimApproved(id) {
    await this.#expire();
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record) throw new Error("Approval request not found.");
    if (record.status !== "approved") throw new Error(`Approval request is ${record.status}, not approved.`);
    record.status = "consumed";
    record.consumedAt = new Date().toISOString();
    await this.#persist();
    return cloneSafe(record);
  }

  async #expire() {
    let changed = false;
    for (const record of this.records) {
      if (record.status === "pending" && this.#isExpired(record)) {
        record.status = "expired";
        record.decidedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) await this.#persist();
  }

  #isExpired(record) {
    const expiry = Date.parse(record.expiresAt || record.createdAt || "");
    return Number.isFinite(expiry) && expiry <= Date.now();
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
