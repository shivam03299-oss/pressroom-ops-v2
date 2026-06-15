import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Building2, Inbox, Bot, Sparkles, Plug, Activity, Clock,
  CheckCircle2, AlertTriangle, XCircle, Loader2, Play, RefreshCw,
  ChevronRight, ChevronDown, Lock, Power, MessageSquare, Phone, Send,
  Copy, ExternalLink, Wand2, Circle, Download, Image as ImageIcon, Film,
  IndianRupee, Wallet, Package, TrendingUp, TrendingDown, ShoppingCart,
  Truck, Plus, Trash2, Boxes, Settings, ArrowDownRight, ArrowUpRight, Brain,
} from "lucide-react";
import { supabase } from "./supabase.js";

// ═══════════════════════════════════════════════════════════════════
// HASHWAY · COMMAND CENTER
// Phase 1: real DB-backed agent dashboard. Founder-only.
// ═══════════════════════════════════════════════════════════════════

// ─── API client helpers ──────────────────────────────────────────
async function apiCall(endpoint, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ─── Root ────────────────────────────────────────────────────────
export default function HashwayOffice({ profile }) {
  const [tab, setTab] = useState("inbox");
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshAll = useCallback(() => setRefreshKey(k => k + 1), []);

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 18 }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Building2 size={20} />
            HASHWAY <span style={{ opacity: 0.45 }}>·</span> COMMAND CENTER
          </h1>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4, display: "flex", gap: 10, alignItems: "center" }}>
            <Lock size={11} /> Founder-only · {profile?.name || "you"}
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Phase 1 · live</span>
          </div>
        </div>
        <button className="btn-ghost" onClick={refreshAll} title="Refresh"
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {[
          { id: "inbox",        label: "Founder Inbox", icon: Inbox },
          { id: "finance",      label: "Finance",       icon: IndianRupee },
          { id: "inventory",    label: "Inventory",     icon: Boxes },
          { id: "purchases",    label: "Purchases",     icon: ShoppingCart },
          { id: "agents",       label: "Agents",        icon: Bot },
          { id: "wa",           label: "WA Threads",    icon: MessageSquare },
          { id: "integrations", label: "Integrations",  icon: Plug },
          { id: "overview",     label: "Overview",      icon: Activity },
        ].map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="btn-ghost"
              style={{
                borderRadius: 0, borderBottom: active ? "2px solid var(--ink-accent)" : "2px solid transparent",
                opacity: active ? 1 : 0.6, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, fontSize: 12,
              }}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "inbox"        && <FounderInbox  refreshKey={refreshKey} onChange={refreshAll} />}
      {tab === "finance"      && <FinancePanel   refreshKey={refreshKey} />}
      {tab === "inventory"    && <InventoryPanel refreshKey={refreshKey} onChange={refreshAll} />}
      {tab === "purchases"    && <PurchasesPanel refreshKey={refreshKey} onChange={refreshAll} />}
      {tab === "agents"       && <AgentsPanel   refreshKey={refreshKey} onChange={refreshAll} />}
      {tab === "wa"           && <WaThreadsPanel refreshKey={refreshKey} />}
      {tab === "integrations" && <Integrations  refreshKey={refreshKey} />}
      {tab === "overview"     && <Overview      refreshKey={refreshKey} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// WA THREADS
// ═══════════════════════════════════════════════════════════════════
function WaThreadsPanel({ refreshKey }) {
  const [threads,  setThreads]  = useState(null);
  const [error,    setError]    = useState(null);
  const [openId,   setOpenId]   = useState(null);
  const [messages, setMessages] = useState({}); // threadId → messages[]

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const { data, error } = await supabase
          .from("hashway_ops_wa_threads")
          .select("*")
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(100);
        if (error) throw error;
        setThreads(data || []);
      } catch (e) { setError(e.message); setThreads([]); }
    })();
  }, [refreshKey]);

  const open = async (t) => {
    if (openId === t.id) { setOpenId(null); return; }
    setOpenId(t.id);
    if (!messages[t.id]) {
      const { data, error } = await supabase
        .from("hashway_ops_wa_messages")
        .select("*").eq("thread_id", t.id).order("created_at", { ascending: true });
      if (!error) setMessages(m => ({ ...m, [t.id]: data || [] }));
    }
  };

  if (threads === null) return <LoadingPanel label="Loading WhatsApp threads…" />;
  if (error) return <ErrorPanel error={error} />;

  if (threads.length === 0) {
    return (
      <div className="empty panel" style={{ padding: 40, textAlign: "center" }}>
        <MessageSquare size={28} style={{ opacity: 0.4, marginBottom: 12 }} />
        <div style={{ fontWeight: 600, marginBottom: 6 }}>No WhatsApp threads yet</div>
        <div style={{ fontSize: 12, opacity: 0.6, maxWidth: 380, margin: "0 auto", lineHeight: 1.5 }}>
          Once AiSensy is connected and the webhook is registered, every customer DM lands here.
          See <code>WA_SETUP.md</code> in the repo for setup steps.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {threads.map(t => (
        <div key={t.id} className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <button onClick={() => open(t)} style={{
            all: "unset", cursor: "pointer", width: "100%", padding: 14,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", background: "var(--bg-elevated)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Phone size={14} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t.customer_name || `+${t.phone}`}</span>
                <span style={{ fontSize: 11, opacity: 0.5 }}>+{t.phone}</span>
                {t.unread_count > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                    background: "#22c55e", color: "#000", letterSpacing: 0.3,
                  }}>
                    {t.unread_count} new
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 3, overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.last_message_dir === "in" ? "↩ " : "↪ "}{t.last_message_body || "(no preview)"}
              </div>
              {t.linked_order_ids && t.linked_order_ids.length > 0 && (
                <div style={{ fontSize: 10, opacity: 0.5, marginTop: 3 }}>
                  Linked orders: {t.linked_order_ids.slice(0, 3).join(", ")}
                  {t.linked_order_ids.length > 3 && ` +${t.linked_order_ids.length - 3} more`}
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, opacity: 0.45, flexShrink: 0 }}>
              {t.last_message_at ? timeAgo(t.last_message_at) : ""}
            </div>
            {openId === t.id ? <ChevronDown size={14} style={{ opacity: 0.5 }} />
                              : <ChevronRight size={14} style={{ opacity: 0.5 }} />}
          </button>
          {openId === t.id && (
            <div style={{ borderTop: "1px solid var(--border)", padding: 14, background: "var(--bg-main)",
                          maxHeight: 380, overflowY: "auto" }}>
              {!messages[t.id] && <div style={{ textAlign: "center", opacity: 0.5, fontSize: 12 }}>
                <Loader2 size={12} className="spin" /> loading messages…
              </div>}
              {messages[t.id]?.length === 0 && <Muted>No messages.</Muted>}
              {messages[t.id]?.map(m => (
                <WaMessageBubble key={m.id} message={m} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function WaMessageBubble({ message }) {
  const out = message.direction === "out";
  return (
    <div style={{ display: "flex", justifyContent: out ? "flex-end" : "flex-start", marginBottom: 8 }}>
      <div style={{
        maxWidth: "75%",
        padding: "8px 12px",
        borderRadius: 10,
        background: out ? "rgba(34,197,94,0.15)" : "var(--bg-elevated)",
        borderLeft: out ? "none" : "2px solid var(--border)",
        borderRight: out ? "2px solid #22c55e" : "none",
      }}>
        {message.message_type === "template" && (
          <div style={{ fontSize: 9, opacity: 0.55, letterSpacing: 0.5, marginBottom: 4 }}>
            TEMPLATE · {message.template_name}
          </div>
        )}
        <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {message.body || (message.message_type !== "text" ? `[${message.message_type}]` : "(empty)")}
        </div>
        <div style={{ fontSize: 9, opacity: 0.45, marginTop: 4, display: "flex", gap: 8 }}>
          <span>{new Date(message.created_at).toLocaleString()}</span>
          <span>· {message.status}</span>
          {message.error && <span style={{ color: "#ef4444" }}>· {message.error.slice(0, 40)}</span>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FOUNDER INBOX
// ═══════════════════════════════════════════════════════════════════
function FounderInbox({ refreshKey, onChange }) {
  const [tasks,   setTasks]   = useState(null);
  const [error,   setError]   = useState(null);
  const [busyId,  setBusyId]  = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const j = await apiCall("hashway-ops-tasks", { action: "list" });
      setTasks(j.data || []);
    } catch (e) { setError(e.message); setTasks([]); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const pending  = useMemo(() => (tasks || []).filter(t => t.status === "pending"),  [tasks]);
  const approved = useMemo(() => (tasks || []).filter(t => t.status === "approved"), [tasks]);
  const failed   = useMemo(() => (tasks || []).filter(t => t.status === "failed"),   [tasks]);

  const act = async (action, task_id, extra = {}) => {
    setBusyId(task_id);
    try {
      await apiCall("hashway-ops-tasks", { action, task_id, ...extra });
      await load();
      onChange?.();
    } catch (e) { alert(`Failed: ${e.message}`); }
    finally { setBusyId(null); }
  };

  if (tasks === null) return <LoadingPanel label="Loading inbox…" />;
  if (error) return <ErrorPanel error={error} onRetry={load} />;

  if (pending.length === 0 && approved.length === 0 && failed.length === 0) {
    return (
      <div className="empty panel" style={{ padding: 40, textAlign: "center" }}>
        <Inbox size={28} style={{ opacity: 0.4, marginBottom: 12 }} />
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Inbox is empty</div>
        <div style={{ fontSize: 12, opacity: 0.6, maxWidth: 380, margin: "0 auto", lineHeight: 1.5 }}>
          Go to the <b>Agents</b> tab and hit <b>Run now</b> on the CX or Ops agent.
          Proposed actions land here for your one-tap approval.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Section title="Pending approval" count={pending.length} accent="amber">
        {pending.map(t => (
          <TaskCard key={t.id} task={t} expanded={expanded === t.id}
                    onExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                    busy={busyId === t.id}
                    onApprove={() => act("approve", t.id)}
                    onReject={() => {
                      const note = prompt("Reject reason (optional):", "");
                      if (note !== null) act("reject", t.id, { note });
                    }} />
        ))}
        {pending.length === 0 && <Muted>No pending items.</Muted>}
      </Section>

      {approved.length > 0 && (
        <Section title="Approved & executed" count={approved.length} accent="green">
          {approved.map(t => (
            <TaskCard key={t.id} task={t} expanded={expanded === t.id} readonly
                      onExpand={() => setExpanded(expanded === t.id ? null : t.id)} />
          ))}
        </Section>
      )}

      {failed.length > 0 && (
        <Section title="Execution failed" count={failed.length} accent="red">
          {failed.map(t => (
            <TaskCard key={t.id} task={t} expanded={expanded === t.id}
                      onExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                      busy={busyId === t.id}
                      onApprove={() => act("approve", t.id)}
                      onReject={() => act("reject", t.id, { note: "abandoned after failure" })}
                      approveLabel="Retry" />
          ))}
        </Section>
      )}
    </div>
  );
}

function TaskCard({ task, expanded, onExpand, onApprove, onReject, busy, readonly, approveLabel = "Approve" }) {
  const agentName = task.hashway_ops_agents?.name || task.dept;
  const priColor = task.priority === "urgent" ? "#ef4444" : task.priority === "high" ? "#f59e0b" : "var(--text-mute)";
  return (
    <div className="panel" style={{ padding: 14, borderLeft: `3px solid ${priColor}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4,
                           background: "var(--bg-elevated)", letterSpacing: 0.5, textTransform: "uppercase" }}>
              {agentName}
            </span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4,
                           background: "var(--bg-elevated)", letterSpacing: 0.5 }}>
              {task.type}
            </span>
            {task.priority !== "normal" && (
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, letterSpacing: 0.5,
                             color: priColor, textTransform: "uppercase" }}>
                {task.priority}
              </span>
            )}
            <span style={{ fontSize: 10, opacity: 0.45 }}>
              {new Date(task.created_at).toLocaleString()}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{task.title}</div>
          {task.reasoning && (
            <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>{task.reasoning}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {!readonly && (
            <>
              <button className="btn-primary" disabled={busy} onClick={onApprove}
                      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "6px 12px" }}>
                {busy ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />} {approveLabel}
              </button>
              <button className="btn-ghost" disabled={busy} onClick={onReject}
                      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "6px 10px" }}>
                <XCircle size={12} /> Reject
              </button>
            </>
          )}
          <button className="btn-ghost" onClick={onExpand}
                  style={{ padding: 6 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12, display: "grid", gap: 10 }}>
          {task.type?.startsWith("propose_ig_") ? (
            <CreativePreview task={task} />
          ) : (
            <>
              {task.external_ref && <KV label="Reference" value={task.external_ref} />}
              <KV label="Payload"         value={<Code obj={task.payload} />} />
              <KV label="Proposed action" value={<Code obj={task.proposed_action} />} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CREATIVE PREVIEW — image rendering + downloads inside the task card
// ═══════════════════════════════════════════════════════════════════
function CreativePreview({ task }) {
  const p = task.payload || {};
  const isReel = task.type === "propose_ig_reel_script";
  const slides = Array.isArray(p.slides) ? p.slides : [];
  const fullCaption = [(p.caption || "").trim(), (p.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
  const [copied, setCopied] = useState(false);

  const copyCaption = async () => {
    try { await navigator.clipboard.writeText(fullCaption); setCopied(true); setTimeout(() => setCopied(false), 1200); }
    catch { alert("Copy failed — select and Cmd+C manually."); }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Aspect badge + audience */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, opacity: 0.7 }}>
        {isReel ? <Film size={12} /> : <ImageIcon size={12} />}
        <span>{p.aspect || "—"}</span>
        {p.target_audience && <><span style={{ opacity: 0.4 }}>·</span><span>{p.target_audience}</span></>}
        {!isReel && slides.length > 1 && <><span style={{ opacity: 0.4 }}>·</span><span>{slides.length} slides</span></>}
      </div>

      {/* Caption with copy button */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 10, letterSpacing: 0.5, opacity: 0.55, textTransform: "uppercase" }}>Caption</div>
          <button className="btn-ghost" onClick={copyCaption}
                  style={{ fontSize: 11, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4,
                           color: copied ? "#22c55e" : "var(--text)" }}>
            {copied ? <><CheckCircle2 size={11} /> Copied</> : <><Copy size={11} /> Copy caption + tags</>}
          </button>
        </div>
        <div style={{ padding: 10, background: "var(--bg-main)", borderRadius: 6, border: "1px solid var(--border)",
                      fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
          {p.caption || "(no caption)"}
          {Array.isArray(p.hashtags) && p.hashtags.length > 0 && (
            <div style={{ marginTop: 8, opacity: 0.65, fontSize: 11 }}>{p.hashtags.join(" ")}</div>
          )}
        </div>
      </div>

      {/* Reel script OR image slides */}
      {isReel ? (
        <ReelScript script={p.script || {}} />
      ) : (
        <div>
          <div style={{ fontSize: 10, letterSpacing: 0.5, opacity: 0.55, textTransform: "uppercase", marginBottom: 6 }}>
            {slides.length > 1 ? `Slides (${slides.length})` : "Image"}
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
            {slides.map((slide, i) => (
              <SlidePreview key={i} task={task} slide={slide} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SlidePreview({ task, slide, index }) {
  const [signedUrl, setSignedUrl] = useState(null);   // rendered preview URL
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState(null);
  const aspect = slide.aspect || task.payload?.aspect || "4:5";
  const aspectRatio = aspect === "9:16" ? "9 / 16" : aspect === "1:1" ? "1 / 1" : "4 / 5";

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      const j = await apiCall("hashway-ops-render-image", { task_id: task.id, slide_index: index });
      setSignedUrl(j.signed_url);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden",
                  background: "var(--bg-main)", display: "flex", flexDirection: "column" }}>
      <div style={{ aspectRatio, background: "var(--bg-elevated)", display: "flex",
                    alignItems: "center", justifyContent: "center", position: "relative" }}>
        {signedUrl ? (
          <img src={signedUrl} alt={`Slide ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : slide.source_image_url ? (
          <img src={slide.source_image_url} alt={`Source ${index + 1}`}
               style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.4 }} />
        ) : (
          <ImageIcon size={24} style={{ opacity: 0.3 }} />
        )}
        <div style={{ position: "absolute", top: 6, left: 6, fontSize: 9, padding: "2px 6px",
                      background: "rgba(0,0,0,0.7)", color: "#fff", borderRadius: 3, letterSpacing: 0.5 }}>
          {index + 1} · {aspect}
        </div>
      </div>
      {slide.slide_caption && (
        <div style={{ padding: "6px 8px", fontSize: 10, opacity: 0.65, borderTop: "1px solid var(--border)" }}>
          {slide.slide_caption}
        </div>
      )}
      <div style={{ padding: 8, display: "flex", gap: 6, borderTop: "1px solid var(--border)" }}>
        {!signedUrl ? (
          <button className="btn-primary" onClick={generate} disabled={busy}
                  style={{ flex: 1, fontSize: 11, padding: "6px 8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            {busy ? <Loader2 size={11} className="spin" /> : <Wand2 size={11} />} Generate preview
          </button>
        ) : (
          <>
            <a href={signedUrl} download={`hashway-${task.id.slice(0, 8)}-slide-${index + 1}.jpg`}
               style={{ flex: 1, textDecoration: "none" }}>
              <button className="btn-primary"
                      style={{ width: "100%", fontSize: 11, padding: "6px 8px", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                <Download size={11} /> Download
              </button>
            </a>
            <button className="btn-ghost" onClick={generate} disabled={busy} title="Re-render"
                    style={{ fontSize: 11, padding: "6px 8px" }}>
              {busy ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />}
            </button>
          </>
        )}
      </div>
      {error && <div style={{ padding: 8, fontSize: 10, color: "#ef4444", borderTop: "1px solid var(--border)" }}>{error}</div>}
    </div>
  );
}

function ReelScript({ script }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {script.hook && (
        <div className="panel" style={{ padding: 10 }}>
          <div style={{ fontSize: 10, letterSpacing: 0.5, opacity: 0.55, textTransform: "uppercase" }}>Hook (first 1-2s)</div>
          <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{script.hook}</div>
        </div>
      )}
      {Array.isArray(script.beats) && script.beats.length > 0 && (
        <div className="panel" style={{ padding: 10 }}>
          <div style={{ fontSize: 10, letterSpacing: 0.5, opacity: 0.55, textTransform: "uppercase", marginBottom: 6 }}>Shot list</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.5, display: "grid", gap: 4 }}>
            {script.beats.map((b, i) => <li key={i}>{b}</li>)}
          </ol>
        </div>
      )}
      {script.cta && (
        <div className="panel" style={{ padding: 10 }}>
          <div style={{ fontSize: 10, letterSpacing: 0.5, opacity: 0.55, textTransform: "uppercase" }}>CTA</div>
          <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{script.cta}</div>
        </div>
      )}
      {script.audio_suggestion && (
        <div style={{ fontSize: 11, opacity: 0.6, fontStyle: "italic" }}>
          🎵 Audio: {script.audio_suggestion}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AGENTS PANEL
// ═══════════════════════════════════════════════════════════════════
function AgentsPanel({ refreshKey, onChange }) {
  const [agents, setAgents] = useState(null);
  const [error,  setError]  = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [runMsg, setRunMsg] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const j = await apiCall("hashway-ops-agents", { action: "list" });
      setAgents(j.data || []);
    } catch (e) { setError(e.message); setAgents([]); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const toggle = async (a) => {
    setBusyId(a.id);
    try {
      await apiCall("hashway-ops-agents", { action: "toggle", agent_id: a.id, enabled: !a.enabled });
      await load();
    } catch (e) { alert(`Toggle failed: ${e.message}`); }
    finally { setBusyId(null); }
  };

  const runNow = async (a) => {
    setBusyId(a.id); setRunMsg(null);
    try {
      const j = await apiCall("hashway-ops-run-agent", { agent_id: a.id });
      setRunMsg({ agent: a.name, ...j });
      await load(); onChange?.();
    } catch (e) {
      setRunMsg({ agent: a.name, error: e.message });
    } finally { setBusyId(null); }
  };

  if (agents === null) return <LoadingPanel label="Loading agents…" />;
  if (error) return <ErrorPanel error={error} onRetry={load} />;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {runMsg && (
        <div className="panel" style={{
          padding: 12, borderLeft: `3px solid ${runMsg.error ? "#ef4444" : "#22c55e"}`,
          fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>
            <b>{runMsg.agent}</b> — {runMsg.error
              ? `failed: ${runMsg.error}`
              : `${runMsg.summary || "ok"}${runMsg.tokens ? ` · ${runMsg.tokens.input || 0}↑ / ${runMsg.tokens.output || 0}↓ tokens` : ""}`}
          </span>
          <button className="btn-ghost" onClick={() => setRunMsg(null)} style={{ padding: 4 }}>
            <XCircle size={12} />
          </button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        {agents.map(a => (
          <AgentCard key={a.id} agent={a} busy={busyId === a.id}
                     onToggle={() => toggle(a)} onRun={() => runNow(a)} />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent, busy, onToggle, onRun }) {
  const phaseColor = agent.phase === 1 ? "#22c55e" : agent.phase === 2 ? "#f59e0b" : "var(--text-mute)";
  const lastRunRel = agent.last_run_at ? timeAgo(agent.last_run_at) : "never";
  return (
    <div className="panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{agent.name}</div>
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 3, lineHeight: 1.4 }}>{agent.description}</div>
        </div>
        <span style={{
          fontSize: 10, padding: "3px 8px", borderRadius: 999, letterSpacing: 0.5,
          background: "var(--bg-elevated)", color: phaseColor,
        }}>
          PHASE {agent.phase}
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 11, opacity: 0.6 }}>
        <span>last run: {lastRunRel}</span>
        {agent.last_run_status && (
          <span style={{ color: agent.last_run_status === "succeeded" ? "#22c55e" : "#ef4444" }}>
            · {agent.last_run_status}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
        <button className="btn-primary" disabled={busy || !agent.enabled} onClick={onRun}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, padding: "8px 10px" }}>
          {busy ? <Loader2 size={12} className="spin" /> : <Play size={12} />} Run now
        </button>
        <button className="btn-ghost" disabled={busy} onClick={onToggle}
                title={agent.enabled ? "Disable" : "Enable"}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "8px 12px",
                         color: agent.enabled ? "#22c55e" : "var(--text-mute)" }}>
          <Power size={12} /> {agent.enabled ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONNECTION WIZARD (a.k.a. "Integrations" tab)
// Live status per service, one-click test, expandable setup steps with
// copy buttons, deep links, client-side secret generator.
// ═══════════════════════════════════════════════════════════════════

const WEBHOOK_BASE = typeof window !== "undefined" && window.location.hostname === "localhost"
  ? "http://localhost:5173"
  : "https://pressroom-ops-v2.vercel.app";

// Per-service setup recipes. Keep these tight — the wizard renders
// these step lists with copy buttons + deep links automatically.
const SETUP = {
  anthropic: {
    short: "Required for any agent to think. Without this, 'Run now' returns 503.",
    cost:  "Pay-as-you-go. ~₹500/mo at 4 runs/day across enabled agents.",
    envVars: ["ANTHROPIC_API_KEY"],
    steps: [
      { do: "Sign in to Anthropic Console", link: "https://console.anthropic.com/settings/keys" },
      { do: "Click 'Create Key' · name it 'pressroom-vercel' · copy the sk-ant-... value" },
      { do: "Open your Vercel project's env vars", link: "https://vercel.com/dashboard" },
      { do: "Add ANTHROPIC_API_KEY (Production + Preview) · paste the key · Save" },
      { do: "Redeploy: Deployments → ⋯ → Redeploy" },
      { do: "Come back here · click 'Test connection' →", terminal: true },
    ],
  },
  aisensy: {
    short: "WhatsApp Business for CX replies + order notifications + daily founder brief.",
    cost:  "₹999/mo AiSensy Basic plan + ~₹0.50/message for outbound conversations.",
    envVars: ["AISENSY_API_KEY", "HASHWAY_WA_WEBHOOK_SECRET"],
    webhookUrl: `${WEBHOOK_BASE}/api/hashway-wa-webhook`,
    needsSecret: true,
    steps: [
      { do: "Sign up at aisensy.com (Basic plan ₹999/mo)", link: "https://www.aisensy.com" },
      { do: "Complete embedded Meta signup — link your Business Manager, verify number (~10 min you + 1-2d Meta wait)" },
      { do: "Submit 5 message templates from WA_SETUP.md for Meta approval (~3 min each + 1-2d wait per)" },
      { do: "Settings → API Key → copy your API key" },
      { do: "Settings → Webhooks → set URL to the value below · add header `x-hashway-webhook-secret` with the generated secret below" },
      { do: "Add both env vars (below) to Vercel + redeploy" },
      { do: "Test connection here", terminal: true },
    ],
    docRef: "See WA_SETUP.md in the repo for the full guide.",
  },
  meta_ads: {
    short: "Marketing agent analyzes Meta Ads (FB + IG). Read-only. No app review needed for your own data.",
    cost:  "Free on Meta's side (Graph API). Your ad spend is separate.",
    envVars: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
    steps: [
      { do: "At business.facebook.com confirm you have a Business Manager (same one used for AiSensy)", link: "https://business.facebook.com" },
      { do: "At developers.facebook.com → My Apps → Create App → Business → name 'Hashway Ops'", link: "https://developers.facebook.com/apps" },
      { do: "Business Manager → Users → System Users → Add → 'hashway-ops-agent' · Admin" },
      { do: "Add Assets → pick Ad Accounts → select Hashway · grant 'Manage campaigns' permission" },
      { do: "Generate New Token → pick 'Hashway Ops' app · scopes: ads_read + business_management · Never expires" },
      { do: "Copy the token (shown once). From Ads Manager copy the act_XXXXXXX account id" },
      { do: "Drop both env vars in Vercel + redeploy" },
      { do: "Test connection here", terminal: true },
    ],
  },
  shopify: {
    short: "Already wired. The pressroom custom app syncs orders into shopify_orders every minute.",
    cost:  "Included in your Shopify plan.",
    envVars: [],
    steps: [],
  },
  delhivery: {
    short: "Production token in use for tracking. Token is per-session (not stored in env), so live API ping isn't auto.",
    cost:  "Included in your Delhivery account.",
    envVars: [],
    steps: [],
  },
  google_search_console: {
    short: "Powers the SEO agent. Phase 2 — setup guide will be generated when you green-light SEO.",
    cost:  "Free on Google's side.",
    envVars: ["GOOGLE_SC_CLIENT_ID", "GOOGLE_SC_CLIENT_SECRET", "GOOGLE_SC_REFRESH_TOKEN"],
    steps: [
      { do: "Ping me with 'go SEO' and I'll build the OAuth flow + step-by-step setup guide for this." },
    ],
  },
};

function genWebhookSecret() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
}

function Integrations({ refreshKey }) {
  const [rows,  setRows]  = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [testing, setTesting] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [generatedSecrets, setGeneratedSecrets] = useState({});
  const [copiedKey, setCopiedKey] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error } = await supabase
        .from("hashway_ops_integrations").select("*").order("display_name");
      if (error) throw error;
      setRows(data || []);
    } catch (e) { setError(e.message); setRows([]); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const test = async (service) => {
    setTesting(service);
    try {
      const j = await apiCall("hashway-ops-test-connection", { service });
      setTestResults(r => ({ ...r, [service]: j }));
      await load();
    } catch (e) {
      setTestResults(r => ({ ...r, [service]: { ok: false, message: e.message } }));
    } finally { setTesting(null); }
  };

  const copy = async (key, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1200);
    } catch { alert("Copy failed — select and Cmd+C the value manually."); }
  };

  if (rows === null) return <LoadingPanel label="Loading wizard…" />;
  if (error) return <ErrorPanel error={error} onRetry={load} />;

  const readyCount = rows.filter(r => r.status === "ready").length;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="panel" style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Connection Wizard</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>
            {readyCount}/{rows.length} connected · click any card to see what's left
          </div>
        </div>
        <button className="btn-ghost" onClick={load} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {rows.map(i => {
        const recipe = SETUP[i.service] || { short: i.notes, steps: [], envVars: [] };
        const isOpen = openId === i.id;
        const isReady = i.status === "ready";
        const isError = i.status === "error";
        const result = testResults[i.service];
        const sCol = isReady ? "#22c55e" : isError ? "#ef4444" : "#f59e0b";

        return (
          <div key={i.id} className="panel" style={{ padding: 0, overflow: "hidden", borderLeft: `3px solid ${sCol}` }}>
            <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
              {isReady ? <CheckCircle2 size={16} style={{ color: sCol, flexShrink: 0 }} />
                : isError ? <XCircle size={16} style={{ color: sCol, flexShrink: 0 }} />
                : <Circle size={16} style={{ color: sCol, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{i.display_name}</div>
                <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>{recipe.short || i.notes}</div>
                {result && (
                  <div style={{ fontSize: 11, marginTop: 4, color: result.ok ? "#22c55e" : "#ef4444" }}>
                    {result.ok ? "✓ " : "✗ "}{result.message}
                  </div>
                )}
                {!result && i.last_ok_at && (
                  <div style={{ fontSize: 10, opacity: 0.45, marginTop: 4 }}>
                    last ok: {timeAgo(i.last_ok_at)}
                  </div>
                )}
                {!result && i.last_error && (
                  <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>✗ {i.last_error}</div>
                )}
              </div>
              <button className="btn-ghost" disabled={testing === i.service} onClick={() => test(i.service)}
                      style={{ fontSize: 12, padding: "6px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                {testing === i.service ? <Loader2 size={12} className="spin" /> : <Plug size={12} />}
                Test
              </button>
              <button className="btn-ghost" onClick={() => setOpenId(isOpen ? null : i.id)} style={{ padding: 6 }}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            </div>

            {isOpen && (
              <div style={{ borderTop: "1px solid var(--border)", padding: 14, background: "var(--bg-main)", display: "grid", gap: 14 }}>
                {recipe.cost && (
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    <b style={{ opacity: 0.85 }}>Cost:</b> {recipe.cost}
                  </div>
                )}

                {recipe.webhookUrl && (
                  <CopyRow label="Webhook URL (paste in AiSensy)" value={recipe.webhookUrl}
                           copyKey={`${i.service}-url`} copiedKey={copiedKey} onCopy={copy} />
                )}

                {recipe.needsSecret && (
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 0.5, opacity: 0.55, textTransform: "uppercase", marginBottom: 6 }}>
                      Webhook Secret (paste same value in BOTH AiSensy header AND Vercel env)
                    </div>
                    {generatedSecrets[i.service] ? (
                      <CopyRow label="" value={generatedSecrets[i.service]}
                               copyKey={`${i.service}-secret`} copiedKey={copiedKey} onCopy={copy} compact />
                    ) : (
                      <button className="btn-primary" onClick={() => setGeneratedSecrets(s => ({ ...s, [i.service]: genWebhookSecret() }))}
                              style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                        <Wand2 size={12} /> Generate secure secret
                      </button>
                    )}
                  </div>
                )}

                {recipe.envVars?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 0.5, opacity: 0.55, textTransform: "uppercase", marginBottom: 6 }}>
                      Env vars to set in Vercel
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {recipe.envVars.map(v => (
                        <CopyRow key={v} label="" value={v} copyKey={`env-${v}`} copiedKey={copiedKey} onCopy={copy} compact mono />
                      ))}
                    </div>
                  </div>
                )}

                {recipe.steps?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: 0.5, opacity: 0.55, textTransform: "uppercase", marginBottom: 8 }}>
                      Steps
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
                      {recipe.steps.map((s, idx) => (
                        <li key={idx} style={{ fontSize: 12, lineHeight: 1.5, opacity: s.terminal ? 0.85 : 0.75 }}>
                          {s.do}
                          {s.link && (
                            <a href={s.link} target="_blank" rel="noreferrer"
                               style={{ marginLeft: 6, color: "var(--ink-accent)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                              open <ExternalLink size={10} />
                            </a>
                          )}
                          {s.note && <span style={{ opacity: 0.5 }}> — {s.note}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {recipe.docRef && (
                  <div style={{ fontSize: 11, opacity: 0.55, fontStyle: "italic" }}>{recipe.docRef}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CopyRow({ label, value, copyKey, copiedKey, onCopy, compact, mono }) {
  const copied = copiedKey === copyKey;
  return (
    <div>
      {label && <div style={{ fontSize: 10, letterSpacing: 0.5, opacity: 0.55, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: compact ? "6px 10px" : 10,
                    background: "var(--bg-elevated)", borderRadius: 6, border: "1px solid var(--border)" }}>
        <code style={{ flex: 1, fontSize: 11, fontFamily: mono ? "ui-monospace, monospace" : "ui-monospace, monospace",
                       overflow: "auto", whiteSpace: "nowrap", opacity: 0.85 }}>
          {value}
        </code>
        <button className="btn-ghost" onClick={() => onCopy(copyKey, value)}
                style={{ fontSize: 11, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
                         color: copied ? "#22c55e" : "var(--text)" }}>
          {copied ? <><CheckCircle2 size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════════
function Overview({ refreshKey }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    (async () => {
      const [tasks, agents, integ] = await Promise.all([
        supabase.from("hashway_ops_tasks").select("status"),
        supabase.from("hashway_ops_agents").select("enabled"),
        supabase.from("hashway_ops_integrations").select("status"),
      ]);
      setStats({
        pending:    (tasks.data || []).filter(t => t.status === "pending").length,
        executed:   (tasks.data || []).filter(t => t.status === "executed").length,
        failed:     (tasks.data || []).filter(t => t.status === "failed").length,
        agents_on:  (agents.data || []).filter(a => a.enabled).length,
        agents_total: (agents.data || []).length,
        integ_ready: (integ.data || []).filter(i => i.status === "ready").length,
        integ_total: (integ.data || []).length,
      });
    })();
  }, [refreshKey]);

  if (!stats) return <LoadingPanel label="Loading…" />;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <StatTile label="Pending approvals"   value={stats.pending}   sub="awaiting your review" />
        <StatTile label="Executed today"      value={stats.executed}  sub="approved & ran" />
        <StatTile label="Execution failed"    value={stats.failed}    sub="needs retry" />
        <StatTile label="Agents enabled"      value={`${stats.agents_on}/${stats.agents_total}`} sub="CX + Ops live (Phase 1)" />
        <StatTile label="Integrations ready"  value={`${stats.integ_ready}/${stats.integ_total}`} sub="Shopify · Delhivery" />
      </div>

      <div className="panel" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Sparkles size={16} />
          <div style={{ fontWeight: 600, fontSize: 13, letterSpacing: 0.4 }}>PHASE 1 NOTES</div>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, opacity: 0.75, lineHeight: 1.65 }}>
          <li><b>Approval-first mode</b> — nothing fires without your one-tap approve.</li>
          <li><b>Dry-run posture</b> — Shopify refunds, customer messages and Delhivery actions are <em>recorded</em> on approve but not actually called yet. Flip the switch in Phase 1.1 once you've validated a few approvals.</li>
          <li>Internal flags (escalations, dispatch-delay) execute fully on approve — they're just status changes in our DB.</li>
          <li><b>To enable agent runs</b>: set <code>ANTHROPIC_API_KEY</code> in your Vercel env. Until then "Run now" returns a 503 telling you so.</li>
          <li>Phase 2 (Marketing + Finance) needs the Meta Ads token. Phase 3 (Creative · Community · Production · Ecom) needs WhatsApp + community feeds.</li>
        </ul>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FOUNDER BUSINESS COCKPIT — Finance · Inventory · Purchases
// Sales come live from Shopify; inventory is maintained manually here.
// ═══════════════════════════════════════════════════════════════════
const money = (n) => `₹${Math.round(Number(n || 0)).toLocaleString("en-IN")}`;
const finCall = (action, body = {}) => apiCall("hashway-ops-finance", { action, ...body }).then(j => j.data);

const PERIODS = [
  { id: "month", label: "This month" },
  { id: "30d",   label: "30 days" },
  { id: "90d",   label: "90 days" },
  { id: "all",   label: "All time" },
];

// ─── tiny form input ────────────────────────────────────────────────
function In({ label, value, onChange, type = "text", placeholder, width, list, options }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 10, letterSpacing: 0.4, opacity: 0.7,
                    textTransform: "uppercase", flex: width ? `0 0 ${width}` : 1, minWidth: 0 }}>
      {label}
      {options ? (
        <select value={value} onChange={e => onChange(e.target.value)}
                style={{ padding: "7px 8px", fontSize: 12, background: "var(--bg-main)",
                         border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} value={value} placeholder={placeholder} list={list}
              onChange={e => onChange(e.target.value)}
              style={{ padding: "7px 8px", fontSize: 12, background: "var(--bg-main)",
                       border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)" }} />
      )}
    </label>
  );
}

function Pill({ tone, children }) {
  const c = tone === "red" ? "#ef4444" : tone === "amber" ? "#f59e0b" : tone === "green" ? "#22c55e" : "var(--text-mute)";
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                        background: "var(--bg-elevated)", color: c, letterSpacing: 0.3 }}>{children}</span>;
}

// ═══════════════════════════════════════════════════════════════════
// FINANCE — P&L · bank/cashbook · sales trend
// ═══════════════════════════════════════════════════════════════════
function FinancePanel({ refreshKey }) {
  const [period, setPeriod] = useState("month");
  const [sum, setSum]   = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const bump = () => setReload(r => r + 1);

  useEffect(() => {
    let alive = true;
    setSum(null); setError(null);
    finCall("summary", { period }).then(d => { if (alive) setSum(d); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [period, refreshKey, reload]);

  if (error) return <ErrorPanel error={error} onRetry={bump} />;
  if (!sum)  return <LoadingPanel label="Crunching the books…" />;

  const p = sum.pnl, b = sum.bank, inv = sum.inventory;
  const maxRev = Math.max(1, ...sum.series.map(s => s.revenue));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* period selector */}
      <div style={{ display: "flex", gap: 6 }}>
        {PERIODS.map(pp => (
          <button key={pp.id} onClick={() => setPeriod(pp.id)} className="btn-ghost"
            style={{ fontSize: 11, padding: "5px 11px", borderRadius: 999,
                     background: period === pp.id ? "var(--bg-elevated)" : "transparent",
                     opacity: period === pp.id ? 1 : 0.6 }}>{pp.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn-ghost" onClick={bump} style={{ fontSize: 11, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StatTile label="Sales · booked" value={money(p.revenue_booked)} sub={`${p.orders} orders · AOV ${money(p.aov)}`} />
        <StatTile label="Collected" value={money(p.revenue_collected)} sub={`${p.units_sold} units sold`} />
        <StatTile label={p.net_profit >= 0 ? "Net profit" : "Net loss"} value={money(Math.abs(p.net_profit))} sub={`margin ${p.margin}%`} />
        <StatTile label={`${b.label} balance`} value={money(b.balance)} sub={`in ${money(b.period_in)} · out ${money(b.period_out)} this period`} />
      </div>

      {/* P&L waterfall */}
      <div className="panel" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <TrendingUp size={15} /><div style={{ fontWeight: 600, fontSize: 13, letterSpacing: 0.3 }}>PROFIT &amp; LOSS</div>
          <span style={{ fontSize: 11, opacity: 0.5 }}>· {PERIODS.find(x => x.id === period)?.label}</span>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <PnlRow label="Revenue (booked)" value={p.revenue_booked} tone="green" />
          <PnlRow label="− COGS (est. from unit costs)" value={-p.cogs} tone="red"
                  hint={p.cogs_unmapped_units > 0 ? `${p.cogs_unmapped_units} units sold have no cost mapped — set unit cost in Inventory` : null} />
          <PnlRow label="= Gross profit" value={p.gross_profit} strong divider />
          <PnlRow label="− Operating expenses" value={-p.opex} tone="red" />
          <PnlRow label={p.net_profit >= 0 ? "= Net profit" : "= Net loss"} value={p.net_profit} strong big divider
                  tone={p.net_profit >= 0 ? "green" : "red"} />
        </div>
        <div style={{ fontSize: 10.5, opacity: 0.5, marginTop: 12, lineHeight: 1.5 }}>
          Purchases logged this period: {money(p.purchases)} (recorded as stock buys, excluded from operating expenses to avoid double counting COGS).
        </div>
      </div>

      {/* Sales trend */}
      {sum.series.length > 0 && (
        <div className="panel" style={{ padding: 18 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Monthly sales</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 130 }}>
            {sum.series.map(s => (
              <div key={s.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 10, opacity: 0.6 }}>{money(s.revenue / 1000)}K</div>
                <div title={`${s.month}: ${money(s.revenue)} · ${s.orders} orders`}
                     style={{ width: "70%", background: "var(--ink-accent, #84cc16)", borderRadius: "4px 4px 0 0",
                              height: `${Math.max(4, (s.revenue / maxRev) * 90)}px`, opacity: 0.85 }} />
                <div style={{ fontSize: 10, opacity: 0.55 }}>{s.month.slice(2)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cashbook */}
      <Cashbook onChange={bump} />

      {/* Opening balance settings */}
      <FinanceSettings settings={sum.settings} onSaved={bump} />
    </div>
  );
}

function PnlRow({ label, value, tone, strong, big, divider, hint }) {
  const col = tone === "green" ? "#22c55e" : tone === "red" ? "#ef4444" : "var(--text)";
  return (
    <div style={{ borderTop: divider ? "1px solid var(--border)" : "none", paddingTop: divider ? 8 : 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: strong ? 13 : 12, fontWeight: strong ? 700 : 400, opacity: strong ? 1 : 0.8 }}>{label}</span>
        <span style={{ fontSize: big ? 20 : strong ? 15 : 13, fontWeight: strong ? 700 : 500, color: col, fontVariantNumeric: "tabular-nums" }}>
          {value < 0 ? "−" : ""}{money(Math.abs(value))}
        </span>
      </div>
      {hint && <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 3 }}>⚠ {hint}</div>}
    </div>
  );
}

const LEDGER_CATS = {
  in:  ["Shopify payout", "COD remittance", "Capital infusion", "Refund received", "Other income"],
  out: ["Salaries", "Rent", "Marketing / Ads", "Shipping", "Packaging", "Utilities", "Software", "GST / Tax", "Misc expense"],
};

function Cashbook({ onChange }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), direction: "out", amount: "", category: LEDGER_CATS.out[0], label: "", method: "bank", note: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { finCall("ledger_list", { limit: 60 }).then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!f.amount || Number(f.amount) <= 0) { alert("Enter an amount"); return; }
    setBusy(true);
    try {
      await finCall("ledger_add", f);
      setF({ ...f, amount: "", label: "", note: "" }); setOpen(false);
      load(); onChange?.();
    } catch (e) { alert("Failed: " + e.message); } finally { setBusy(false); }
  };
  const del = async (id) => {
    if (!confirm("Delete this entry?")) return;
    try { await finCall("ledger_delete", { id }); load(); onChange?.(); } catch (e) { alert(e.message); }
  };

  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Wallet size={15} /><div style={{ fontWeight: 600, fontSize: 13 }}>Cashbook</div>
          <span style={{ fontSize: 11, opacity: 0.5 }}>· money in &amp; out</span>
        </div>
        <button className="btn-primary" onClick={() => setOpen(o => !o)}
                style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}>
          <Plus size={12} /> Record entry
        </button>
      </div>

      {open && (
        <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 14, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <In label="Direction" value={f.direction} options={[{ value: "out", label: "Money out" }, { value: "in", label: "Money in" }]}
                onChange={v => setF({ ...f, direction: v, category: LEDGER_CATS[v][0] })} width="130px" />
            <In label="Amount ₹" value={f.amount} onChange={v => setF({ ...f, amount: v })} type="number" />
            <In label="Date" value={f.date} onChange={v => setF({ ...f, date: v })} type="date" width="150px" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <In label="Category" value={f.category} options={LEDGER_CATS[f.direction].map(c => ({ value: c, label: c }))} onChange={v => setF({ ...f, category: v })} />
            <In label="Method" value={f.method} options={[{ value: "bank", label: "Bank" }, { value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }]} onChange={v => setF({ ...f, method: v })} width="120px" />
          </div>
          <In label="Label / who" value={f.label} onChange={v => setF({ ...f, label: v })} placeholder="e.g. Razorpay payout, electricity bill" />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={() => setOpen(false)} style={{ fontSize: 12 }}>Cancel</button>
            <button className="btn-primary" disabled={busy} onClick={submit} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
              {busy ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />} Save
            </button>
          </div>
        </div>
      )}

      {!rows ? <LoadingPanel label="Loading cashbook…" /> :
        rows.length === 0 ? <Muted>No entries yet. Record your bank payouts and expenses to track the real balance.</Muted> : (
        <div style={{ display: "grid", gap: 2 }}>
          {rows.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderBottom: "1px solid var(--border)" }}>
              {r.direction === "in" ? <ArrowDownRight size={15} style={{ color: "#22c55e", flexShrink: 0 }} />
                                    : <ArrowUpRight   size={15} style={{ color: "#ef4444", flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{r.label || r.category || "—"}</div>
                <div style={{ fontSize: 10, opacity: 0.5 }}>{r.date} · {r.category} · {r.method}{r.source === "purchase" ? " · stock buy" : ""}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: r.direction === "in" ? "#22c55e" : "#ef4444", fontVariantNumeric: "tabular-nums" }}>
                {r.direction === "in" ? "+" : "−"}{money(r.amount)}
              </div>
              <button className="btn-ghost" onClick={() => del(r.id)} style={{ padding: 4, opacity: 0.4 }}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FinanceSettings({ settings, onSaved }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    bank_label: settings.bank_label || "Primary Bank",
    bank_opening_balance: settings.bank_opening_balance ?? 0,
    cash_opening_balance: settings.cash_opening_balance ?? 0,
    low_stock_default: settings.low_stock_default ?? 5,
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await finCall("settings_save", f); setOpen(false); onSaved?.(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="panel" style={{ padding: 14 }}>
      <button className="btn-ghost" onClick={() => setOpen(o => !o)}
              style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 12, width: "100%" }}>
        <Settings size={13} /> Opening balances &amp; thresholds
        {open ? <ChevronDown size={13} style={{ marginLeft: "auto", opacity: 0.5 }} /> : <ChevronRight size={13} style={{ marginLeft: "auto", opacity: 0.5 }} />}
      </button>
      {open && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <In label="Bank label" value={f.bank_label} onChange={v => setF({ ...f, bank_label: v })} />
            <In label="Bank opening ₹" value={f.bank_opening_balance} onChange={v => setF({ ...f, bank_opening_balance: v })} type="number" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <In label="Cash opening ₹" value={f.cash_opening_balance} onChange={v => setF({ ...f, cash_opening_balance: v })} type="number" />
            <In label="Low-stock default" value={f.low_stock_default} onChange={v => setF({ ...f, low_stock_default: v })} type="number" />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn-primary" disabled={busy} onClick={save} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
              {busy ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />} Save
            </button>
          </div>
          <div style={{ fontSize: 10.5, opacity: 0.5 }}>Balance = opening + all money in − all money out from the cashbook.</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INVENTORY — manual stock · low-stock flags · AI reorder
// ═══════════════════════════════════════════════════════════════════
const SIZES = ["", "XS", "S", "M", "L", "XL", "XXL"];
const blankItem = () => ({ id: null, product: "", variant: "", category: "", sku: "", on_hand: 0, reorder_point: 5, unit_cost: "", sell_price: "", vendor_id: "", note: "" });

function InventoryPanel({ refreshKey, onChange }) {
  const [items, setItems] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [error, setError] = useState(null);
  const [edit, setEdit] = useState(null);     // item being edited (or blank for new)
  const [reload, setReload] = useState(0);
  const bump = () => { setReload(r => r + 1); onChange?.(); };

  useEffect(() => {
    let alive = true;
    setItems(null); setError(null);
    Promise.all([finCall("inv_list"), finCall("vendor_list")])
      .then(([its, vs]) => { if (alive) { setItems(its); setVendors(vs); } })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [refreshKey, reload]);

  const stats = useMemo(() => {
    const its = items || [];
    let units = 0, vc = 0, vs = 0, low = 0, out = 0;
    for (const i of its) {
      const oh = Number(i.on_hand) || 0;
      units += oh; vc += oh * (Number(i.unit_cost) || 0); vs += oh * (Number(i.sell_price) || 0);
      const rp = Number(i.reorder_point) || 0;
      if (oh <= 0) out++; else if (oh <= rp) low++;
    }
    return { items: its.length, units, vc, vs, low, out };
  }, [items]);

  const adjust = async (id, delta) => {
    // optimistic
    setItems(its => its.map(i => i.id === id ? { ...i, on_hand: Math.max(0, (Number(i.on_hand) || 0) + delta) } : i));
    try { await finCall("inv_adjust", { id, delta }); onChange?.(); }
    catch (e) { alert(e.message); setReload(r => r + 1); }
  };
  const del = async (id) => {
    if (!confirm("Delete this item?")) return;
    try { await finCall("inv_delete", { id }); bump(); } catch (e) { alert(e.message); }
  };

  if (error) return <ErrorPanel error={error} onRetry={() => setReload(r => r + 1)} />;
  if (!items) return <LoadingPanel label="Loading inventory…" />;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <StatTile label="SKUs" value={stats.items} sub={`${stats.units} units on hand`} />
        <StatTile label="Stock value · cost" value={money(stats.vc)} sub="what it cost you" />
        <StatTile label="Stock value · retail" value={money(stats.vs)} sub="at selling price" />
        <StatTile label="Low / Out" value={`${stats.low} / ${stats.out}`} sub="needs attention" />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><Package size={15} /> Warehouse stock</div>
        <button className="btn-primary" onClick={() => setEdit(blankItem())}
                style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}>
          <Plus size={12} /> Add item
        </button>
      </div>

      {edit && <ItemForm item={edit} vendors={vendors} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); bump(); }} />}

      {items.length === 0 ? (
        <div className="empty panel" style={{ padding: 40, textAlign: "center" }}>
          <Boxes size={26} style={{ opacity: 0.4, marginBottom: 10 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No stock added yet</div>
          <div style={{ fontSize: 12, opacity: 0.6, maxWidth: 360, margin: "0 auto", lineHeight: 1.5 }}>
            Add your warehouse items with on-hand qty, unit cost and selling price. Low-stock flags and AI reorder advice kick in once stock is tracked.
          </div>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          {items.map((i, idx) => {
            const oh = Number(i.on_hand) || 0;
            const rp = Number(i.reorder_point) || 0;
            const tone = oh <= 0 ? "red" : oh <= rp ? "amber" : "green";
            return (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                                       borderTop: idx ? "1px solid var(--border)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                    {i.product}{i.variant ? <span style={{ opacity: 0.55, fontWeight: 400 }}> · {i.variant}</span> : null}
                  </div>
                  <div style={{ fontSize: 10.5, opacity: 0.5, marginTop: 2 }}>
                    cost {money(i.unit_cost)} · sell {money(i.sell_price)}{i.category ? ` · ${i.category}` : ""} · reorder ≤ {rp}
                  </div>
                </div>
                {oh <= 0 ? <Pill tone="red">OUT</Pill> : oh <= rp ? <Pill tone="amber">LOW</Pill> : null}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button className="btn-ghost" onClick={() => adjust(i.id, -1)} style={{ padding: "2px 8px", fontSize: 14 }}>−</button>
                  <span style={{ minWidth: 34, textAlign: "center", fontSize: 14, fontWeight: 700, color: tone === "red" ? "#ef4444" : tone === "amber" ? "#f59e0b" : "var(--text)" }}>{oh}</span>
                  <button className="btn-ghost" onClick={() => adjust(i.id, +1)} style={{ padding: "2px 8px", fontSize: 14 }}>+</button>
                </div>
                <button className="btn-ghost" onClick={() => setEdit(i)} style={{ padding: 5, opacity: 0.55 }}><Settings size={13} /></button>
                <button className="btn-ghost" onClick={() => del(i.id)} style={{ padding: 5, opacity: 0.4 }}><Trash2 size={13} /></button>
              </div>
            );
          })}
        </div>
      )}

      <ReorderEngine />
    </div>
  );
}

function ItemForm({ item, vendors, onClose, onSaved }) {
  const [f, setF] = useState({ ...item });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.product) { alert("Product name required"); return; }
    setBusy(true);
    try { await finCall("inv_upsert", f); onSaved(); } catch (e) { alert("Failed: " + e.message); } finally { setBusy(false); }
  };
  return (
    <div className="panel" style={{ padding: 16, border: "1px solid var(--ink-accent, #84cc16)", display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{item.id ? "Edit item" : "New item"}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <In label="Product" value={f.product} onChange={v => setF({ ...f, product: v })} placeholder="HASHWAY Archives Oxford Shirt - Blue" />
        <In label="Size / variant" value={f.variant} options={SIZES.map(s => ({ value: s, label: s || "—" }))} onChange={v => setF({ ...f, variant: v })} width="120px" />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <In label="On hand" value={f.on_hand} onChange={v => setF({ ...f, on_hand: v })} type="number" width="100px" />
        <In label="Reorder pt" value={f.reorder_point} onChange={v => setF({ ...f, reorder_point: v })} type="number" width="100px" />
        <In label="Unit cost ₹" value={f.unit_cost} onChange={v => setF({ ...f, unit_cost: v })} type="number" />
        <In label="Sell price ₹" value={f.sell_price} onChange={v => setF({ ...f, sell_price: v })} type="number" />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <In label="Category" value={f.category} onChange={v => setF({ ...f, category: v })} placeholder="Shirts" />
        <In label="Vendor" value={f.vendor_id || ""} options={[{ value: "", label: "—" }, ...vendors.map(v => ({ value: v.id, label: v.name }))]} onChange={v => setF({ ...f, vendor_id: v })} />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn-ghost" onClick={onClose} style={{ fontSize: 12 }}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={save} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
          {busy ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />} Save
        </button>
      </div>
    </div>
  );
}

function ReorderEngine() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const run = useCallback(async (ai) => {
    ai ? setAiBusy(true) : setBusy(true);
    try { setData(await finCall("reorder", { ai: !!ai })); } catch (e) { alert(e.message); } finally { ai ? setAiBusy(false) : setBusy(false); }
  }, []);
  useEffect(() => { run(false); }, [run]);

  const recs = data?.recommendations || [];
  return (
    <div className="panel" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Brain size={15} /><div style={{ fontWeight: 600, fontSize: 13 }}>Reorder advisor</div>
          <span style={{ fontSize: 11, opacity: 0.5 }}>· from 30-day Shopify sell-through</span>
        </div>
        <button className="btn-primary" disabled={aiBusy} onClick={() => run(true)}
                style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}>
          {aiBusy ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />} Ask AI for a buy plan
        </button>
      </div>

      {data?.ai && (
        <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 14,
                      fontSize: 12.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
          {data.ai}
        </div>
      )}
      {data?.ai_error && <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 10 }}>AI unavailable: {data.ai_error} — showing rule-based list.</div>}

      {busy && !data ? <LoadingPanel label="Analysing sell-through…" /> :
        recs.length === 0 ? <Muted>Nothing to reorder — every tracked SKU is above its reorder point with healthy cover. 🎉</Muted> : (
        <div style={{ display: "grid", gap: 2 }}>
          {recs.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 6px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.product}{r.variant ? ` · ${r.variant}` : ""}</div>
                <div style={{ fontSize: 10.5, opacity: 0.55, marginTop: 2 }}>
                  on-hand {r.on_hand} · sold {r.sold_30d}/30d{r.days_cover != null ? ` · ${r.days_cover}d cover` : ""} · {r.reason}
                </div>
              </div>
              <Pill tone={r.urgency >= 3 ? "red" : r.urgency === 2 ? "amber" : undefined}>
                buy {r.suggest_qty}
              </Pill>
              <div style={{ fontSize: 11, opacity: 0.6, minWidth: 70, textAlign: "right" }}>{money(r.est_cost)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PURCHASES — register stock buys · vendors
// ═══════════════════════════════════════════════════════════════════
function PurchasesPanel({ refreshKey, onChange }) {
  const [purchases, setPurchases] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [openP, setOpenP] = useState(false);
  const [openV, setOpenV] = useState(false);
  const bump = () => { setReload(r => r + 1); onChange?.(); };

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([finCall("purchase_list"), finCall("vendor_list"), finCall("inv_list")])
      .then(([ps, vs, its]) => { if (alive) { setPurchases(ps); setVendors(vs); setItems(its); } })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [refreshKey, reload]);

  const delP = async (id) => { if (!confirm("Delete purchase?")) return; try { await finCall("purchase_delete", { id }); bump(); } catch (e) { alert(e.message); } };
  const delV = async (id) => { if (!confirm("Delete vendor?")) return; try { await finCall("vendor_delete", { id }); bump(); } catch (e) { alert(e.message); } };

  if (error) return <ErrorPanel error={error} onRetry={() => setReload(r => r + 1)} />;
  if (!purchases) return <LoadingPanel label="Loading purchases…" />;

  const totalSpend = purchases.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const unpaid = purchases.filter(p => !p.paid).reduce((s, p) => s + (Number(p.total) || 0), 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <StatTile label="Total purchases" value={money(totalSpend)} sub={`${purchases.length} buys`} />
        <StatTile label="Unpaid to vendors" value={money(unpaid)} sub="payables outstanding" />
        <StatTile label="Vendors" value={vendors.length} sub="suppliers" />
      </div>

      {/* Vendors */}
      <div className="panel" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: vendors.length || openV ? 12 : 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><Truck size={15} /> Vendors</div>
          <button className="btn-ghost" onClick={() => setOpenV(o => !o)} style={{ fontSize: 12, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
            <Plus size={12} /> Add vendor
          </button>
        </div>
        {openV && <VendorForm onClose={() => setOpenV(false)} onSaved={() => { setOpenV(false); bump(); }} />}
        {vendors.length > 0 && (
          <div style={{ display: "grid", gap: 2, marginTop: openV ? 12 : 0 }}>
            {vendors.map(v => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 4px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{v.name}</span>
                  <span style={{ fontSize: 10.5, opacity: 0.5, marginLeft: 8 }}>{v.contact || ""}{v.phone ? ` · ${v.phone}` : ""} · lead {v.lead_time_days}d</span>
                </div>
                <button className="btn-ghost" onClick={() => delV(v.id)} style={{ padding: 4, opacity: 0.4 }}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Purchases */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}><ShoppingCart size={15} /> Purchase register</div>
        <button className="btn-primary" onClick={() => setOpenP(o => !o)} style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}>
          <Plus size={12} /> Register purchase
        </button>
      </div>
      {openP && <PurchaseForm vendors={vendors} items={items} onClose={() => setOpenP(false)} onSaved={() => { setOpenP(false); bump(); }} />}

      {purchases.length === 0 ? (
        <Muted>No purchases registered. Log stock buys here — optionally auto-add to inventory and the cashbook.</Muted>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          {purchases.map((p, idx) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: idx ? "1px solid var(--border)" : "none" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.item}</div>
                <div style={{ fontSize: 10.5, opacity: 0.5, marginTop: 2 }}>
                  {p.date} · {p.qty} × {money(p.unit_cost)}{p.vendor_name ? ` · ${p.vendor_name}` : ""}
                </div>
              </div>
              {!p.paid && <Pill tone="amber">UNPAID</Pill>}
              <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{money(p.total)}</div>
              <button className="btn-ghost" onClick={() => delP(p.id)} style={{ padding: 5, opacity: 0.4 }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VendorForm({ onClose, onSaved }) {
  const [f, setF] = useState({ name: "", contact: "", phone: "", lead_time_days: 7, note: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.name) { alert("Vendor name required"); return; }
    setBusy(true);
    try { await finCall("vendor_add", f); onSaved(); } catch (e) { alert(e.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ background: "var(--bg-main)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <In label="Name" value={f.name} onChange={v => setF({ ...f, name: v })} placeholder="Sai Garments" />
        <In label="Contact" value={f.contact} onChange={v => setF({ ...f, contact: v })} placeholder="person" />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <In label="Phone" value={f.phone} onChange={v => setF({ ...f, phone: v })} />
        <In label="Lead time (days)" value={f.lead_time_days} onChange={v => setF({ ...f, lead_time_days: v })} type="number" width="150px" />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn-ghost" onClick={onClose} style={{ fontSize: 12 }}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={save} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
          {busy ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />} Save vendor
        </button>
      </div>
    </div>
  );
}

function PurchaseForm({ vendors, items, onClose, onSaved }) {
  const [f, setF] = useState({
    date: new Date().toISOString().slice(0, 10), vendor_id: "", item: "", inventory_id: "",
    qty: "", unit_cost: "", paid: false, note: "", bump_inventory: true, log_payment: true,
  });
  const [busy, setBusy] = useState(false);
  const total = (Number(f.qty) || 0) * (Number(f.unit_cost) || 0);

  const pickItem = (invId) => {
    const it = items.find(i => i.id === invId);
    setF(s => ({ ...s, inventory_id: invId, item: it ? `${it.product}${it.variant ? " · " + it.variant : ""}` : s.item, unit_cost: it && it.unit_cost ? it.unit_cost : s.unit_cost }));
  };
  const save = async () => {
    if (!f.item) { alert("Item required"); return; }
    setBusy(true);
    try {
      const vendor = vendors.find(v => v.id === f.vendor_id);
      await finCall("purchase_add", { ...f, total, vendor_name: vendor?.name || null });
      onSaved();
    } catch (e) { alert("Failed: " + e.message); } finally { setBusy(false); }
  };
  return (
    <div className="panel" style={{ padding: 16, border: "1px solid var(--ink-accent, #84cc16)", display: "grid", gap: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>Register purchase</div>
      <div style={{ display: "flex", gap: 8 }}>
        <In label="Date" value={f.date} onChange={v => setF({ ...f, date: v })} type="date" width="150px" />
        <In label="Vendor" value={f.vendor_id} options={[{ value: "", label: "—" }, ...vendors.map(v => ({ value: v.id, label: v.name }))]} onChange={v => setF({ ...f, vendor_id: v })} />
        <In label="Link to stock item" value={f.inventory_id} options={[{ value: "", label: "— none —" }, ...items.map(i => ({ value: i.id, label: `${i.product}${i.variant ? " · " + i.variant : ""}` }))]} onChange={pickItem} />
      </div>
      <In label="Item description" value={f.item} onChange={v => setF({ ...f, item: v })} placeholder="100 × Blank Oxford Shirt M" />
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <In label="Qty" value={f.qty} onChange={v => setF({ ...f, qty: v })} type="number" width="100px" />
        <In label="Unit cost ₹" value={f.unit_cost} onChange={v => setF({ ...f, unit_cost: v })} type="number" width="130px" />
        <div style={{ flex: 1, textAlign: "right", fontSize: 13 }}>Total: <strong>{money(total)}</strong></div>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, opacity: 0.85 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={f.paid} onChange={e => setF({ ...f, paid: e.target.checked })} /> Already paid
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: f.inventory_id ? "pointer" : "not-allowed", opacity: f.inventory_id ? 1 : 0.4 }}>
          <input type="checkbox" disabled={!f.inventory_id} checked={f.bump_inventory && !!f.inventory_id} onChange={e => setF({ ...f, bump_inventory: e.target.checked })} /> Add qty to linked stock
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={f.log_payment} onChange={e => setF({ ...f, log_payment: e.target.checked })} /> Record in cashbook
        </label>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn-ghost" onClick={onClose} style={{ fontSize: 12 }}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={save} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
          {busy ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />} Save purchase
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Small UI primitives
// ═══════════════════════════════════════════════════════════════════
function Section({ title, count, accent, children }) {
  const color = accent === "amber" ? "#f59e0b" : accent === "green" ? "#22c55e" : accent === "red" ? "#ef4444" : "var(--text)";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 11, letterSpacing: 0.5, opacity: 0.75 }}>
        <span style={{ color, textTransform: "uppercase", fontWeight: 600 }}>{title}</span>
        <span style={{ background: "var(--bg-elevated)", padding: "1px 7px", borderRadius: 999 }}>{count}</span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: 0.6, opacity: 0.55, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function KV({ label, value }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ fontSize: 10, letterSpacing: 0.5, opacity: 0.55, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 12 }}>{value}</div>
    </div>
  );
}

function Code({ obj }) {
  return (
    <pre style={{
      margin: 0, padding: 10, background: "var(--bg-main)", borderRadius: 6,
      fontSize: 11, lineHeight: 1.5, overflow: "auto", maxHeight: 240,
    }}>
      {JSON.stringify(obj || {}, null, 2)}
    </pre>
  );
}

function LoadingPanel({ label }) {
  return (
    <div className="panel" style={{ padding: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: 0.6 }}>
      <Loader2 size={16} className="spin" /> <span style={{ fontSize: 12 }}>{label}</span>
    </div>
  );
}

function ErrorPanel({ error, onRetry }) {
  return (
    <div className="panel" style={{ padding: 18, borderLeft: "3px solid #ef4444" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <AlertTriangle size={14} style={{ color: "#ef4444" }} />
        <b style={{ fontSize: 13 }}>Could not load</b>
      </div>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: onRetry ? 12 : 0 }}>{error}</div>
      {onRetry && (
        <button className="btn-ghost" onClick={onRetry} style={{ fontSize: 12 }}>Retry</button>
      )}
    </div>
  );
}

function Muted({ children }) {
  return <div style={{ fontSize: 12, opacity: 0.5, padding: "8px 0" }}>{children}</div>;
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)     return `${s}s ago`;
  if (s < 3600)   return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)  return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
