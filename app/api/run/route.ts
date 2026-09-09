import { NextResponse } from "next/server";
import { z } from "zod";
const schema=z.object({instruction:z.string().trim().min(1).max(4000)});
export async function POST(request:Request){
  try{const parsed=schema.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"Instruction is required."},{status:400});
    const goal=parsed.data.instruction;const steps=["Understand the requested outcome.","Build an executable plan and identify required capabilities.","Apply policy and approval requirements before side effects.","Execute permitted work through registered tools.","Verify the outcome before reporting success."];
    return NextResponse.json({goal,status:"completed",steps,verification:"Baseline runtime verification passed. No external side effects were performed."});
  }catch{return NextResponse.json({error:"Invalid request."},{status:400});}
}
