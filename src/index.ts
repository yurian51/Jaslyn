import { createJaslynBenchmarkRuntime } from "./benchmark/index.mjs";

const instruction = process.argv.slice(2).join(" ").trim() || "Initialize a Jaslyn agent run.";
const runtime = createJaslynBenchmarkRuntime({ maxIterations: 8 });
await runtime.initialize();
const result = await runtime.run(instruction, { providerId: "jaslyn-local" });

console.log(JSON.stringify(result, null, 2));
