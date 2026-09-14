import { spawn } from "node:child_process";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_CHARS = 1_000_000;

export function runPythonTool(request, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError("timeoutMs must be a positive integer");
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
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(reject, new Error("Python tool timed out"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_OUTPUT_CHARS) {
        child.kill("SIGKILL");
        finish(reject, new Error("Python tool output exceeded the maximum allowed size"));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > MAX_OUTPUT_CHARS) {
        child.kill("SIGKILL");
        finish(reject, new Error("Python tool error output exceeded the maximum allowed size"));
      }
    });
    child.once("error", (error) => finish(reject, error));
    child.once("close", (code) => {
      if (settled) return;
      if (code !== 0) return finish(reject, new Error(stderr.trim() || `Python worker exited with code ${code}`));
      try {
        const result = JSON.parse(stdout);
        if (!result.ok) return finish(reject, new Error(String(result.error || "Python tool failed")));
        finish(resolve, result);
      } catch {
        finish(reject, new Error("Python worker returned invalid JSON"));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
