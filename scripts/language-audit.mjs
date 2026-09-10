import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const ignored = new Set(["node_modules", ".git", ".next"]);
const forbidden = /(^|\/)([^/]+\.(?:ts|tsx|d\.ts))$|(^|\/)tsconfig\.json$/i;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

const violations = (await walk(root))
  .map((file) => relative(root, file).replaceAll("\\", "/"))
  .filter((file) => forbidden.test(file));

if (violations.length) {
  console.error("JavaScript boundary audit failed. Forbidden TypeScript files found:");
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}

console.log("JavaScript boundary audit passed: no .ts, .tsx, .d.ts, or tsconfig.json files found.");
