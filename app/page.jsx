"use client";
import { useEffect, useMemo, useState } from "react";

const starters = [
  "Analyze my project and identify the highest-risk production issues.",
  "Design a production architecture for an independent autonomous AI agent.",
  "Plan the safest way to deploy this application and verify it."
];

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [running, setRunning] = useState(false);
  const [runtime, setRuntime] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [active, setActive] = useState("Command");
  const [error, setError] = useState("");

  async function refreshRuntime() {
    try { const r = await fetch("/api/runtime", { cache: "no-store" }); const d = await r.json(); setRuntime(d); } catch { setRuntime(null); }
  }
  async function refreshApprovals() {
    try { const r = await fetch("/api/approvals?status=pending&limit=50", { cache: "no-store" }); const d = await r.json(); setApprovals(d.approvals || []); } catch { setApprovals([]); }
  }
  useEffect(() => { refreshRuntime(); refreshApprovals(); const timer = setInterval(() => { refreshRuntime(); refreshApprovals(); }, 10000); return () => clearInterval(timer); }, []);

  async function submit(event) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || running) return;
    setInput(""); setError(""); setMessages((items) => [...items, { role: "user", content: text }]); setRunning(true);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [...messages, { role: "user", content: text }].slice(-20) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Jaslyn brain is unavailable.");
      setMessages((items) => [...items, { role: "jaslyn", content: d.message?.content || "No operational summary returned.", run: d.run }]);
      refreshApprovals(); refreshRuntime();
    } catch (e) { const message = e instanceof Error ? e.message : "Jaslyn is offline."; setError(message); setMessages((items) => [...items, { role: "jaslyn", content: message }]); }
    finally { setRunning(false); }
  }

  async function decideApproval(id, decision) {
    const r = await fetch(`/api/approvals/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Approval operation failed.");
    await refreshApprovals(); await refreshRuntime();
    setMessages((items) => [...items, { role: "jaslyn", content: decision === "approved" ? (d.execution?.ok ? "Approved action executed and recorded as a verified run." : `Approved action failed: ${d.execution?.error || "unknown execution error"}`) : "Action rejected. No external execution was performed." }]);
  }

  const provider = runtime?.providers?.[0];
  const nav = ["Command", "Memory", "Objectives", "Automations", "Tools", "Activity"];
  const metrics = runtime?.metrics || {};

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">✦</div><div><b>JASLYN</b><small>INDEPENDENT AGENT SYSTEM</small></div></div>
      <button className="new-chat" onClick={() => setMessages([])}>＋ New session</button>
      <div className="nav-label">WORKSPACE</div>
      <nav>{nav.map((item) => <button key={item} className={active === item ? "active" : ""} onClick={() => setActive(item)}>{item}</button>)}</nav>
      <div className="sidebar-bottom"><div className="brain-state"><i/> {runtime?.ok ? "Runtime operational" : "Runtime unavailable"}<br/><span>{provider?.id || "self-hosted"}</span></div></div>
    </aside>
    <section className="main">
      <header className="topbar"><div><span>JASLYN / COMMAND CENTER</span><h1>{active}</h1></div><div className="top-actions"><span className="status-pill">{runtime?.runtime?.mode || "self-hosted"}</span><span className="status-pill">{provider?.ok ? "● ONLINE" : "○ OFFLINE"}</span></div></header>
      {active === "Command" ? <>
        <div className="conversation">
          {!messages.length && <div className="welcome"><div className="orb">✦</div><span className="eyebrow">PRIVATE AGENT WORKSPACE / READY</span><h2>What are we solving?</h2><p>Give Jaslyn an outcome. The runtime reasons, uses registered tools, enforces policy, verifies execution, and records the result.</p><div className="suggestions">{starters.map((item) => <button key={item} onClick={() => setInput(item)}>{item}<span>↗</span></button>)}</div></div>}
          {messages.map((message, index) => <article className={`message ${message.role}`} key={`${index}-${message.content.slice(0, 10)}`}><div className="message-avatar">{message.role === "user" ? "Y" : "✦"}</div><div className="message-body"><div className="message-meta">{message.role === "user" ? "You" : "Jaslyn"}<span>{message.role === "user" ? "Command" : "Operational summary"}</span></div><div className="message-text">{message.content}</div>{message.run && <div className="agent-panel"><div className="panel-head"><span>EXECUTION EVIDENCE</span><b>{message.run.status?.toUpperCase()}</b></div><div className="execution-metrics"><span><b>{message.run.execution?.completed || 0}</b> completed</span><span><b>{message.run.execution?.verified || 0}</b> verified</span><span><b>{message.run.execution?.blocked || 0}</b> blocked</span></div><div className="facts"><div><small>INTENT</small><strong>{message.run.intent || "Not reported"}</strong></div><div><small>DECISION</small><strong>{message.run.decision || "Not reported"}</strong></div></div>{message.run.approvals?.map((item) => <div className="approval" key={item.id}><b>Approval required</b><span>{item.reason}</span><button onClick={() => decideApproval(item.id, "approved")}>Approve & execute</button><button className="secondary" onClick={() => decideApproval(item.id, "rejected")}>Reject</button></div>)}</div>}</div></article>)}
          {running && <article className="message jaslyn"><div className="message-avatar">✦</div><div className="message-body"><div className="message-meta">Jaslyn<span>Executing bounded agent loop</span></div><div className="thinking"><i/><i/><i/><span>Understanding objective and checking boundaries…</span></div></div></article>}
        </div>
        <form className="composer" onSubmit={submit}><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder="Give Jaslyn a command…" rows={1}/><button type="submit" disabled={!input.trim() || running}>↑</button></form>
        {error && <div className="disclaimer">{error}</div>}
      </> : <div className="conversation"><div className="workspace-view"><span className="eyebrow">JASLYN / {active.toUpperCase()}</span><h2>{active} center</h2><p>This workspace is backed by the same independent JavaScript runtime. No fake status is generated here.</p><div className="view-grid"><div className="view-card"><small>RUNTIME</small><strong>{runtime?.runtime?.name || "Jaslyn"}</strong><span>{runtime?.runtime?.mode || "self-hosted"}</span></div><div className="view-card"><small>RUNS</small><strong>{metrics.runs ?? 0}</strong><span>{metrics.verifiedRuns ?? 0} verified</span></div><div className="view-card"><small>APPROVALS</small><strong>{metrics.pendingApprovals ?? 0}</strong><span>pending decisions</span></div><div className="view-card"><small>PROVIDER</small><strong>{provider?.id || "not configured"}</strong><span>{provider?.ok ? "healthy" : "unavailable"}</span></div></div>{active === "Automations" && <p>Background scheduling is intentionally exposed only when a durable task runner is configured.</p>}{active === "Tools" && <p>Registered tool execution is policy-gated, timeout-bounded, audited, and verified.</p>}{active === "Memory" && <p>Jaslyn keeps scoped episodic memory in its persistent local store.</p>}{active === "Activity" && <p>Every runtime run records status, outcome, verification, provider, and execution counts.</p>}</div></div>}
    </section>
    <aside className="context-panel"><div className="context-title"><span>RUNTIME INSPECTOR</span><b>{runtime?.ok ? "● OPERATIONAL" : "○ OFFLINE"}</b></div><div className="context-card"><small>INFERENCE</small><strong>{runtime?.runtime?.model || "jaslyn"}</strong><span>{runtime?.runtime?.inferenceConfigured ? "Self-hosted brain configured" : "JASLYN_INFERENCE_URL required"}</span></div><div className="context-card"><small>LIVE METRICS</small><p>Runs · {metrics.runs ?? 0}</p><p>Verified · {metrics.verifiedRuns ?? 0}</p><p>Failed · {metrics.failedRuns ?? 0}</p><p>Pending approvals · {metrics.pendingApprovals ?? 0}</p></div><div className="context-card"><small>PENDING APPROVALS</small>{approvals.length ? approvals.map((item) => <div className="job" key={item.id}><span>{item.tool}</span><button onClick={() => decideApproval(item.id, "approved")}>Approve</button></div>) : <span>No pending actions</span>}</div></aside>
  </main>;
}
