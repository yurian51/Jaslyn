"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function time(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function CommunicationsPage() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function loadConversations() {
    const response = await fetch("/api/communication/conversations", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load conversations");
    setConversations(data.conversations || []);
    if (!activeId && data.conversations?.[0]?.id) setActiveId(data.conversations[0].id);
  }

  async function loadConversation(id) {
    if (!id) return;
    const response = await fetch("/api/communication/conversations/" + id, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load conversation");
    setActive(data.conversation);
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadConversations().catch((e) => mounted && setError(e.message)).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    loadConversation(activeId).catch((e) => setError(e.message));
  }, [activeId]);

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => [c.title, c.type, c.last_message?.body].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [conversations, query]);

  async function send(e) {
    e.preventDefault();
    const value = body.trim();
    if (!value || !activeId || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/communication/conversations/" + activeId + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: value, kind: "TEXT" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to send message");
      setBody("");
      await Promise.all([loadConversation(activeId), loadConversations()]);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0c0d10", color: "#f5f7fa", fontFamily: "Inter, system-ui, sans-serif" }}>
      <header style={{ height: 64, borderBottom: "1px solid #252931", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link href="/net" style={{ color: "#9ba3af", textDecoration: "none" }}>← Console</Link>
          <strong style={{ letterSpacing: ".08em" }}>JASLYN COMMUNICATION CENTER</strong>
        </div>
        <span style={{ color: "#7f8794", fontSize: 13 }}>Operational messaging</span>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 340px) 1fr", minHeight: "calc(100vh - 64px)" }}>
        <aside style={{ borderRight: "1px solid #252931", background: "#101216" }}>
          <div style={{ padding: 16, borderBottom: "1px solid #252931" }}>
            <div style={{ color: "#7f8794", fontSize: 11, letterSpacing: ".12em", marginBottom: 8 }}>CONVERSATIONS</div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations" style={{ width: "100%", boxSizing: "border-box", background: "#0c0d10", color: "#f5f7fa", border: "1px solid #2a2f38", borderRadius: 8, padding: "10px 12px" }} />
          </div>
          <div>
            {loading && <div style={{ padding: 18, color: "#7f8794" }}>Loading conversations…</div>}
            {!loading && !filteredConversations.length && <div style={{ padding: 18, color: "#7f8794" }}>No data available.</div>}
            {filteredConversations.map((c) => (
              <button key={c.id} onClick={() => setActiveId(c.id)} style={{ display: "flex", width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #1c2027", background: c.id === activeId ? "#171b21" : "transparent", color: "#f5f7fa", padding: "14px 16px", cursor: "pointer" }}>
                <span style={{ width: 36, height: 36, borderRadius: "50%", background: "#242a34", display: "grid", placeItems: "center", marginRight: 12, flexShrink: 0 }}>{(c.title || c.type || "C").slice(0, 1)}</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <b style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title || c.type}</b>
                    <small style={{ color: "#6f7784" }}>{time(c.last_message_at)}</small>
                  </span>
                  <small style={{ display: "block", color: "#838b97", marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.last_message?.body || "No messages yet"}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>
        <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          {!active && <div style={{ flex: 1, display: "grid", placeItems: "center", color: "#7f8794" }}>{loading ? "Loading…" : "Select a conversation"}</div>}
          {active && <>
            <div style={{ borderBottom: "1px solid #252931", padding: "14px 18px" }}>
              <div style={{ fontWeight: 700 }}>{active.title || active.type}</div>
              <div style={{ color: "#707886", fontSize: 12, marginTop: 4 }}>{active.members?.length || 0} member(s) · {active.type}</div>
            </div>
            <div style={{ flex: 1, padding: 20, overflowY: "auto", background: "#0e1014" }}>
              {active.messages?.length ? active.messages.map((message) => (
                <div key={message.id} style={{ maxWidth: "78%", margin: "0 0 12px 0" }}>
                  <div style={{ background: "#171b21", border: "1px solid #29303a", borderRadius: 12, padding: "10px 13px", color: message.deleted_at ? "#626a75" : "#edf0f4" }}>
                    {message.deleted_at ? "Message deleted" : message.body}
                  </div>
                  <small style={{ display:"block", color: "#656e7a", marginTop: 4 }}>{time(message.created_at)}{message.edited_at ? " · edited" : ""}</small>
                </div>
              )) : <div style={{ color: "#68717e", textAlign: "center", paddingTop: 60 }}>No messages available.</div>}
            </div>
            {error && <div role="alert" style={{ padding: "8px 18px", background: "#2b1719", color: "#ffaaa9", borderTop: "1px solid #5a292c" }}>{error}</div>}
            <form onSubmit={send} style={{ display: "flex", gap: 10, padding: 14, borderTop: "1px solid #252931", background: "#101216" }}>
              <input value={body} onChange={(e) => setBody(e.target.value)} disabled={sending} placeholder="Write a message…" style={{ flex: 1, background: "#0c0d10", color: "#f5f7fa", border: "1px solid #2a2f38", borderRadius: 10, padding: "12px 14px", outline: "none" }} />
              <button disabled={sending || !body.trim()} style={{ border: 0, borderRadius: 10, padding: "0 18px", background: "#e8edf3", color: "#0c0d10", fontWeight: 700, cursor: "pointer" }}>{sending ? "Sending…" : "Send"}</button>
            </form>
          </>}
        </section>
      </div>
      <style jsx>{`
        @media (max-width: 760px) {
          main > div { grid-template-columns: 1fr !important; }
          aside { display: block; }
          section { min-height: calc(100vh - 64px); }
        }
      `}</style>
    </main>
  );
}
