import { spawn } from "node:child_process";
import path from "node:path";

type PythonRequest = { tool: "system_snapshot" | "workspace_list" | "text_stats" | "memory_store" | "memory_search" | "memory_list" | "memory_delete" | "api_key_create" | "api_key_list" | "api_key_revoke" | "api_key_verify" | "detect_language" | "create_language"; args?: Record<string, unknown> };
type PythonResponse = { ok: boolean; [key: string]: unknown };

export function runPythonTool(request: PythonRequest): Promise<PythonResponse> {
  return new Promise((resolve, reject) => {
    const worker = path.join(process.cwd(), "python", "jaslyn_tools.py");
    const child = spawn(process.env.PYTHON_BIN || "python3", [worker], {
      cwd: process.cwd(),
      env: { ...process.env, JASLYN_WORKSPACE: process.cwd() },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `Python worker exited with code ${code}`));
      try {
        const result = JSON.parse(stdout) as PythonResponse;
        if (!result.ok) return reject(new Error(String(result.error || "Python tool failed")));
        resolve(result);
      } catch {
        reject(new Error("Python worker returned invalid JSON"));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
