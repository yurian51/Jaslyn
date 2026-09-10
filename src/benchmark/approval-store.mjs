import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import crypto from "node:crypto";

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const LOCK_RETRY_MS = 25;

export class JsonApprovalStore {
  constructor(filePath = ".jaslyn/approvals.json", { maxRecords = 500, ttlMs = DEFAULT_TTL_MS, lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS } = {}) {
    this.filePath = filePath;
    this.lockPath = `${filePath}.lock`;
    this.maxRecords = Math.max(20, Number(maxRecords) || 500);
    this.ttlMs = Math.max(30_000, Number(ttlMs) || DEFAULT_TTL_MS);
    this.lockTimeoutMs = Math.max(250, Number(lockTimeoutMs) || DEFAULT_LOCK_TIMEOUT_MS);
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
    return this.#mutate(() => {
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
      return cloneSafe(record);
    });
  }

  async decide(id, decision) {
    if (decision !== "approved" && decision !== "rejected") throw new Error("Decision must be approved or rejected.");
    return this.#mutate(() => {
      const record = this.records.find((candidate) => candidate.id === id);
      if (!record) throw new Error("Approval request not found.");
      if (record.status === "pending" && this.#isExpired(record)) this.#expireRecord(record);
      if (record.status !== "pending") throw new Error(`Approval request is already ${record.status}.`);
      record.status = decision;
      record.decidedAt = new Date().toISOString();
      return cloneSafe(record);
    });
  }

  async claimApproved(id) {
    return this.#mutate(() => {
      const record = this.records.find((candidate) => candidate.id === id);
      if (!record) throw new Error("Approval request not found.");
      if (record.status === "pending" && this.#isExpired(record)) this.#expireRecord(record);
      if (record.status !== "approved") throw new Error(`Approval request is ${record.status}, not approved.`);
      record.status = "consumed";
      record.consumedAt = new Date().toISOString();
      return cloneSafe(record);
    });
  }

  async #expire() {
    let changed = false;
    for (const record of this.records) {
      if (record.status === "pending" && this.#isExpired(record)) {
        this.#expireRecord(record);
        changed = true;
      }
    }
    if (changed) await this.#persist();
  }

  #expireRecord(record) {
    record.status = "expired";
    record.decidedAt = new Date().toISOString();
  }

  #isExpired(record) {
    const expiry = Date.parse(record.expiresAt || record.createdAt || "");
    return Number.isFinite(expiry) && expiry <= Date.now();
  }

  #trim() {
    if (this.records.length > this.maxRecords) this.records.splice(0, this.records.length - this.maxRecords);
  }

  async #mutate(mutator) {
    const release = await this.#acquireLock();
    try {
      await this.#reloadUnderLock();
      await this.#expire();
      const result = await mutator();
      await this.#persist();
      return result;
    } finally {
      await release();
    }
  }

  async #reloadUnderLock() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.records = Array.isArray(parsed) ? parsed.slice(-this.maxRecords) : [];
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this.records = [];
    }
  }

  async #acquireLock() {
    const started = Date.now();
    await mkdir(dirname(this.filePath), { recursive: true });
    while (true) {
      try {
        await mkdir(this.lockPath, { recursive: false });
        return async () => {
          await rm(this.lockPath, { recursive: true, force: true });
        };
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        if (Date.now() - started >= this.lockTimeoutMs) throw new Error("Approval store is busy; retry the approval decision.");
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      }
    }
  }

  async #persist() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(this.records, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temp, this.filePath);
  }
}

function cloneSafe(value) {
  if (value === undefined) return null;
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}
