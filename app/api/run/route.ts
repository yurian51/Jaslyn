import { NextResponse } from "next/server";
import { z } from "zod";
import { JaslynProvider } from "../../../src/intelligence/provider";

const schema=z.object({instruction:z.string().trim().min(1).max(4000),context:z.record(z.string(),z.unknown()).optional()});

export async function POST(request:Request){
  try{
    const parsed=schema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Instruction is required."},{status:400});
    const provider=new JaslynProvider();
    const reasoning=await provider.reason({instruction:parsed.data.instruction,context:parsed.data.context??{}});
    return NextResponse.json({
      status: reasoning.needsApproval ? "approval_required" : "planned",
      goal: parsed.data.instruction,
      reasoning: reasoning.summary,
      intent: reasoning.intent,
      decision: reasoning.decision,
      needsApproval: reasoning.needsApproval,
      approvalReason: reasoning.approvalReason,
      steps: reasoning.proposedSteps,
      provider: provider.name,
      model: process.env.JASLYN_MODEL || "configured-model"
    });
  }catch(error){
    const message=error instanceof Error?error.message:"Jaslyn could not complete the reasoning request.";
    return NextResponse.json({status:"error",error:message},{status:503});
  }
}
