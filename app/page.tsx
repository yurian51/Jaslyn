"use client";
import { FormEvent, useEffect, useRef, useState } from "react";

type Run={goal:string;status:string;reasoning:string;intent:string;decision:string;needsApproval:boolean;approvalReason:string;steps:string[];error?:string};
type Message={role:"user"|"jaslyn";content:string;run?:Run};

const starterPrompts=[
  "Analyze my project and tell me the highest-risk production issues.",
  "Design a production architecture for an autonomous AI agent.",
  "Plan the safest way to deploy this application and verify it."
];

export default function Home(){
 const [input,setInput]=useState("");
 const [messages,setMessages]=useState<Message[]>([]);
 const [running,setRunning]=useState(false);
 const [active,setActive]=useState("Command");
 const endRef=useRef<HTMLDivElement>(null);
 useEffect(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),[messages,running]);

 async function submit(e?:FormEvent){
  e?.preventDefault(); const text=input.trim(); if(!text||running)return;
  setInput(""); setMessages(m=>[...m,{role:"user",content:text}]); setRunning(true);
  try{
   const r=await fetch("/api/run",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({instruction:text,context:{conversation:messages.slice(-8)}})});
   const d=await r.json();
   if(!r.ok) throw new Error(d.error||"Jaslyn brain is unavailable.");
   setMessages(m=>[...m,{role:"jaslyn",content:d.reasoning,run:d}]);
  }catch(error){
   setMessages(m=>[...m,{role:"jaslyn",content:"My private reasoning core is currently offline.",run:{goal:text,status:"brain_offline",reasoning:"",intent:"",decision:"",needsApproval:false,approvalReason:"",steps:[],error:error instanceof Error?error.message:"Unknown error"}}]);
  }finally{setRunning(false);}
 }
 return <main className="shell">
  <aside className="sidebar">
   <div className="brand"><div className="brand-mark">J</div><div><b>JASLYN</b><small>PRIVATE INTELLIGENCE</small></div></div>
   <button className="new-chat" onClick={()=>setMessages([])}>＋ New session</button>
   <nav>
    {["Command","Memory","Objectives","Automations","Tools","Activity"].map(item=><button key={item} className={active===item?"active":""} onClick={()=>setActive(item)}><span>{item==="Command"?"⌘":item==="Memory"?"◌":item==="Objectives"?"◇":item==="Automations"?"◷":item==="Tools"?"⊞":"◍"}</span>{item}</button>)}
   </nav>
   <div className="sidebar-bottom"><div className="brain-state"><i/>Private brain<br/><span>Self-hosted inference</span></div><div className="user-card"><div className="avatar">Y</div><div><b>Yurian</b><small>Owner</small></div><span>•••</span></div></div>
  </aside>
  <section className="main">
   <header className="topbar"><div><span>COMMAND CENTER</span><h1>{active}</h1></div><div className="top-actions"><button>⌘ K</button><button>◌</button><button>⚙</button></div></header>
   <div className="conversation">
    {messages.length===0?<div className="welcome">
      <div className="orb"><span>J</span></div>
      <span className="eyebrow">JASLYN / PRIVATE AI</span>
      <h2>What are we solving?</h2>
      <p>Give Jaslyn an outcome. It will understand the request, reason about the constraints, build a plan, and only take action when the runtime has an authorized tool.</p>
      <div className="suggestions">{starterPrompts.map(p=><button key={p} onClick={()=>setInput(p)}>{p}<span>↗</span></button>)}</div>
    </div>:<>{messages.map((m,i)=><article className={`message ${m.role}`} key={i}>
      <div className="message-avatar">{m.role==="user"?"Y":"J"}</div><div className="message-body"><div className="message-meta">{m.role==="user"?"You":"Jaslyn"} <span>{m.role==="jaslyn"?"Private reasoning":"Just now"}</span></div><div className="message-text">{m.content}</div>
      {m.run&&m.run.status!=="brain_offline"&&<div className="agent-panel">
       <div className="panel-head"><span>REASONING TRACE</span><b>{m.run.needsApproval?"APPROVAL REQUIRED":"PLAN READY"}</b></div>
       <div className="facts"><div><small>INTENT</small><strong>{m.run.intent||"—"}</strong></div><div><small>DECISION</small><strong>{m.run.decision||"—"}</strong></div></div>
       <div className="steps"><small>EXECUTION PLAN</small>{m.run.steps.map((s,n)=><div className="step" key={n}><b>{String(n+1).padStart(2,"0")}</b><span>{s}</span></div>)}</div>
       {m.run.needsApproval&&<div className="approval"><b>Approval required</b><span>{m.run.approvalReason}</span><button>Review action</button></div>}
      </div>}
      {m.run?.error&&<div className="offline"><b>PRIVATE BRAIN OFFLINE</b><span>{m.run.error}</span></div>}
      </div>
    </article>)}</>}
    {running&&<article className="message jaslyn"><div className="message-avatar">J</div><div className="message-body"><div className="message-meta">Jaslyn <span>Reasoning</span></div><div className="thinking"><i/><i/><i/><span>Understanding objective…</span></div></div></article>}
    <div ref={endRef}/>
   </div>
   <form className="composer" onSubmit={submit}><button type="button" className="attach">＋</button><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit();}}} placeholder="Message Jaslyn…" rows={1}/><div className="composer-tools"><span>Private session</span><button type="submit" disabled={!input.trim()||running}>↑</button></div></form>
   <div className="disclaimer">Jaslyn can reason and plan, but it never invents completed actions. External actions require registered tools, policy checks and verification.</div>
  </section>
  <aside className="context-panel"><div className="context-title"><span>SESSION</span><b>PRIVATE</b></div><div className="context-card"><small>AGENT</small><strong>Jaslyn</strong><span>Autonomous intelligence</span></div><div className="context-card"><small>RUNTIME</small><div className="metric"><i/> Waiting for objective</div></div><div className="context-section"><small>CAPABILITIES</small><p>Reasoning</p><p>Planning</p><p>Memory</p><p>Tools</p><p>Verification</p></div><div className="context-section"><small>GOVERNANCE</small><p>Private by default</p><p>Approval boundaries</p><p>Audit trail</p></div></aside>
 </main>
}