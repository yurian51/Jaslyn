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
  const [connectionState, setConnectionState] = useState("checking");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let controller = null;
    let timer = null;

    const loadCachedState = () => {
      try {
        const cached = window.localStorage.getItem("jaslyn-net:last-state");
        if (!cached) return;
        const parsed = JSON.parse(cached);
        if (parsed?.live) setLive(parsed.live);
        if (parsed?.health) setHealth(parsed.health);
        if (parsed?.savedAt) setLastSyncedAt(new Date(parsed.savedAt));
        setConnectionState("offline-cache");
      } catch {
        // Corrupt local state is disposable. The authoritative API remains the source of truth.
      }
    };

    const refresh = async () => {
      if (cancelled || document.hidden || !navigator.onLine) return;
      controller?.abort();
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const [overviewResponse, healthResponse] = await Promise.all([
          fetch("/api/net/overview", { cache: "no-store", signal: controller.signal }),
          fetch("/api/net/health", { cache: "no-store", signal: controller.signal }),
        ]);

        const overview = overviewResponse.ok || overviewResponse.status === 503 || overviewResponse.status === 502
          ? await overviewResponse.json()
          : null;
        const healthData = healthResponse.ok ? await healthResponse.json() : null;

        if (cancelled) return;

        if (overview) setLive(overview);
        if (healthData) setHealth(healthData);

        const successful = Boolean(overview || healthData);
        if (successful) {
          const synced = new Date();
          setLastSyncedAt(synced);
          setConnectionState(overviewResponse.ok && healthResponse.ok ? "online" : "degraded");
          try {
            window.localStorage.setItem("jaslyn-net:last-state", JSON.stringify({
              live: overview,
              health: healthData,
              savedAt: synced.toISOString(),
            }));
          } catch {
            // Storage is an optimization, not a dependency.
          }
        } else {
          setConnectionState("degraded");
        }
      } catch (error) {
        if (cancelled || error?.name === "AbortError") return;
        setConnectionState(navigator.onLine ? "degraded" : "offline-cache");
      } finally {
        clearTimeout(timeout);
      }
    };

    const schedule = () => {
      clearTimeout(timer);
      if (cancelled) return;
      const delay = document.hidden ? 60000 : 15000;
      timer = setTimeout(async () => {
        await refresh();
        schedule();
      }, delay);
    };

    const onOnline = () => {
      setConnectionState("reconnecting");
      refresh().finally(schedule);
    };
    const onOffline = () => setConnectionState("offline-cache");
    const onVisibility = () => {
      if (!document.hidden) refresh().finally(schedule);
      else schedule();
    };

    loadCachedState();
    refresh().finally(schedule);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      controller?.abort();
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const activeLabel = useMemo(() => nav.find(([id]) => id === active)?.[1] || "Overview", [active]);
  const clock = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
  const systemOnline = connectionState !== "offline-cache" && connectionState !== "checking" && Boolean(health?.network?.ok || health?.database?.ok);
  const stateLabel = connectionState === "online" ? "LIVE" : connectionState === "reconnecting" ? "RECONNECTING" : connectionState === "offline-cache" ? "OFFLINE CACHE" : connectionState === "degraded" ? "DEGRADED" : "CHECKING";
  const statusRows = [
    ["Database", evidenceState(health, "database")],
    ["RADIUS / AAA", "Not configured"],
    ["Payment Gateway", "Not configured"],
    ["Network API", evidenceState(health, "network")],
    ["Captive Portal", health?.runtime?.capabilities?.hotspotSessions ? "Connected" : "Not configured"],
    ["Telemetry", "Not configured"],
  ];

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
          variant={active === "network" || active === "hotspot" ? "waves" : active === "monitoring" || active === "sessions" ? "pulse" : active === "devices" || active === "aaa" ? "circuit" : active === "reports" ? "constellation" : "mesh"}
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
            <div className={styles.clock}><b>{clock}</b><span><i className={connectionState === "offline-cache" ? styles.statusOffline : connectionState === "degraded" ? styles.statusDegraded : ""} /> {stateLabel}{lastSyncedAt ? " • " + lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span></div>
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

          <section className={styles.dashboardGrid}>
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
