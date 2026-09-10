import { spawn } from "node:child_process";
import path from "node:path";

export function runPythonTool(request) {
  return new Promise((resolve, reject) => {
    const worker = path.join(process.cwd(), "python", "jaslyn_tools.py");
    const child = spawn(process.env.PYTHON_BIN || "python3", [worker], {
      cwd: process.cwd(),
      env: { ...process.env, JASLYN_WORKSPACE: process.cwd() },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `Python worker exited with code ${code}`));
      try {
        const result = JSON.parse(stdout);
        if (!result.ok) return reject(new Error(String(result.error || "Python tool failed")));
        resolve(result);
      } catch {
        reject(new Error("Python worker returned invalid JSON"));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
