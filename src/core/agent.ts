import type { AgentGoal, ToolContext } from "../types.js";
import { Planner } from "./planner.js";
import { Executor } from "./executor.js";
import { VerificationEngine } from "./verification.js";
import { DecisionEngine, IntentEngine, MindSelfCheck, ObjectiveEngine } from "../mind/index.js";
import { MemoryStore, ContextEngine } from "../memory/index.js";
import { OutcomeVerifier } from "../verification/index.js";
import { GovernancePolicy, AuditLog } from "../governance/index.js";

export class JaslynAgent {
  private readonly intent=new IntentEngine();
  private readonly objectives=new ObjectiveEngine();
  private readonly decisions=new DecisionEngine();
  private readonly selfCheck=new MindSelfCheck();
  private readonly memory=new MemoryStore();
  private readonly contextEngine=new ContextEngine();
  private readonly outcomeVerifier=new OutcomeVerifier();
  private readonly governance=new GovernancePolicy();
  private readonly audit=new AuditLog();

  constructor(private readonly planner:Planner,private readonly executor:Executor,private readonly verifier:VerificationEngine){}

  async run(instruction:string){
    const goal:AgentGoal={id:crypto.randomUUID(),instruction:instruction.trim(),createdAt:new Date().toISOString()};
    const mindGoal=this.intent.normalize(instruction);
    const memories=this.memory.search(instruction);
    const context=this.contextEngine.build(instruction,memories);
    const mindObjectives=this.objectives.derive(mindGoal);
    const decision=this.decisions.decide({goal:mindGoal,objectives:mindObjectives,constraints:[],facts:{memoryCount:memories.length}});
    const check=this.selfCheck.inspect({goal:mindGoal,objectives:mindObjectives,constraints:[],facts:{memoryCount:memories.length}},decision);
    if(!check.valid) throw new Error(`Mind self-check failed: ${check.issues.join("; ")}`);
    const plan=await this.planner.create(goal);
    const policy=this.governance.evaluate(instruction,decision.requiresApproval?"reversible":"none");
    if(!policy.allowed) return {goal,mind:{objectives:mindObjectives,decision,selfCheck:check},context,plan,results:[],verification:{verified:false,reason:policy.reason},audit:this.audit.append({actor:"jaslyn",action:instruction,result:"blocked"})};
    const toolContext:ToolContext={runId:crypto.randomUUID(),agentId:"jaslyn-core"};
    const results=policy.requiresApproval?[]:await this.executor.execute(plan,toolContext);
    const verification=policy.requiresApproval?{verified:false,reason:"Approval required before external side effects.",evidence:[]}:this.verifier.verify(plan,results);
    const outcome=this.outcomeVerifier.verify(instruction,results);
    const success=verification.verified&&outcome.verified;
    this.memory.put({kind:"episodic",key:`run:${goal.id}`,value:{instruction,status:success?"completed":"unverified"},confidence:1});
    return {goal,mind:{objectives:mindObjectives,decision,selfCheck:check},context,plan,results,verification,outcome,audit:this.audit.append({actor:"jaslyn",action:instruction,result:success?"verified":"unverified"})};
  }
}