"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./net.module.css";
import JaslynPattern from "./patterns";

const nav = [
  ["overview", "Overview", "⌂"],
  ["customers", "Customers", "◉"],
  ["plans", "Plans & Packages", "◇"],
  ["vouchers", "Vouchers", "▣"],
  ["payments", "Payments", "¤"],
  ["billing", "Billing / Invoices", "▧"],
  ["subscriptions", "Subscriptions", "↻"],
  ["hotspot", "Hotspot / Captive Portal", "◌"],
  ["network", "Network Control", "⌁"],
  ["devices", "Devices & Routers", "▱"],
  ["aaa", "RADIUS / AAA", "⌾"],
  ["qos", "Bandwidth & QoS", "≋"],
  ["sessions", "Sessions & Accounting", "◍"],
  ["monitoring", "Monitoring & Alerts", "◈"],
  ["reports", "Reports & Analytics", "▤"],
  ["sites", "Multi-Site Management", "⌘"],
];

const kpis = [
  ["CUSTOMERS", "—", "Live source: customer store", "cyan"],
  ["ACTIVE SESSIONS", "—", "Live source: AAA/accounting", "violet"],
  ["SETTLED REVENUE", "—", "Live source: reconciled payments", "gold"],
  ["ONLINE DEVICES", "—", "Live source: device heartbeat", "green"],
  ["DATA USAGE", "—", "Live source: accounting/telemetry", "blue"],
  ["NETWORK HEALTH", "—", "Evidence required", "mint"],
];

function WifiMark() {
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true" className={styles.wifiMark}>
      <path d="M5 17C20 3 44 3 59 17" />
      <path d="M14 27c10-9 26-9 36 0" />
      <path d="M23 36c5-5 13-5 18 0" />
      <circle cx="32" cy="43" r="3" />
    </svg>
  );
}

function Spark({ tone }) {
  return <span className={`${styles.spark} ${styles[tone]}`} aria-hidden="true" />;
}

function evidenceState(health, key) {
  const item = health?.[key];
  if (!item?.configured) return "Not configured";
  if (item.ok) return "Connected";
  return "Degraded";
}

