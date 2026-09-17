"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./net.module.css";

const nav = [
  ["overview", "Command Center", "⌂"],
  ["customers", "Subscribers", "◉"],
  ["plans", "Plans & Packages", "◇"],
  ["vouchers", "Vouchers", "▣"],
  ["payments", "Payments", "¤"],
  ["subscriptions", "Subscriptions", "↻"],
  ["hotspot", "Hotspot / Captive Portal", "◌"],
  ["network", "Network Control", "⌁"],
  ["devices", "Devices & Routers", "▱"],
  ["aaa", "RADIUS / AAA", "⌾"],
  ["qos", "Bandwidth & QoS", "≋"],
  ["sessions", "Sessions & Accounting", "◍"],
  ["monitoring", "Incidents & Monitoring", "◈"],
  ["reports", "Reports & Analytics", "▤"],
  ["sites", "Locations", "⌘"],
];

const commandHints = ["Show offline routers", "Show active sessions", "Show payments today", "Show network incidents", "Show expired subscriptions", "Show high bandwidth users"];

function WifiMark() {
  return <svg viewBox="0 0 64 48" aria-hidden="true" className={styles.wifiMark}><path d="M5 17C20 3 44 3 59 17"/><path d="M14 27c10-9 26-9 36 0"/><path d="M23 36c5-5 13-5 18 0"/><circle cx="32" cy="43" r="3"/></svg>;
}

const money = (minor, currency = "TZS") => `${currency} ${(Number(minor || 0) / 100).toLocaleString()}`;
const bytes = (value) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};

