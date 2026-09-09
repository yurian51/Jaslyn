import { spawn } from "node:child_process";
import path from "node:path";

const TOOL_TIMEOUT_MS = Number(process.env.JASLYN_PYTHON_TIMEOUT_MS || 30000);

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
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(reject, new Error(`Python worker timed out after ${TOOL_TIMEOUT_MS}ms`));
    }, TOOL_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });

    child.once("error", error => finish(reject, error));
    child.once("close", code => {
      if (code !== 0) {
        finish(reject, new Error(stderr.trim() || `Python worker exited with code ${code}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (!result.ok) {
          finish(reject, new Error(String(result.error || "Python tool failed")));
          return;
        }
        finish(resolve, result);
      } catch {
        finish(reject, new Error("Python worker returned invalid JSON"));
      }
    });

    child.stdin.end(JSON.stringify(request));
  });
}