export default function JaslynNetDashboard() {
  const [active, setActive] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [live, setLive] = useState(null);
  const [health, setHealth] = useState(null);
  const [catalog, setCatalog] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const [overviewResponse, healthResponse, catalogResponse] = await Promise.all([
        fetch("/api/net/overview", { cache: "no-store" }),
        fetch("/api/net/health", { cache: "no-store" }),
        fetch("/api/net/catalog", { cache: "no-store" }),
      ]);
      const overview = overviewResponse.ok || overviewResponse.status === 503 || overviewResponse.status === 502 ? await overviewResponse.json() : null;
      const healthData = healthResponse.ok ? await healthResponse.json() : null;
      const catalogData = catalogResponse.ok || catalogResponse.status === 503 ? await catalogResponse.json() : null;
      if (!cancelled) {
        setLive(overview);
        setHealth(healthData);
        setCatalog(catalogData);
      }
    };
    refresh().catch(() => {
      if (!cancelled) {
        setLive(null);
        setHealth(null);
      }
    });
    const interval = setInterval(() => refresh().catch(() => {}), 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const activeLabel = useMemo(() => nav.find(([id]) => id === active)?.[1] || "Overview", [active]);
  const clock = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
  const systemOnline = Boolean(health?.network?.ok || health?.database?.ok);
  const statusRows = [
    ["Database", evidenceState(health, "database")],
    ["RADIUS / AAA", health?.runtime?.capabilities?.radiusAccountingTransport ? "Accounting transport" : "Not configured"],
    ["Payment Gateway", "Not configured"],
    ["Network API", evidenceState(health, "network")],
    ["Captive Portal", health?.runtime?.capabilities?.hotspotSessions ? "Connected" : "Not configured"],
    ["Telemetry", "Not configured"],
  ];

  const workspaceMap = {
    customers: { key: "customers", eyebrow: "SUBSCRIBER PLANE", title: "Customer Registry", body: "Authoritative subscriber records, lifecycle state and account ownership belong here. Personal records are not exposed until an authenticated tenant context is established.", actions: ["Add customer", "Import subscribers"] },
    plans: { key: "plans", eyebrow: "COMMERCIAL PLANE", title: "Plans & Packages", body: "Package definitions are sourced from the billing schema and must remain aligned with network policy enforcement.", actions: ["Create package", "Review policies"] },
    vouchers: { key: "vouchers", eyebrow: "ACCESS PLANE", title: "Voucher Operations", body: "Voucher issuance, redemption and reseller assignment require a persisted voucher engine. No synthetic voucher codes are shown.", actions: ["Configure voucher engine", "Review redemption policy"] },
    payments: { key: "payments", eyebrow: "PAYMENT PLANE", title: "Payments & Reconciliation", body: "Payment state remains provider-verified and idempotent. Uncertain callbacks never become successful transactions.", actions: ["Configure provider", "Open reconciliation"] },
    subscriptions: { key: "subscriptions", eyebrow: "SERVICE PLANE", title: "Subscriptions & Entitlements", body: "Subscription state and entitlement state are separate. Provisioning cannot be inferred from payment alone.", actions: ["Review entitlements", "Inspect lifecycle"] },
    billing: { key: "invoices", eyebrow: "BILLING PLANE", title: "Billing & Invoices", body: "Invoices, line items, balances and payment allocation are persisted independently from network activation.", actions: ["Create invoice", "Review overdue"] },
    hotspot: { key: null, eyebrow: "ACCESS PLANE", title: "Hotspot / Captive Portal", body: "The customer portal exists separately from this operator surface. Network activation requires a configured provider and verified payment path.", actions: ["Open customer portal", "Configure hotspot"] },
    network: { key: "networks", eyebrow: "NETWORK PLANE", title: "Network Control", body: "Provider-neutral network operations are exposed only through registered adapters. Commands require authorization, timeout, audit and verification.", actions: ["Review providers", "Inspect command queue"] },
    devices: { key: "devices", eyebrow: "NETWORK PLANE", title: "Devices & Routers", body: "Device state is authoritative only when sourced from a configured adapter or persisted heartbeat.", actions: ["Register device", "Run health check"] },
    aaa: { key: null, eyebrow: "IDENTITY PLANE", title: "RADIUS / AAA", body: "Accounting transport is implemented, while full authentication and authorization remain separate capabilities. The console will not label accounting as complete AAA.", actions: ["Inspect accounting", "Configure RADIUS"] },
    qos: { key: null, eyebrow: "POLICY PLANE", title: "Bandwidth & QoS", body: "Speed, quota and policy compilation are available in the network core. Enforcement requires a connected provider.", actions: ["Review policy compiler", "Configure provider"] },
    sessions: { key: "sessions", eyebrow: "IDENTITY + ACCOUNTING", title: "Sessions & Accounting", body: "Sessions are distinct from subscriptions. Active state must come from AAA/accounting evidence and can become stale.", actions: ["Inspect sessions", "Review accounting"] },
    monitoring: { key: "incidents", eyebrow: "OBSERVABILITY", title: "Monitoring & Alerts", body: "Health and incidents are displayed only when supported by telemetry or persisted operational state. Stale evidence is not presented as live.", actions: ["Inspect incidents", "Configure telemetry"] },
    reports: { key: null, eyebrow: "REPORTING PLANE", title: "Reports & Analytics", body: "Reports will be generated from authoritative billing, subscriber, session and network records. No fabricated revenue or usage charts are rendered.", actions: ["Configure reporting", "Review data sources"] },
    sites: { key: "sites", eyebrow: "MULTI-SITE PLANE", title: "Multi-Site Management", body: "Sites and networks are tenant-scoped database entities. Cross-tenant visibility requires server-side authorization.", actions: ["Add site", "Review site topology"] },
  };

  function Workspace({ config }) {
    const resource = config.key ? catalog?.resources?.[config.key] : null;
    const state = resource?.state || (catalog?.configured ? "NOT_CONNECTED" : "NOT_CONFIGURED");
    const count = resource?.count;
    const capabilities = catalog?.runtime?.capabilities || {};
    const capabilityRows = [
      ["Persistent database", capabilities.persistentBilling],
      ["Transactional DB", capabilities.transactionalDatabase],
      ["Network commands", capabilities.networkCommands],
      ["Device adapter", capabilities.devices],
      ["Session adapter", capabilities.sessions],
      ["Hotspot sessions", capabilities.hotspotSessions],
      ["RADIUS accounting transport", capabilities.radiusAccountingTransport],
      ["Telemetry", capabilities.telemetry],
    ];
    return (
      <section className={styles.workspace}>
        <article className={styles.card + " " + styles.workspaceHero}>
          <span className={styles.cardEyebrow}>{config.eyebrow}</span>
          <div className={styles.workspaceTitle}><div><h2>{config.title}</h2><p>{config.body}</p></div><span className={styles.sourceState}>{state}</span></div>
          <div className={styles.workspaceActions}>{config.actions.map((action) => <button key={action} className={styles.secondary}>{action}</button>)}</div>
        </article>
        <div className={styles.workspaceGrid}>
          <article className={styles.card + " " + styles.resourceCard}>
            <span className={styles.cardEyebrow}>AUTHORITATIVE STORE</span>
            <strong>{count == null ? "—" : count}</strong>
            <h3>{resource?.label || "Resource records"}</h3>
            <p>{resource ? "Count read directly from PostgreSQL. No sample rows are generated." : "This module has no persisted resource endpoint yet, so the console shows an honest unconfigured state."}</p>
          </article>
          <article className={styles.card + " " + styles.capabilityCard}>
            <span className={styles.cardEyebrow}>RUNTIME CAPABILITIES</span>
            {capabilityRows.map(([label, enabled]) => <div className={styles.capabilityRow} key={label}><span>{label}</span><b className={enabled ? styles.capOn : styles.capOff}>{enabled ? "AVAILABLE" : "NOT CONFIGURED"}</b></div>)}
          </article>
        </div>
      </section>
    );
  }

  function select(id) {
    setActive(id);
    setMenuOpen(false);
  }

  return (
    <main className={styles.shell}>
      <aside className={`${styles.sidebar} ${menuOpen ? styles.open : ""}`}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}><WifiMark /></div>
          <div className={styles.brandText}>
            <strong>JASLYN <span>NET</span></strong>
            <small>SUPREME HYBRID NETWORK OPERATING ENGINE</small>
          </div>
        </div>
        <div className={styles.connectionBadge}><i style={{ background: systemOnline ? undefined : "#d9a63b" }} /> <span>{systemOnline ? "NETWORK OPERATIONS ONLINE" : "NETWORK SOURCES PENDING"}</span></div>
        <nav className={styles.nav} aria-label="Jaslyn Net navigation">
          {nav.map(([id, label, icon]) => (
            <button key={id} className={active === id ? styles.navActive : ""} onClick={() => select(id)}>
              <span className={styles.navIcon}>{icon}</span><span>{label}</span>{active === id && <b />}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.miniLogo}><WifiMark /><span>JASLYN <b>NET</b></span></div>
          <small>REAL NETWORK • REAL STATE • REAL OPERATIONS</small>
        </div>
      </aside>

      {menuOpen && <button className={styles.scrim} aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <section className={styles.main}>
        <JaslynPattern
          variant={active === "network" || active === "hotspot" ? "waves" : active === "monitoring" || active === "sessions" ? "pulse" : active === "devices" || active === "aaa" ? "circuit" : active === "reports" || active === "analytics" ? "constellation" : "mesh"}
          intensity={systemOnline ? "normal" : "low"}
          active={systemOnline}
        />
        <header className={styles.topbar}>
          <button className={styles.mobileMenu} onClick={() => setMenuOpen(true)} aria-label="Open navigation">☰</button>
          <div className={styles.search}><span>⌕</span><input placeholder="Search customers, devices, payments, sessions…" /><kbd>Ctrl K</kbd></div>
          <div className={styles.topRight}>
            <button className={styles.siteSelect}>⌂ <span>All Sites</span> ▾</button>
            <button className={styles.iconButton}>♧</button><button className={styles.iconButton}>◐</button>
            <div className={styles.profile}><span className={styles.avatar}>Y</span><div><b>Super Admin</b><small>{date}</small></div></div>
            <div className={styles.clock}><b>{clock}</b><span><i /> {systemOnline ? "System online" : "Awaiting sources"}</span></div>
          </div>
        </header>

        <div className={styles.content}>
          <section className={styles.hero}>
            <div>
              <span className={styles.eyebrow}>JASLYN NET / NETWORK OPERATIONS</span>
              <h1>{activeLabel}<span>.</span></h1>
              <p>One operational surface for customers, billing, AAA, network control, sessions, telemetry and reconciliation.</p>
            </div>
            <div className={styles.heroActions}>
              <button className={styles.primary}>＋ Add Customer</button><button className={styles.secondary}>＋ Create Voucher</button><button className={styles.command}>⌁ Network Command</button>
            </div>
          </section>

          <section className={styles.kpiGrid} aria-label="Live network KPIs">
            {kpis.map(([label, value, source, tone]) => <article className={`${styles.kpi} ${styles[tone]}`} key={label}><div className={styles.kpiTop}><span>{label}</span><Spark tone={tone} /></div><strong>{live?.metrics?.[label] ?? value}</strong><small>{source}</small></article>)}
          </section>

          {active === "overview" ? <section className={styles.dashboardGrid}>
            <article className={`${styles.card} ${styles.topologyCard}`}>
              <div className={styles.cardHead}><div><span className={styles.cardEyebrow}>NETWORK STATE</span><h2>Network Map & Topology</h2></div><div className={styles.tabs}><button className={styles.tabActive}>Topology</button><button>Map</button><button>List</button></div></div>
              <div className={styles.topology}>
                <div className={styles.node + " " + styles.internet}><b>Internet</b><span>UPLINK</span></div>
                <div className={styles.node + " " + styles.router}><WifiMark /><b>Gateway</b><span>{health?.network?.ok ? "VERIFIED" : "LIVE DATA REQUIRED"}</span></div>
                <div className={styles.node + " " + styles.siteA}><i /><b>Site</b><span>LIVE DATA REQUIRED</span></div>
                <div className={styles.node + " " + styles.siteB}><i /><b>Access Point</b><span>LIVE DATA REQUIRED</span></div>
                <div className={styles.node + " " + styles.client}><i /><b>Clients</b><span>{live?.metrics?.["ACTIVE SESSIONS"] !== "—" ? "ACCOUNTING SOURCE" : "SESSION EVIDENCE REQUIRED"}</span></div>
                <div className={styles.topologyHint}><i /> {health?.network?.ok ? "Gateway health is verified. Site, AP and client topology remains unclaimed until authoritative device telemetry is connected." : "No network telemetry has been connected yet. The UI refuses to invent device state."}</div>
              </div>
            </article>

            <article className={`${styles.card} ${styles.trafficCard}`}>
              <div className={styles.cardHead}><div><span className={styles.cardEyebrow}>DATA PLANE</span><h2>Traffic & Bandwidth</h2></div><select><option>Live window</option><option>Last 24 hours</option></select></div>
              <div className={styles.emptyChart}><div className={styles.chartMessage}><b>Awaiting telemetry</b><small>Download / upload measurements will appear here when a verified network telemetry source is connected.</small></div></div>
              <div className={styles.legend}><span><i className={styles.cyanDot} /> Download</span><span><i className={styles.violetDot} /> Upload</span><span><i className={styles.greenDot} /> Sessions</span></div>
            </article>

            <article className={`${styles.card} ${styles.statusCard}`}>
              <div className={styles.cardHead}><div><span className={styles.cardEyebrow}>OBSERVABILITY</span><h2>System Status</h2></div><span className={styles.livePill}><i /> LIVE</span></div>
              {statusRows.map(([name, state]) => <div className={styles.statusRow} key={name}><span><i />{name}</span><b>{state}</b></div>)}
            </article>

            <article className={`${styles.card} ${styles.tableCard}`}><div className={styles.cardHead}><div><span className={styles.cardEyebrow}>COMMERCIAL PLANE</span><h2>Recent Payments</h2></div><button className={styles.textButton}>View all →</button></div><EmptyTable columns={["CUSTOMER", "AMOUNT", "METHOD", "STATE", "TIME"]} message="No verified payment transactions available" /></article>
            <article className={`${styles.card} ${styles.tableCard}`}><div className={styles.cardHead}><div><span className={styles.cardEyebrow}>IDENTITY + AAA</span><h2>Active Sessions</h2></div><button className={styles.textButton}>View all →</button></div><EmptyTable columns={["USER", "IP", "MAC", "UPTIME", "USAGE"]} message={live?.metrics?.["ACTIVE SESSIONS"] && live.metrics["ACTIVE SESSIONS"] !== "—" ? "Live session data is available from MikroTik" : "No authoritative sessions available"} /></article>
            <article className={`${styles.card} ${styles.actionsCard}`}>
              <div className={styles.cardHead}><div><span className={styles.cardEyebrow}>CONTROL PLANE</span><h2>Quick Network Actions</h2></div></div>
              <div className={styles.actionGrid}>{["Refresh Sessions", "Sync Routers", "Apply Policy", "Disconnect User", "View Incidents", "Audit Logs"].map((label, i) => <button key={label} className={i === 3 ? styles.dangerAction : ""}><span>{["↻", "⇄", "ϟ", "×", "!", "≡"][i]}</span>{label}</button>)}</div>
              <p className={styles.actionNote}>Destructive actions require a verified provider and a separate network command secret. No command is executed from an unverified UI state.</p>
            </article>
          </section> : <Workspace config={workspaceMap[active]} />}

          <footer className={styles.footer}><span><WifiMark /> JASLYN <b>NET</b></span><small>CONNECTING PEOPLE • EMPOWERING BUSINESSES • OPERATING REAL NETWORKS</small><small>AI-independent core • Vendor-neutral boundaries • Evidence over claims</small></footer>
        </div>
      </section>
    </main>
  );
}

function EmptyTable({ columns, message }) {
  return <div className={styles.emptyTable}><div className={styles.tableHeader}>{columns.map((c) => <span key={c}>{c}</span>)}</div><div className={styles.tableEmpty}><span>◌</span><b>{message}</b><small>Connect the real source before production values are displayed.</small></div></div>;
}
