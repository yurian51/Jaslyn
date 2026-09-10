import { createJaslynBenchmarkRuntime } from "../src/benchmark/index.mjs";

try {
  const runtime = await createJaslynBenchmarkRuntime().initialize();
  const health = await runtime.health();
  console.log(JSON.stringify({ ok: health.every((item) => item.ok), providers: health }, null, 2));
  if (!health.every((item) => item.ok)) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
