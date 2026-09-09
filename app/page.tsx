"use client";
import { FormEvent, useState } from "react";

type Run={goal:string;status:string;reasoning:string;intent:string;decision:string;needsApproval:boolean;approvalReason:string;steps:string[];error?:string};

export default function Home(){
 const [instruction,setInstruction]=useState(""); const [running,setRunning]=useState(false); const [run,setRun]=useState<Run|null>(null);
 async function submit(e:FormEvent){e.preventDefault();if(!instruction.trim()||running)return;setRunning(true);setRun(null);
  try{const r=await fetch("/api/run",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({instruction})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Jaslyn request failed");setRun(d);}
  catch(e){setRun({goal:instruction,status:"error",reasoning:"",intent:"",decision:"",needsApproval:false,approvalReason:"",steps:[],error:e instanceof Error?e.message:"Unknown error"});}
  finally{setRunning(false);}
 }
 return <main className="app">
  <aside className="sidebar">
   <div className="logo"><span className="logo-mark">J</span><div><strong>JASLYN</strong><small>INTELLIGENCE SYSTEM</small></div></div>
   <div className="side-group"><span>WORKSPACE</span><button className="side-active">◈ Command Center</button><button>◎ Objectives</button><button>◌ Memory</button><button>◇ Automations</button></div>
   <div className="side-group"><span>SYSTEM</span><button>▣ Tools</button><button>⌁ Activity</button><button>⚙ Settings</button></div>
   <div className="side-bottom"><div className="online-dot"/> Core online<div className="version">Jaslyn v0.3</div></div>
  </aside>
  <section className="workspace">
   <header className="topbar"><div><span className="crumb">COMMAND CENTER</span><h1>What should Jaslyn handle?</h1></div><div className="status"><i/> AI CORE <b>READY</b></div></header>
   <div className="content">
    <section className="composer">
      <div className="composer-top"><span>NEW OBJECTIVE</span><em>PRIVATE SESSION</em></div>
      <textarea value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="Describe an outcome, problem, project, or task. Jaslyn will understand it, reason about it, and show you the decision before acting." rows={5}/>
      <div className="composer-bottom"><span>Jaslyn decides when approval is required.</span><button onClick={submit} disabled={running||!instruction.trim()}>{running?"THINKING…":"RUN JASLYN  ↗"}</button></div>
    </section>
    {run ? <section className="run-card">
      {run.error ? <div className="error"><strong>AI CORE UNAVAILABLE</strong><p>{run.error}</p><small>No fake result was generated. Configure the model provider and retry.</small></div> :
      <>
       <div className="run-head"><div><span className="label">LIVE REASONING</span><h2>{run.status==="approval_required"?"Approval required":"Objective understood"}</h2></div><span className={run.needsApproval?"badge warn":"badge"}>{run.needsApproval?"APPROVAL":"READY"}</span></div>
       <div className="objective"><span>OBJECTIVE</span><p>{run.goal}</p></div>
       <div className="decision-grid"><div><span>INTENT</span><p>{run.intent||"Not explicitly classified."}</p></div><div><span>DECISION</span><p>{run.decision||"No decision returned."}</p></div></div>
       <div className="reasoning"><span>JASLYN REASONING</span><p>{run.reasoning}</p></div>
       <div className="timeline"><span>EXECUTION PLAN</span>{run.steps.map((s,i)=><div className="timeline-row" key={i}><b>{String(i+1).padStart(2,"0")}</b><i/><p>{s}</p></div>)}</div>
       {run.needsApproval&&<div className="approval"><strong>APPROVAL REQUIRED</strong><p>{run.approvalReason}</p><button>REVIEW & APPROVE</button></div>}
       <div className="truth"><i/> <span><b>TRUTH STATUS</b> This run shows model reasoning and planning. No external action is claimed until a real tool executes and verification produces evidence.</span></div>
      </>}
    </section>:
    <section className="empty"><div className="pulse">J</div><h2>Jaslyn is waiting for an objective.</h2><p>Give it something real. A project to analyze, a workflow to design, a decision to make, or work to execute.</p><div className="examples"><button onClick={()=>setInstruction("Analyze my project architecture and identify the three highest-risk production issues.")}>Analyze a project</button><button onClick={()=>setInstruction("Design a production deployment plan for this application.")}>Plan a deployment</button><button onClick={()=>setInstruction("Review this system and propose the safest next engineering action.")}>Review a system</button></div></section>}
    <section className="capabilities"><article><b>01</b><strong>UNDERSTAND</strong><p>Intent and context, not keyword matching.</p></article><article><b>02</b><strong>DECIDE</strong><p>Clear decisions, risks and approval boundaries.</p></article><article><b>03</b><strong>ACT</strong><p>Tools become real only when registered and authorized.</p></article><article><b>04</b><strong>VERIFY</strong><p>Evidence before Jaslyn claims completion.</p></article></section>
   </div>
  </section>
 </main>
}
