import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { JsonMemory } from "../../src/benchmark/memory.mjs";
import { JsonRunStore } from "../../src/benchmark/run-store.mjs";

test("memory store preserves concurrent writes", async () => {
  const dir = await mkdtemp(join(os.tmpdir(), "jaslyn-memory-concurrency-"));
  try {
    const file = join(dir, "memory.json");
    const first = await new JsonMemory(file).load();
    const second = await new JsonMemory(file).load();
    await Promise.all([
      first.remember({ content: "first concurrent record" }),
      second.remember({ content: "second concurrent record" }),
    ]);
    const persisted = JSON.parse(await readFile(file, "utf8"));
    assert.equal(persisted.length, 2);
    assert.deepEqual(new Set(persisted.map((item) => item.content)), new Set(["first concurrent record", "second concurrent record"]));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("run store preserves concurrent appends", async () => {
  const dir = await mkdtemp(join(os.tmpdir(), "jaslyn-runs-concurrency-"));
  try {
    const file = join(dir, "runs.json");
    const first = await new JsonRunStore(file).load();
    const second = await new JsonRunStore(file).load();
    await Promise.all([
      first.append({ id: "run-a", goal: "A", status: "completed", verified: true }),
      second.append({ id: "run-b", goal: "B", status: "completed", verified: true }),
    ]);
    const persisted = JSON.parse(await readFile(file, "utf8"));
    assert.equal(persisted.length, 2);
    assert.deepEqual(new Set(persisted.map((item) => item.id)), new Set(["run-a", "run-b"]));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
