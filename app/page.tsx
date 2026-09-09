"use client";
import { FormEvent, useState } from "react";
type Run = { goal:string; status:string; steps:string[]; verification:string };
export default function Home() {
  const [instruction,setInstruction]=useState(""); const [running,setRunning]=useState(false); const [run,setRun]=useState<Run|null>(null);
  async function submit(event:FormEvent){event.preventDefault();if(!instruction.trim()||running)return;setRunning(true);setRun(null);
    try{const response=await fetch("/api/run",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({instruction})});const data=await response.json();if(!response.ok)throw new Error(data.error??"Run failed");setRun(data);}
    catch(error){setRun({goal:instruction,status:"failed",steps:[error instanceof Error?error.message:"Unexpected error"],verification:"Execution did not complete."});}finally{setRunning(false);}
  }
  return <main className="shell"><nav className="nav"><div className="brand"><span className="orb"/>JASLYN</div><div className="nav-status"><i/> CORE ONLINE <span>v0.2</span></div></nav>
    <section className="hero"><div className="eyebrow">JARVIS-CLASS AUTONOMOUS INTELLIGENCE</div><h1>Give Jaslyn a goal.<br/><em>Watch it reason.</em></h1>
    <p className="lead">A secure agent runtime built around planning, tools, verification and memory. This control surface is the first live window into the engine.</p>
    <form className="command" onSubmit={submit}><div className="command-label">NEW AGENT RUN</div><textarea value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="e.g. Analyze this project and prepare a deployment plan..." rows={3}/><button disabled={running||!instruction.trim()}>{running?"JASLYN IS REASONING…":"RUN JASLYN →"}</button></form>
    {run&&<section className="result"><div className="result-head"><div><span className="tiny">RUN RESULT</span><h2>{run.status==="completed"?"Execution verified":"Run needs attention"}</h2></div><span className={run.status==="completed"?"pill good":"pill bad"}>{run.status.toUpperCase()}</span></div><p className="goal">{run.goal}</p><div className="steps">{run.steps.map((step,i)=><div className="step" key={i}><b>{String(i+1).padStart(2,"0")}</b><span>{step}</span></div>)}</div><div className="verification"><span>VERIFICATION</span>{run.verification}</div></section>}</section>
    <section className="grid">{[["01","Agent Runtime","Goal lifecycle from intent to verified outcome."],["02","Tool Registry","Every capability is explicit, typed and controlled."],["03","Policy Layer","Permissions and approvals sit before execution."],["04","Recovery","Failures become observable states, not fake success."]].map(([n,title,text])=><article key={n}><span>{n}</span><h3>{title}</h3><p>{text}</p></article>)}</section>
    <footer><span>JASLYN AI</span><span>Understand · Plan · Execute · Verify · Remember</span><span>BUILDING IN PUBLIC</span></footer></main>;
}
