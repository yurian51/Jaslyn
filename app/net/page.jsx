"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./net.module.css";

const nav = [
  ["overview", "Overview", "⌂"],
  ["customers", "Customers", "◉"],
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

export default function JaslynNetDashboard() {
  const [active, setActive] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [live, setLive] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/net/overview", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setLive(data);
      })
      .catch(() => {
        if (!cancelled) setLive(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeLabel = useMemo(
    () => nav.find(([id]) => id === active)?.[1] || "Overview",
    [active]
  );

  const clock = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });

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

        <div className={styles.connectionBadge}><i /> <span>NETWORK OPERATIONS</span></div>

        <nav className={styles.nav} aria-label="Jaslyn Net navigation">
          {nav.map(([id, label, icon]) => (
            <button key={id} className={active === id ? styles.navActive : ""} onClick={() => select(id)}>
              <span className={styles.navIcon}>{icon}</span>
              <span>{label}</span>
              {active === id && <b />}
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
        <header className={styles.topbar}>
          <button className={styles.mobileMenu} onClick={() => setMenuOpen(true)} aria-label="Open navigation">☰</button>
          <div className={styles.search}><span>⌕</span><input placeholder="Search customers, devices, payments, sessions…" /><kbd>Ctrl K</kbd></div>
          <div className={styles.topRight}>
            <button className={styles.siteSelect}>⌂ <span>All Sites</span> ▾</button>
            <button className={styles.iconButton}>♧</button>
            <button className={styles.iconButton}>◐</button>
            <div className={styles.profile}><span className={styles.avatar}>Y</span><div><b>Super Admin</b><small>{date}</small></div></div>
            <div className={styles.clock}><b>{clock}</b><span><i /> System online</span></div>
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
              <button className={styles.primary}>＋ Add Customer</button>
              <button className={styles.secondary}>＋ Create Voucher</button>
              <button className={styles.command}>⌁ Network Command</button>
            </div>
          </section>

          <section className={styles.kpiGrid} aria-label="Live network KPIs">
            {kpis.map(([label, value, source, tone]) => (
              <article className={`${styles.kpi} ${styles[tone]}`} key={label}>
                <div className={styles.kpiTop}><span>{label}</span><Spark tone={tone} /></div>
                <strong>{live?.metrics?.[label] ?? value}</strong>
                <small>{source}</small>
              </article>
            ))}
          </section>

          <section className={styles.dashboardGrid}>
            <article className={`${styles.card} ${styles.topologyCard}`}>
              <div className={styles.cardHead}><div><span className={styles.cardEyebrow}>NETWORK STATE</span><h2>Network Map & Topology</h2></div><div className={styles.tabs}><button className={styles.tabActive}>Topology</button><button>Map</button><button>List</button></div></div>
              <div className={styles.topology}>
                <div className={styles.node + " " + styles.internet}><b>Internet</b><span>UPLINK</span></div>
                <div className={styles.node + " " + styles.router}><WifiMark /><b>Gateway</b><span>NETWORK DEVICE</span></div>
                <div className={styles.node + " " + styles.siteA}><i /> <b>Site</b><span>LIVE DATA REQUIRED</span></div>
                <div className={styles.node + " " + styles.siteB}><i /> <b>Access Point</b><span>LIVE DATA REQUIRED</span></div>
                <div className={styles.node + " " + styles.client}><i /> <b>Clients</b><span>SESSION EVIDENCE REQUIRED</span></div>
                <div className={styles.topologyHint}><i /> No network telemetry has been connected yet. The UI intentionally refuses to invent device state.</div>
              </div>
            </article>

            <article className={`${styles.card} ${styles.trafficCard}`}>
              <div className={styles.cardHead}><div><span className={styles.cardEyebrow}>DATA PLANE</span><h2>Traffic & Bandwidth</h2></div><select><option>Live window</option><option>Last 24 hours</option></select></div>
              <div className={styles.emptyChart}><div className={styles.chartMessage}><b>Awaiting telemetry</b><small>Download / upload measurements will appear here when a verified network telemetry source is connected.</small></div></div>
              <div className={styles.legend}><span><i className={styles.cyanDot} /> Download</span><span><i className={styles.violetDot} /> Upload</span><span><i className={styles.greenDot} /> Sessions</span></div>
            </article>

            <article className={`${styles.card} ${styles.statusCard}`}>
              <div className={styles.cardHead}><div><span className={styles.cardEyebrow}>OBSERVABILITY</span><h2>System Status</h2></div><span className={styles.livePill}><i /> LIVE</span></div>
              {[["Database", "Not connected"], ["RADIUS / AAA", "Not connected"], ["Payment Gateway", "Not connected"], ["Network API", "Not connected"], ["Captive Portal", "Not connected"], ["Telemetry", "Not connected"]].map(([name, state]) => (
                <div className={styles.statusRow} key={name}><span><i />{name}</span><b>{state}</b></div>
              ))}
            </article>

            <article className={`${styles.card} ${styles.tableCard}`}>
              <div className={styles.cardHead}><div><span className={styles.cardEyebrow}>COMMERCIAL PLANE</span><h2>Recent Payments</h2></div><button className={styles.textButton}>View all →</button></div>
              <EmptyTable columns={["CUSTOMER", "AMOUNT", "METHOD", "STATE", "TIME"]} message="No verified payment transactions available" />
            </article>

            <article className={`${styles.card} ${styles.tableCard}`}>
              <div className={styles.cardHead}><div><span className={styles.cardEyebrow}>IDENTITY + AAA</span><h2>Active Sessions</h2></div><button className={styles.textButton}>View all →</button></div>
              <EmptyTable columns={["USER", "IP", "MAC", "UPTIME", "USAGE"]} message="No authoritative sessions available" />
            </article>

            <article className={`${styles.card} ${styles.actionsCard}`}>
              <div className={styles.cardHead}><div><span className={styles.cardEyebrow}>CONTROL PLANE</span><h2>Quick Network Actions</h2></div></div>
              <div className={styles.actionGrid}>
                {["Refresh Sessions", "Sync Routers", "Apply Policy", "Disconnect User", "View Incidents", "Audit Logs"].map((label, i) => <button key={label} className={i === 3 ? styles.dangerAction : ""}><span>{["↻", "⇄", "ϟ", "×", "!", "≡"][i]}</span>{label}</button>)}
              </div>
              <p className={styles.actionNote}>Actions remain disabled until a verified network provider is configured.</p>
            </article>
          </section>

          <footer className={styles.footer}><span><WifiMark /> JASLYN <b>NET</b></span><small>CONNECTING PEOPLE • EMPOWERING BUSINESSES • OPERATING REAL NETWORKS</small><small>AI-independent core • Vendor-neutral boundaries • Evidence over claims</small></footer>
        </div>
      </section>
    </main>
  );
}

function EmptyTable({ columns, message }) {
  return <div className={styles.emptyTable}><div className={styles.tableHeader}>{columns.map((c) => <span key={c}>{c}</span>)}</div><div className={styles.tableEmpty}><span>◌</span><b>{message}</b><small>Connect the real source before production values are displayed.</small></div></div>;
}