export default function CommandCenter() {
  const [active, setActive] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [health, setHealth] = useState(null);
  const [command, setCommand] = useState("");
  const [commandResult, setCommandResult] = useState(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [snapshotResponse, healthResponse] = await Promise.all([
        fetch("/api/net/command-center", { cache: "no-store" }),
        fetch("/api/net/health", { cache: "no-store" }),
      ]);
      const data = await snapshotResponse.json();
      const healthData = healthResponse.ok ? await healthResponse.json() : null;
      setSnapshot(data);
      setHealth(healthData);
      setError(data.ok ? "" : data.error || "Network data source is unavailable.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Command center data source failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); const timer = setInterval(refresh, 15000); return () => clearInterval(timer); }, [refresh]);

  async function runCommand(event) {
    event?.preventDefault();
    const text = command.trim();
    if (!text) return;
    setCommandResult({ pending: true, command: text });
    try {
      const response = await fetch("/api/net/command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: text }) });
      const result = await response.json();
      setCommandResult(result);
    } catch (e) {
      setCommandResult({ ok: false, command: text, error: e instanceof Error ? e.message : "Command failed" });
    }
  }

  const activeLabel = useMemo(() => nav.find(([id]) => id === active)?.[1] || "Command Center", [active]);
  const metrics = snapshot?.metrics;
  const networkOnline = Boolean(health?.network?.ok);
  const dbOnline = Boolean(health?.database?.ok);
  const systemState = networkOnline || dbOnline ? "OPERATIONAL SOURCES" : "SOURCES PENDING";

  function select(id) { setActive(id); setMenuOpen(false); }

  return <main className={styles.shell}>
    <aside className={`${styles.sidebar} ${menuOpen ? styles.open : ""}`}>
      <div className={styles.brand}><div className={styles.brandIcon}><WifiMark/></div><div className={styles.brandText}><strong>JASLYN <span>NET</span></strong><small>CONNECTIVITY OPERATING SYSTEM</small></div></div>
      <div className={styles.connectionBadge}><i style={{ background: networkOnline ? undefined : "#d9a63b" }}/><span>{systemState}</span></div>
      <nav className={styles.nav} aria-label="Jaslyn Net navigation">{nav.map(([id,label,icon]) => <button key={id} className={active === id ? styles.navActive : ""} onClick={() => select(id)}><span className={styles.navIcon}>{icon}</span><span>{label}</span>{active === id && <b/>}</button>)}</nav>
      <div className={styles.sidebarFooter}><div className={styles.miniLogo}><WifiMark/><span>JASLYN <b>NET</b></span></div><small>NETWORK • SERVICE • PAYMENT • BUSINESS STATE</small></div>
    </aside>
    {menuOpen && <button className={styles.scrim} aria-label="Close navigation" onClick={() => setMenuOpen(false)}/>} 
    <section className={styles.main}>
      <header className={styles.topbar}>
        <button className={styles.mobileMenu} onClick={() => setMenuOpen(true)} aria-label="Open navigation">☰</button>
        <form className={styles.search} onSubmit={runCommand}><span>⌕</span><input value={command} onChange={(e) => setCommand(e.target.value)} onFocus={() => setCommandOpen(true)} placeholder="Run a structured command…"/><kbd>Ctrl K</kbd></form>
        <div className={styles.topRight}><button className={styles.siteSelect}>⌂ <span>All Sites</span> ▾</button><button className={styles.iconButton} onClick={refresh} title="Refresh">↻</button><div className={styles.profile}><span className={styles.avatar}>Y</span><div><b>Operator</b><small>{new Date().toLocaleDateString([], {day:"2-digit",month:"short",year:"numeric"})}</small></div></div><div className={styles.clock}><b>{new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})}</b><span><i/> {systemState}</span></div></div>
      </header>
      {commandOpen && <div style={{ position:"absolute", top:72, left:24, width:"min(510px,44vw)", zIndex:30, border:"1px solid #214666", background:"#071321", borderRadius:9, padding:8, boxShadow:"0 18px 50px #0008" }}>{commandHints.map((hint) => <button key={hint} onMouseDown={() => { setCommand(hint); setCommandOpen(false); }} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 10px",border:0,borderRadius:6,background:"transparent",color:"#9bb5c8",fontSize:9,cursor:"pointer"}}>{hint}</button>)}</div>}
      <div className={styles.content}>
        <section className={styles.hero}><div><span className={styles.eyebrow}>JASLYN NET / NETWORK OPERATIONS</span><h1>{activeLabel}<span>.</span></h1><p>Technical state, subscriber state and business state in one operational surface. Values below are sourced from the configured system, never invented for the sake of a prettier screenshot.</p></div><div className={styles.heroActions}><button className={styles.primary} onClick={() => select("customers")}>Subscribers</button><button className={styles.secondary} onClick={() => select("vouchers")}>Vouchers</button><button className={styles.command} onClick={() => { setCommand("Show network incidents"); setCommandOpen(false); }}>⌁ Run Command</button></div></section>

        {error && <div style={{margin:"10px 0",padding:"10px 12px",border:"1px solid #6b3b31",background:"#21130f",color:"#d8a08f",borderRadius:8,fontSize:8}}>SOURCE STATUS: {error}</div>}

        <section className={styles.kpiGrid} aria-label="Connectivity KPIs">
          {[["CUSTOMERS", metrics?.customers ?? "—","database"],["ACTIVE SESSIONS",metrics?.activeSessions ?? "—","AAA/accounting"],["SETTLED REVENUE",metrics ? money(metrics.settledRevenueMinor) : "—","verified payments"],["ONLINE DEVICES",metrics?.onlineDevices ?? "—","device state"],["DATA USAGE",metrics ? bytes(metrics.totalUsageBytes) : "—","session accounting"],["OPEN INCIDENTS",metrics?.openIncidents ?? "—","incident store"]].map(([label,value,source],i) => <article className={`${styles.kpi} ${[styles.cyan,styles.violet,styles.gold,styles.green,styles.blue,styles.mint][i]}`} key={label}><div className={styles.kpiTop}><span>{label}</span><span className={styles.spark}/></div><strong>{loading ? "…" : value}</strong><small>{source}</small></article>)}
        </section>

        <section className={styles.dashboardGrid}>
          <article className={`${styles.card} ${styles.topologyCard}`}><div className={styles.cardHead}><div><span className={styles.cardEyebrow}>CONNECTIVITY GRAPH</span><h2>Operational Topology</h2></div><div className={styles.tabs}><button className={styles.tabActive}>State</button><button onClick={() => select("devices")}>Devices</button><button onClick={() => select("sites")}>Sites</button></div></div><div className={styles.topology}><div className={`${styles.node} ${styles.internet}`}><b>Internet</b><span>{networkOnline ? "UPSTREAM VERIFIED" : "TELEMETRY REQUIRED"}</span></div><div className={`${styles.node} ${styles.router}`}><WifiMark/><b>Network</b><span>{metrics ? `${metrics.onlineDevices} ONLINE / ${metrics.offlineDevices} OFFLINE` : "NO DEVICE STATE"}</span></div><div className={`${styles.node} ${styles.siteA}`}><i/><b>Subscribers</b><span>{metrics ? `${metrics.activeSubscriptions} ACTIVE SERVICES` : "NO SERVICE STATE"}</span></div><div className={`${styles.node} ${styles.siteB}`}><i/><b>Incidents</b><span>{metrics ? `${metrics.openIncidents} OPEN` : "NO INCIDENT STATE"}</span></div><div className={`${styles.node} ${styles.client}`}><i/><b>Sessions</b><span>{metrics ? `${metrics.activeSessions} ACTIVE` : "NO SESSION STATE"}</span></div><div className={styles.topologyHint}><i/> Graph edges are persisted separately from observed device state. A connected production deployment can resolve infrastructure → service → subscriber impact without inventing topology.</div></div></article>

          <article className={`${styles.card} ${styles.trafficCard}`}><div className={styles.cardHead}><div><span className={styles.cardEyebrow}>DATA PLANE</span><h2>Traffic & Usage</h2></div><button className={styles.textButton} onClick={() => select("sessions")}>Session Explorer →</button></div><div className={styles.emptyChart}><div className={styles.chartMessage}><b>{metrics ? bytes(metrics.totalUsageBytes) : "Awaiting telemetry"}</b><small>Aggregated session octets currently available to Jaslyn. Per-interface throughput requires a verified telemetry collector.</small></div></div><div className={styles.legend}><span><i className={styles.cyanDot}/> Download</span><span><i className={styles.violetDot}/> Upload</span><span><i className={styles.greenDot}/> Sessions</span></div></article>

          <article className={`${styles.card} ${styles.statusCard}`}><div className={styles.cardHead}><div><span className={styles.cardEyebrow}>SYSTEM EVIDENCE</span><h2>Source Status</h2></div><span className={styles.livePill}><i/> LIVE</span></div>{[["Database",dbOnline ? "Connected" : "Not configured"],["MikroTik",networkOnline ? "Connected" : "Not configured"],["RADIUS / AAA","Adapter boundary"],["Payments","Provider boundary"],["Telemetry","Collector boundary"],["Graph","Persisted model"]].map(([name,state]) => <div className={styles.statusRow} key={name}><span><i/>{name}</span><b>{state}</b></div>)}</article>

          <article className={`${styles.card} ${styles.tableCard}`}><div className={styles.cardHead}><div><span className={styles.cardEyebrow}>BUSINESS EVENTS</span><h2>Recent Payments</h2></div><button className={styles.textButton} onClick={() => select("payments")}>View all →</button></div>{snapshot?.payments?.length ? <div className={styles.emptyTable}><div className={styles.tableHeader}><span>CUSTOMER</span><span>AMOUNT</span><span>METHOD</span><span>STATE</span><span>TIME</span></div>{snapshot.payments.map((p) => <div key={p.id} className={styles.tableHeader} style={{color:"#8ba6ba",letterSpacing:0,fontSize:7}}><span>{p.customer_name || "—"}</span><span>{money(p.amount_minor,p.currency)}</span><span>{p.provider}</span><span>{p.status}</span><span>{p.received_at ? new Date(p.received_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "—"}</span></div>)}</div> : <div className={styles.tableEmpty}><span>¤</span><b>No payment records available</b><small>Verified transactions will appear here when the billing database is populated.</small></div>}</article>

          <article className={`${styles.card} ${styles.tableCard}`}><div className={styles.cardHead}><div><span className={styles.cardEyebrow}>IDENTITY + AAA</span><h2>Active Sessions</h2></div><button className={styles.textButton} onClick={() => select("sessions")}>View all →</button></div>{snapshot?.sessions?.length ? <div className={styles.emptyTable}><div className={styles.tableHeader}><span>USER</span><span>IP</span><span>NAS</span><span>STATE</span><span>USAGE</span></div>{snapshot.sessions.slice(0,6).map((s) => <div key={s.id} className={styles.tableHeader} style={{color:"#8ba6ba",letterSpacing:0,fontSize:7}}><span>{s.customer_name || s.username || "—"}</span><span>{s.ip_address || "—"}</span><span>{s.nas_identifier}</span><span>{s.state}</span><span>{bytes(Number(s.input_octets||0)+Number(s.output_octets||0))}</span></div>)}</div> : <div className={styles.tableEmpty}><span>◍</span><b>No active sessions available</b><small>Connect RADIUS/accounting or a network provider before claiming live session state.</small></div>}</article>

          <article className={`${styles.card} ${styles.actionsCard}`}><div className={styles.cardHead}><div><span className={styles.cardEyebrow}>ATTENTION QUEUE</span><h2>Incidents & Events</h2></div><button className={styles.textButton} onClick={() => { setCommand("Show network incidents"); runCommand(); }}>Run query →</button></div>{snapshot?.incidents?.length ? snapshot.incidents.map((i) => <button key={i.id} onClick={() => select("monitoring")} style={{display:"flex",width:"calc(100% - 24px)",margin:"7px 12px 0",padding:"9px",border:"1px solid #203b52",background:"#071522",color:"#9db6c8",borderRadius:7,textAlign:"left",cursor:"pointer",justifyContent:"space-between",gap:8}}><span><b style={{display:"block",fontSize:8,color:i.severity === "CRITICAL" ? "#ef7284" : "#d8b45b"}}>{i.severity} · {i.title}</b><small style={{fontSize:7,color:"#59748a"}}>{i.category} · {i.impact_count} impacted records</small></span><span style={{fontSize:7}}>{i.status}</span></button>) : <p className={styles.actionNote}>No open incidents were returned by the database. This is an observed empty state, not a claim that the physical network has no failures.</p>}<div className={styles.actionGrid}><button onClick={refresh}><span>↻</span>Refresh sources</button><button onClick={() => select("devices")}><span>⌁</span>Inspect devices</button><button onClick={() => select("sessions")}><span>◍</span>Inspect sessions</button><button onClick={() => select("payments")}><span>¤</span>Inspect payments</button></div></article>
        </section>

        {commandResult && <section className={styles.card} style={{marginTop:10,padding:14}}><div className={styles.cardHead} style={{padding:0,border:0}}><div><span className={styles.cardEyebrow}>COMMAND RESULT</span><h2>{commandResult.command}</h2></div><button className={styles.textButton} onClick={() => setCommandResult(null)}>Close</button></div>{commandResult.pending ? <p style={{fontSize:8,color:"#7892aa",margin:"12px 0 0"}}>Executing deterministic read query…</p> : commandResult.ok ? <><p style={{fontSize:8,color:"#72ddb4",margin:"12px 0 8px"}}>{commandResult.count} record(s) returned.</p><pre style={{maxHeight:260,overflow:"auto",margin:0,padding:10,border:"1px solid #17304b",background:"#050c15",borderRadius:7,color:"#8ca8be",fontSize:7}}>{JSON.stringify(commandResult.rows || [], null, 2)}</pre></> : <p style={{fontSize:8,color:"#e08393",margin:"12px 0 0"}}>{commandResult.error}</p>}</section>}
        <footer className={styles.footer}><span><WifiMark/> JASLYN <b>NET</b></span><small>CONNECTIVITY OPERATING SYSTEM</small><small>Evidence over claims • Vendor-neutral boundaries • Auditable operations</small></footer>
      </div>
    </section>
  </main>;
}
