import { JaslynAgent } from "./core/agent.js";
import { Executor } from "./core/executor.js";
import { InMemoryStore } from "./core/memory.js";
import { DefaultPolicyEngine } from "./core/policy.js";
import { Planner } from "./core/planner.js";
import { ToolRegistry } from "./core/tool-registry.js";
import { VerificationEngine } from "./core/verification.js";
import { JaslynProvider } from "./intelligence/provider.js";

const memory = new InMemoryStore();
const tools = new ToolRegistry();
const policy = new DefaultPolicyEngine();
const provider = new JaslynProvider();
const planner = new Planner(provider);
const executor = new Executor(tools, policy);
const verifier = new VerificationEngine();
const agent = new JaslynAgent(planner, executor, verifier);

const instruction = process.argv.slice(2).join(" ").trim() || "Initialize a Jaslyn agent run.";
const result = await agent.run(instruction);
await memory.put({
  id: result.goal.id,
  namespace: "runs",
  content: result.verification.details,
  metadata: { success: result.verification.success },
  createdAt: new Date().toISOString()
});

console.log(JSON.stringify(result, null, 2));
