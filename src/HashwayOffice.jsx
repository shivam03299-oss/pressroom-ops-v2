import React, { useState } from "react";
import {
  Building2, Inbox, Bot, Sparkles, MessageSquare, Megaphone, Factory, Truck,
  Wallet, ShoppingBag, Palette, Users, Lock, ChevronRight, Plug, Activity,
  Clock, CheckCircle2, AlertTriangle,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════
// HASHWAY · COMMAND CENTER
// Founder-only AI ops dashboard for Hashway Clothing.
// Phase 0 (now): scaffolding + roadmap.
// Phase 1 (next): DB + CX agent + Ops agent + Founder Inbox wired up.
// ═══════════════════════════════════════════════════════════════════

const DEPARTMENTS = [
  { id: "cx",         name: "Customer Experience", icon: MessageSquare, phase: 1,
    reads: "Shopify orders · WhatsApp DMs · Delhivery RTOs",
    proposes: "Refunds, replacements, FAQ auto-replies, escalations" },
  { id: "ops",        name: "Ops & Logistics",     icon: Truck,         phase: 1,
    reads: "Delhivery shipments · unshipped orders · NDR feed",
    proposes: "RTO follow-ups, courier switches, NDR escalations" },
  { id: "marketing",  name: "Marketing",           icon: Megaphone,     phase: 2,
    reads: "Meta Ads · Shopify revenue · GA4",
    proposes: "Pause weak ads, creative briefs, budget shifts" },
  { id: "finance",    name: "Finance",             icon: Wallet,        phase: 2,
    reads: "Shopify revenue · ad spend · COGS · bank",
    proposes: "Daily P&L, vendor payment queue, cashflow alerts" },
  { id: "production", name: "Production",          icon: Factory,       phase: 3,
    reads: "Shopify inventory · sales velocity · vendor SLAs",
    proposes: "Purchase orders, fabric reorders, stockout warnings" },
  { id: "ecom",       name: "E-commerce",          icon: ShoppingBag,   phase: 3,
    reads: "Shopify analytics · CR by SKU · cart drop-offs",
    proposes: "PDP copy edits, price tests, restock badges" },
  { id: "creative",   name: "Creative",            icon: Palette,       phase: 3,
    reads: "Drop calendar · sales data · trend feeds",
    proposes: "Lookbook briefs, drop copy, reel scripts" },
  { id: "community",  name: "Community",           icon: Users,         phase: 3,
    reads: "IG DMs · WA group · comments",
    proposes: "Drop hype posts, collab outreach, comment replies" },
];

const INTEGRATIONS = [
  { id: "shopify",   name: "Shopify · Hashway",  status: "ready",    note: "Store connected via custom app" },
  { id: "delhivery", name: "Delhivery",          status: "ready",    note: "Production token live · pickup 110089" },
  { id: "meta",      name: "Meta Ads",           status: "pending",  note: "Needs Business token (Phase 2)" },
  { id: "whatsapp",  name: "WhatsApp Business",  status: "pending",  note: "Needs WABA provider (Gallabox / AiSensy / Wati)" },
  { id: "anthropic", name: "Anthropic API",      status: "pending",  note: "Needed before agents can run (Phase 1)" },
];

export default function HashwayOffice({ profile }) {
  const [tab, setTab] = useState("overview");

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
            <span>Phase 0 · scaffolding</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: "1px solid var(--border)" }}>
        {[
          { id: "overview",     label: "Overview",       icon: Activity },
          { id: "inbox",        label: "Founder Inbox",  icon: Inbox },
          { id: "agents",       label: "Agents",         icon: Bot },
          { id: "integrations", label: "Integrations",   icon: Plug },
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

      {tab === "overview"     && <Overview />}
      {tab === "inbox"        && <FounderInbox />}
      {tab === "agents"       && <Agents />}
      {tab === "integrations" && <Integrations />}
    </div>
  );
}

