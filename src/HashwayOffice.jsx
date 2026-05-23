import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Building2, Inbox, Bot, Sparkles, Plug, Activity, Clock,
  CheckCircle2, AlertTriangle, XCircle, Loader2, Play, RefreshCw,
  ChevronRight, ChevronDown, Lock, Power, MessageSquare, Phone, Send,
  Copy, ExternalLink, Wand2, Circle,
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
          {task.external_ref && (
            <KV label="Reference" value={task.external_ref} />
          )}
          <KV label="Payload"         value={<Code obj={task.payload} />} />
          <KV label="Proposed action" value={<Code obj={task.proposed_action} />} />
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
