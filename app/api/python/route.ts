import { NextResponse } from "next/server";
import { z } from "zod";
import { runPythonTool } from "../../../src/bridge/python-runner";

const schema = z.object({
  tool: z.enum(["system_snapshot", "workspace_list", "text_stats", "memory_store", "memory_search", "memory_list", "memory_delete", "detect_language", "create_language", "run_jaslang"]),
  args: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  return NextResponse.json({
    runtime: "python3",
    tools: [
      { name: "system_snapshot", scope: "read-only", description: "Inspect the local Jaslyn runtime." },
      { name: "workspace_list", scope: "read-only", description: "List safe top-level workspace entries." },
      { name: "text_stats", scope: "pure", description: "Count characters, words, and lines." },
      { name: "memory_store", scope: "persistent-write", description: "Store an explicit long-term memory in SQLite." },
      { name: "memory_search", scope: "read-only", description: "Search long-term memories by terms." },
      { name: "memory_list", scope: "read-only", description: "List recent long-term memories." },
      { name: "memory_delete", scope: "persistent-delete", description: "Delete a memory by id." },
      { name: "detect_language", scope: "read-only", description: "Identify a programming or data language from a file or source." },
      { name: "create_language", scope: "workspace-write", description: "Generate an experimental Jaslyn language package." },
      { name: "run_jaslang", scope: "sandboxed-execution", description: "Execute JasLang with line, output, and step limits." },
    ],
  });
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Unknown Python tool request." }, { status: 400 });
    const result = await runPythonTool(parsed.data);
    return NextResponse.json({ ...result, runtime: "python3" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Python worker failed.";
    return NextResponse.json({ ok: false, runtime: "python3", error: message }, { status: 500 });
  }
}
