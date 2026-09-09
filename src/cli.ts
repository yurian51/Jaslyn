import { JaslynAgent } from "./core/agent.js";
import { Executor } from "./core/executor.js";
import { DefaultPolicyEngine } from "./core/policy.js";
import { Planner } from "./core/planner.js";
import { ToolRegistry } from "./core/tool-registry.js";
import { VerificationEngine } from "./core/verification.js";
import { JaslynProvider } from "./intelligence/provider.js";
import { echoTool } from "./tools/echo.js";

const registry = new ToolRegistry();
registry.register(echoTool);

const agent = new JaslynAgent(
  new Planner(new DeterministicProvider()),
  new Executor(registry, new DefaultPolicyEngine()),
  new VerificationEngine()
);

const instruction = process.argv.slice(2).join(" ").trim();

if (!instruction) {
  console.error("Usage: npm run dev -- <your goal>");
  process.exitCode = 2;
} else {
  console.log(JSON.stringify(await agent.run(instruction), null, 2));
}