function Overview() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="panel" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Sparkles size={16} />
          <div style={{ fontWeight: 600, fontSize: 13, letterSpacing: 0.4 }}>WHAT THIS IS</div>
        </div>
        <div style={{ fontSize: 13, opacity: 0.78, lineHeight: 1.55, maxWidth: 720 }}>
          Eight AI department-agents that run Hashway's day-to-day — they read live data from your
          stack, draft the day's actions, and queue decisions for your approval. You ship one founder
          decision queue instead of eight inboxes.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <StatTile label="Pending approvals"    value="0"   sub="Phase 1 not live yet"  />
        <StatTile label="Agents active"        value="0/8" sub="0 connected · 8 planned" />
        <StatTile label="Integrations ready"   value="2/5" sub="Shopify · Delhivery"   />
        <StatTile label="Auto-actions today"   value="0"   sub="Approval-first mode"   />
      </div>

      <div className="panel" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Clock size={16} />
          <div style={{ fontWeight: 600, fontSize: 13, letterSpacing: 0.4 }}>ROADMAP</div>
        </div>
        <RoadmapStep phase="Phase 0" status="done"     title="Scaffolding"
          body="Founder-only nav · placeholder dashboard · plan locked." />
        <RoadmapStep phase="Phase 1" status="next"     title="DB + CX + Ops agents"
          body="Supabase tables · founder inbox · CX agent (refunds, replies) · Ops agent (RTOs, NDR)." />
        <RoadmapStep phase="Phase 2" status="planned"  title="Marketing + Finance"
          body="Meta Ads token · daily P&L · ad pause / budget shift proposals." />
        <RoadmapStep phase="Phase 3" status="planned"  title="Creative · Community · Production · Ecom"
          body="Drop calendars, IG/WA community, vendor POs, PDP optimization." />
      </div>
    </div>
  );
}

function FounderInbox() {
  return (
    <div className="empty panel" style={{ padding: 40, textAlign: "center" }}>
      <Inbox size={28} style={{ opacity: 0.4, marginBottom: 12 }} />
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Inbox is empty</div>
      <div style={{ fontSize: 12, opacity: 0.6, maxWidth: 360, margin: "0 auto" }}>
        Once Phase 1 ships, every action an agent proposes — refunds, replies, RTO escalations —
        will land here for one-tap approve / edit / reject.
      </div>
    </div>
  );
}

function Agents() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
      {DEPARTMENTS.map(d => {
        const Icon = d.icon;
        return (
          <div key={d.id} className="panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, background: "var(--bg-elevated)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={16} />
                </div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
              </div>
              <span style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 999,
                background: d.phase === 1 ? "rgba(34,197,94,0.12)" : "var(--bg-elevated)",
                color:      d.phase === 1 ? "#22c55e"             : "var(--text-mute)",
                letterSpacing: 0.5,
              }}>
                PHASE {d.phase}
              </span>
            </div>
            <div style={{ fontSize: 11, opacity: 0.55, lineHeight: 1.5 }}>
              <div><b style={{ opacity: 0.8 }}>Reads:</b> {d.reads}</div>
              <div style={{ marginTop: 4 }}><b style={{ opacity: 0.8 }}>Proposes:</b> {d.proposes}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Integrations() {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {INTEGRATIONS.map(i => {
        const ready = i.status === "ready";
        return (
          <div key={i.id} className="panel" style={{
            padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {ready
                ? <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
                : <AlertTriangle size={16} style={{ color: "#f59e0b" }} />}
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{i.name}</div>
                <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{i.note}</div>
              </div>
            </div>
            <span style={{
              fontSize: 10, padding: "4px 10px", borderRadius: 999, letterSpacing: 0.5,
              background: ready ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
              color:      ready ? "#22c55e"             : "#f59e0b",
            }}>
              {ready ? "CONNECTED" : "PENDING"}
            </span>
          </div>
        );
      })}
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

function RoadmapStep({ phase, status, title, body }) {
  const color = status === "done" ? "#22c55e" : status === "next" ? "var(--ink-accent)" : "var(--text-mute)";
  return (
    <div style={{ display: "flex", gap: 14, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ minWidth: 78, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color, paddingTop: 2 }}>
        {phase}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          {title}
          {status === "next" && (
            <span style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 4,
              background: "var(--bg-elevated)", color: "var(--ink-accent)", letterSpacing: 0.5,
            }}>NEXT</span>
          )}
        </div>
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 3, lineHeight: 1.5 }}>{body}</div>
      </div>
      <ChevronRight size={14} style={{ opacity: 0.3, marginTop: 4 }} />
    </div>
  );
}
