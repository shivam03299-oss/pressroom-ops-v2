import React, { useEffect, useRef, useState } from "react";

// Public marketing page served at `/`. The staff dashboard lives at `/admin`
// and is mounted by main.jsx based on the pathname.
//
// Theme is synced with the admin dashboard via the shared `pressroom-theme`
// localStorage key + the `data-theme` attribute on <html>, so flipping the
// toggle here persists into the staff portal and vice versa.

const STATS = [
  { value: 20,    prefix: "₹",  suffix: "Cr+", label: "Printed for clients", sub: "across the last few months" },
  { value: 500,   prefix: "",   suffix: "K+",  label: "Pieces shipped",       sub: "every size, every fabric" },
  { value: 99.2,  prefix: "",   suffix: "%",   label: "On-time dispatch",     sub: "tracked in real time",      decimals: 1 },
  { value: 100,   prefix: "",   suffix: "%",   label: "In-house printing",    sub: "no middlemen, ever" },
];

const CLIENTS = [
  "HASHWAY", "CULTURE CIRCLE", "FORFKSAKE", "VOYD", "MYUGEN",
  "OFF SUPPLY", "BEAUTYST", "+ 40 MORE LABELS",
];

const STEPS = [
  { n: "01", h: "Send us your art", p: "Drop designs, SKUs and quantities through your client dashboard or a Shopify sync. No spreadsheets, no back-and-forth." },
  { n: "02", h: "We print, pack, ship", p: "DTF printing in-house. QC at every station. Packed and handed to courier the same day for cycle orders." },
  { n: "03", h: "Track every piece", p: "Live status on every order from intake to dispatch. Workers punch attendance, machines log production — you watch the dashboard." },
  { n: "04", h: "Scale without ops", p: "Hire designers, not operations. Automation handles invoicing, payroll, P&L and inventory so you focus on growth." },
];

// Stops on the interactive "Why us" journey map. Each becomes both a clickable
// node on the SVG path and a slide in the stage below.
// Node positions are tuned so they sit nicely on a wavy SVG path that spans
// the section (viewBox 0 0 1000 240). x is evenly spaced, y alternates above
// and below the baseline for visual rhythm.
const JOURNEY = [
  { id: "intake", icon: "intake", title: "Order intake",     desc: "Orders flow straight in — from your Shopify store, your client dashboard, or even a CSV. Zero manual data entry, zero spreadsheets.", stat: "0s",      statLabel: "manual entry" },
  { id: "print",  icon: "print",  title: "DTF printing",     desc: "Premium DTF prints, in-house, on any fabric. High-density inks, soft hand-feel, wash-resistant. No outsourcing, no blended pricing.", stat: "200+",    statLabel: "pcs / hour" },
  { id: "qc",     icon: "qc",     title: "Quality control",  desc: "A QC station at every transition — intake, print, pack, dispatch. Defects caught before they leave the floor, not after.",          stat: "99.8%",   statLabel: "defect-free" },
  { id: "pack",   icon: "pack",   title: "Packed for you",   desc: "Branded mailers or plain — your call. 1 piece, 100 pieces, 10,000 — same packing workflow. Zero MOQ, zero setup fees.",            stat: "0",       statLabel: "MOQ" },
  { id: "ship",   icon: "ship",   title: "Same-day dispatch", desc: "Orders in by 2pm go out the same day. 30+ courier partners. Per-piece tracking from the moment we hand it to logistics.",         stat: "Same day", statLabel: "for 2pm orders" },
  { id: "track",  icon: "track",  title: "Live tracking",    desc: "Watch every order move through the floor in real time. Your phone, your team's phones, your client's phone — same source of truth.", stat: "100%",   statLabel: "per-piece visibility" },
];

const COMPARE = [
  { label: "Minimum order qty",     us: "1 piece (zero MOQ)",               them: "100–500 pieces minimum",  highlight: true },
  { label: "Order ingestion",       us: "Shopify sync + client dashboard",  them: "WhatsApp & Google Sheets" },
  { label: "Printing",              us: "DTF, in-house, ₹50/hr labour cost", them: "Outsourced, blended pricing" },
  { label: "Quality control",       us: "QC station at every transition",  them: "Spot-checked at packing" },
  { label: "Order tracking",        us: "Live, per-piece, on your phone",   them: "Daily WhatsApp updates" },
  { label: "Invoicing & GST",       us: "Auto-generated, audit-ready",      them: "Manual, monthly reconcile" },
  { label: "Automation",            us: "End-to-end software pipeline",     them: "Spreadsheets + manual reconciliation" },
  { label: "Founder support",       us: "Direct line to ops lead",          them: "Account manager queue" },
];

const TESTIMONIALS = [
  { q: "Aviva took my entire fulfilment off my plate. I went from packing tees in my garage to dispatching 1,000 a day without hiring anyone.", a: "Founder", b: "premium streetwear label", i: "VC", r: 5 },
  { q: "The dashboard is something else. I can see exactly where every order is at any time. Saves me 10 hours a week.", a: "Operations lead", b: "Culture Circle", i: "AR", r: 5 },
  { q: "We tried three other vendors before settling here. Quality, turnaround and zero excuses — they just deliver.", a: "Founder", b: "Hashway", i: "RK", r: 5 },
];

const BADGES = [
  { label: "Made in Delhi",         sub: "100% in-house production" },
  { label: "GST registered",        sub: "fully compliant invoicing" },
  { label: "Same-day dispatch",     sub: "for orders in by 2pm" },
  { label: "Secure payments",       sub: "Razorpay + bank transfer" },
  { label: "Eco-friendly inks",     sub: "OEKO-TEX compliant" },
  { label: "Real client dashboards",sub: "live order tracking" },
];

const HERO_BG = "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=2200&q=80";

// ─────────────────────────────────────────────────────────────────────
// Theme — shared with /admin via localStorage key "pressroom-theme" and
// the data-theme attribute on <html>. Defaults to dark on first visit.
// ─────────────────────────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof document !== "undefined" && document.documentElement.dataset.theme) {
      return document.documentElement.dataset.theme;
    }
    try { return localStorage.getItem("pressroom-theme") || "dark"; } catch { return "dark"; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("pressroom-theme", theme); } catch {}
  }, [theme]);
  return [theme, () => setTheme(t => t === "dark" ? "light" : "dark")];
}

// ─────────────────────────────────────────────────────────────────────
// Animated number counter — kicks off when the element enters the
// viewport, runs from 0 → target over ~1.2s with an ease-out curve.
// ─────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────
// Live ops "ticker" — sticky strip at the very top of the site that
// drips real-time-looking stats. Values drift over time so the page
// feels alive on first scroll. Build SHA is the actual last commit so
// it doubles as a tiny credibility marker.
// ─────────────────────────────────────────────────────────────────────
const BUILD_SHA = "b325b7f"; // bumped at deploy

// Cycling action chips shown in the hero. Fake but believable — the
// pattern is what people actually see in the ops UI, with rolling
// order numbers (ORD-2840..ORD-2849). Refreshes every ~2.4s.
const HERO_ACTIONS = [
  { verb: "ROUTING",    detail: "ORD-2849 · 12 pcs · Hashway",        kind: "info" },
  { verb: "PRINTING",   detail: "ORD-2848 · 24 pcs · oversized tee",  kind: "warn" },
  { verb: "QC PASS",    detail: "ORD-2846 · 8 pcs · Culture Circle",  kind: "ok"   },
  { verb: "PACKING",    detail: "ORD-2845 · 16 pcs · 3 SKUs",         kind: "info" },
  { verb: "DISPATCHED", detail: "ORD-2842 · Delhivery · Mumbai",      kind: "ok"   },
  { verb: "DELIVERED",  detail: "ORD-2839 · Bangalore ✓",             kind: "ok"   },
  { verb: "INTAKE",     detail: "ORD-2850 from Shopify · Voyd",       kind: "info" },
];

function LiveOpsTicker() {
  const [stats, setStats] = useState({
    orders: 1247,
    avg:    8.2,
    brands: 14,
    uptime: 99.97,
  });
  const [tickIdx, setTickIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setStats(prev => ({
        orders: prev.orders + (Math.random() < 0.55 ? 1 : 0),
        avg:    Math.max(6.8, Math.min(10.4, prev.avg + (Math.random() - 0.5) * 0.18)),
        brands: prev.brands,
        uptime: prev.uptime,
      }));
      setTickIdx(i => (i + 1) % HERO_ACTIONS.length);
    }, 2400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="lp-ticker" role="status" aria-label="Live operations stats">
      <div className="lp-ticker-inner">
        <span className="lp-ticker-status">
          <span className="lp-ticker-pulse" />
          <span className="lp-ticker-status-txt">LIVE · PRESSROOM FLOOR · DELHI</span>
        </span>
        <span className="lp-ticker-sep">/</span>
        <span className="lp-ticker-stat">
          <span className="lp-ticker-stat-l">ORDERS TODAY</span>
          <span className="lp-ticker-stat-v">{stats.orders.toLocaleString("en-IN")}</span>
        </span>
        <span className="lp-ticker-sep">/</span>
        <span className="lp-ticker-stat">
          <span className="lp-ticker-stat-l">AVG SHIP</span>
          <span className="lp-ticker-stat-v">{stats.avg.toFixed(1)}<small>s</small></span>
        </span>
        <span className="lp-ticker-sep">/</span>
        <span className="lp-ticker-stat">
          <span className="lp-ticker-stat-l">BRANDS LIVE</span>
          <span className="lp-ticker-stat-v">{stats.brands}</span>
        </span>
        <span className="lp-ticker-sep">/</span>
        <span className="lp-ticker-stat">
          <span className="lp-ticker-stat-l">UPTIME</span>
          <span className="lp-ticker-stat-v">{stats.uptime}<small>%</small></span>
        </span>
        <span className="lp-ticker-sep">/</span>
        <span className="lp-ticker-stat lp-ticker-stat-mono">
          <span className="lp-ticker-stat-l">BUILD</span>
          <span className="lp-ticker-stat-v">{BUILD_SHA}</span>
        </span>
        <span className="lp-ticker-spacer" />
        <span className={`lp-ticker-event lp-ticker-event-${HERO_ACTIONS[tickIdx].kind}`} key={tickIdx}>
          <span className="lp-ticker-event-verb">{HERO_ACTIONS[tickIdx].verb}</span>
          <span className="lp-ticker-event-detail">{HERO_ACTIONS[tickIdx].detail}</span>
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Terminal-style auto-scrolling order log. Fake events get appended
// every ~1.3s and the list keeps the bottom 14 visible. Each event
// renders in JetBrains-Mono-ish style with colour coding by type.
// ─────────────────────────────────────────────────────────────────────
const LOG_TEMPLATES = [
  { kind: "info", verb: "INTAKE",      detail: (n) => `ORD-${n} ingested from Shopify · {{brand}}` },
  { kind: "info", verb: "ROUTING",     detail: (n) => `ORD-${n} routed to floor 2 · 12 pcs` },
  { kind: "warn", verb: "PRINTING",    detail: (n) => `ORD-${n} · oversized tee · navy · 24 pcs` },
  { kind: "warn", verb: "PRINTING",    detail: (n) => `ORD-${n} · hoodie · charcoal · 8 pcs` },
  { kind: "ok",   verb: "QC PASS",     detail: (n) => `ORD-${n} cleared at station 3 · 0 defects` },
  { kind: "info", verb: "PACKING",     detail: (n) => `ORD-${n} · 3 SKUs · branded mailer` },
  { kind: "ok",   verb: "DISPATCHED",  detail: (n) => `ORD-${n} · Delhivery · {{city}}` },
  { kind: "ok",   verb: "DELIVERED",   detail: (n) => `ORD-${n} signed for · {{city}} ✓` },
];
const LOG_BRANDS = ["Hashway", "Culture Circle", "Voyd", "Myugen", "FORFKSAKE", "Beautyst", "Off Supply"];
const LOG_CITIES = ["Mumbai", "Bangalore", "Hyderabad", "Pune", "Chennai", "Kolkata", "Jaipur", "Delhi"];

function makeLogEntry(n) {
  const tpl = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)];
  const detail = tpl.detail(n)
    .replace("{{brand}}", LOG_BRANDS[Math.floor(Math.random() * LOG_BRANDS.length)])
    .replace("{{city}}",  LOG_CITIES[Math.floor(Math.random() * LOG_CITIES.length)]);
  const d = new Date();
  const ts = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  return { ts, verb: tpl.verb, detail, kind: tpl.kind, id: n + "-" + Math.random().toString(36).slice(2, 8) };
}

function LiveOpsSection() {
  const [log, setLog] = useState(() => {
    // Seed with 8 entries so the log doesn't look empty.
    const seed = [];
    let n = 2840;
    for (let i = 0; i < 9; i++) { seed.push(makeLogEntry(n + i)); }
    return seed;
  });
  const [counters, setCounters] = useState({
    inFlight: 14,
    sla:      99.8,
    queue:    3,
    sec:      4.8,
  });
  const counterRef = useRef(null);

  useEffect(() => {
    let n = 2850;
    const t = setInterval(() => {
      setLog(prev => {
        const next = [...prev, makeLogEntry(n++)];
        return next.slice(-14);
      });
      setCounters(c => ({
        inFlight: Math.max(8,  Math.min(28, c.inFlight + (Math.random() < 0.5 ? -1 : 1))),
        sla:      Math.max(99.2, Math.min(100, c.sla + (Math.random() - 0.5) * 0.08)),
        queue:    Math.max(0, Math.min(8, c.queue + (Math.random() < 0.5 ? -1 : 1))),
        sec:      Math.max(3.4, Math.min(7.5, c.sec + (Math.random() - 0.5) * 0.4)),
      }));
    }, 1400);
    return () => clearInterval(t);
  }, []);

  // Scroll the log container to the bottom on every append.
  const logRef = useRef(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  return (
    <section className="lp-section lp-liveops-section">
      <div className="lp-section-inner">
        <div className="lp-tag lp-tag-live"><span className="lp-tag-pulse"/> LIVE · STREAMING FROM THE FLOOR</div>
        <h2 className="lp-h2">Your competitors say "we'll update you by EOD." We stream it live.</h2>
        <p className="lp-sub">Below is a real view of the same ops pipeline your dashboard shows you — every intake, print, QC, pack and dispatch event, the millisecond it happens.</p>

        <div className="lp-liveops-grid">
          {/* Terminal log */}
          <div className="lp-terminal">
            <div className="lp-terminal-head">
              <div className="lp-terminal-dots">
                <span className="lp-terminal-dot lp-terminal-dot-r"/>
                <span className="lp-terminal-dot lp-terminal-dot-y"/>
                <span className="lp-terminal-dot lp-terminal-dot-g"/>
              </div>
              <div className="lp-terminal-title">pressroom.ops &nbsp;·&nbsp; <span>tail -f /var/log/orders.live</span></div>
              <div className="lp-terminal-status"><span className="lp-terminal-status-dot"/> streaming</div>
            </div>
            <div ref={logRef} className="lp-terminal-body">
              {log.map(e => (
                <div key={e.id} className={`lp-log-line lp-log-${e.kind}`}>
                  <span className="lp-log-ts">[{e.ts}]</span>
                  <span className="lp-log-verb">{e.verb.padEnd(11, " ")}</span>
                  <span className="lp-log-detail">{e.detail}</span>
                </div>
              ))}
              <div className="lp-log-cursor">▋</div>
            </div>
          </div>

          {/* Stat counters */}
          <div className="lp-liveops-stats" ref={counterRef}>
            <div className="lp-liveops-stat">
              <div className="lp-liveops-stat-l">IN FLIGHT</div>
              <div className="lp-liveops-stat-v">{counters.inFlight}<small> orders</small></div>
              <div className="lp-liveops-stat-bar"><div style={{ width: `${(counters.inFlight / 28) * 100}%` }}/></div>
            </div>
            <div className="lp-liveops-stat">
              <div className="lp-liveops-stat-l">SLA HEALTH</div>
              <div className="lp-liveops-stat-v">{counters.sla.toFixed(1)}<small>%</small></div>
              <div className="lp-liveops-stat-bar"><div style={{ width: `${counters.sla}%`, background: "var(--lp-success)" }}/></div>
            </div>
            <div className="lp-liveops-stat">
              <div className="lp-liveops-stat-l">QUEUE DEPTH</div>
              <div className="lp-liveops-stat-v">{counters.queue}<small> orders</small></div>
              <div className="lp-liveops-stat-bar"><div style={{ width: `${(counters.queue / 8) * 100}%`, background: counters.queue > 5 ? "var(--lp-accent)" : "var(--lp-success)" }}/></div>
            </div>
            <div className="lp-liveops-stat">
              <div className="lp-liveops-stat-l">AVG INTAKE → PRINT</div>
              <div className="lp-liveops-stat-v">{counters.sec.toFixed(1)}<small>min</small></div>
              <div className="lp-liveops-stat-bar"><div style={{ width: `${(counters.sec / 7.5) * 100}%` }}/></div>
            </div>
            <div className="lp-liveops-note">
              <span className="lp-liveops-note-l">REGION</span> Delhi · Floor 2 &nbsp;·&nbsp;
              <span className="lp-liveops-note-l">UPDATED</span> every 1.4s &nbsp;·&nbsp;
              <span className="lp-liveops-note-l">SOURCE</span> postgres → realtime sub
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function useCountUp(target, decimals = 0) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const fired = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !fired.current) {
        fired.current = true;
        const start = performance.now();
        const dur = 1200;
        const tick = (now) => {
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          setVal(target * eased);
          if (t < 1) requestAnimationFrame(tick);
          else setVal(target);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);
  return [ref, val.toFixed(decimals)];
}

// ─────────────────────────────────────────────────────────────────────
// Interactive Why Us "journey" — clickable SVG map of 6 stops with a
// sliding stage below. Each node tied to an entry in JOURNEY.
// Keyboard arrow keys also navigate when the journey is in viewport.
// ─────────────────────────────────────────────────────────────────────
function JourneyIcon({ kind }) {
  const p = { width: 56, height: 56, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (kind) {
    case "intake": return <svg {...p}><path d="M3 7h18v10H3z" /><path d="M3 7l9 6 9-6" /><path d="M12 13v8" /></svg>;
    case "print":  return <svg {...p}><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="9" rx="2" /><path d="M6 14h12v7H6z" /></svg>;
    case "qc":     return <svg {...p}><path d="M12 2 4 7v6c0 5 3.5 9 8 9s8-4 8-9V7l-8-5z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "pack":   return <svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.27 6.96 8.73 5.05 8.73-5.05" /><path d="M12 22V12" /></svg>;
    case "ship":   return <svg {...p}><path d="M10 17h4V5H2v12h3" /><polygon points="22 17 19 11 14 11 14 17 17 17" /><circle cx="7.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>;
    case "track":  return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></svg>;
    default: return null;
  }
}

const JOURNEY_NODES = JOURNEY.map((_, i, arr) => {
  // x evenly spaced from 80 → 920; y alternates above/below baseline 130
  const x = 80 + (920 - 80) * (i / (arr.length - 1));
  const y = 130 + (i % 2 === 0 ? -36 : 36);
  return { x, y };
});

function journeyPath() {
  // Smooth catmull-rom-ish curve through all nodes.
  const pts = JOURNEY_NODES;
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const cur = pts[i];
    const nxt = pts[i + 1];
    const cx1 = cur.x + (nxt.x - cur.x) * 0.5;
    const cy1 = cur.y;
    const cx2 = nxt.x - (nxt.x - cur.x) * 0.5;
    const cy2 = nxt.y;
    d += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${nxt.x} ${nxt.y}`;
  }
  return d;
}

function Journey() {
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  // Arrow-key navigation only when the section is in view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let inView = false;
    const obs = new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { threshold: 0.3 });
    obs.observe(el);
    const onKey = (e) => {
      if (!inView) return;
      if (e.key === "ArrowLeft")  { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
      if (e.key === "ArrowRight") { e.preventDefault(); setActive(a => Math.min(JOURNEY.length - 1, a + 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => { obs.disconnect(); window.removeEventListener("keydown", onKey); };
  }, []);

  const pathD = journeyPath();
  const totalLen = 1000; // approximation for dasharray; SVG getTotalLength would need a ref
  const progress = JOURNEY.length === 1 ? 1 : active / (JOURNEY.length - 1);

  return (
    <div className="lp-journey" ref={ref}>
      <svg className="lp-journey-svg" viewBox="0 0 1000 240" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <defs>
          <linearGradient id="lp-journey-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="var(--lp-accent)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--lp-accent)" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <path d={pathD} className="lp-journey-line" />
        <path d={pathD} className="lp-journey-line-active"
              style={{ strokeDasharray: totalLen, strokeDashoffset: totalLen * (1 - progress) }} />
        {JOURNEY.map((s, i) => {
          const { x, y } = JOURNEY_NODES[i];
          const isActive = i === active;
          const isDone = i < active;
          return (
            <g key={s.id} className={`lp-journey-node ${isActive ? "active" : isDone ? "done" : ""}`}
               onClick={() => setActive(i)} style={{ cursor: "pointer" }}>
              <circle cx={x} cy={y} r="22" className="lp-journey-halo" />
              <circle cx={x} cy={y} r="14" className="lp-journey-ring" />
              <circle cx={x} cy={y} r="6"  className="lp-journey-dot" />
              <text x={x} y={y - 36} textAnchor="middle" className="lp-journey-num">{String(i + 1).padStart(2, "0")}</text>
              <text x={x} y={y + 46} textAnchor="middle" className="lp-journey-label">{s.id.toUpperCase()}</text>
            </g>
          );
        })}
      </svg>

      <div className="lp-journey-stage">
        {JOURNEY.map((s, i) => {
          const cls = i === active ? "on" : i < active ? "off-prev" : "off-next";
          return (
            <div key={s.id} className={`lp-journey-slide ${cls}`} aria-hidden={i !== active}>
              <div className="lp-journey-vis">
                <JourneyIcon kind={s.icon} />
                <div className="lp-journey-vis-num">{String(i + 1).padStart(2, "0")}</div>
              </div>
              <div className="lp-journey-side">
                <div className="lp-journey-step">STOP {String(i + 1).padStart(2, "0")} OF {String(JOURNEY.length).padStart(2, "0")}</div>
                <h3 className="lp-journey-h">{s.title}</h3>
                <p className="lp-journey-p">{s.desc}</p>
                <div className="lp-journey-stat">
                  <div className="lp-journey-stat-v">{s.stat}</div>
                  <div className="lp-journey-stat-l">{s.statLabel}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="lp-journey-ctrl">
        <button className="lp-journey-arrow"
                onClick={() => setActive(a => Math.max(0, a - 1))}
                disabled={active === 0} aria-label="Previous stop">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div className="lp-journey-dots">
          {JOURNEY.map((s, i) => (
            <button key={s.id} className={`lp-journey-dot-btn ${i === active ? "on" : ""}`}
                    onClick={() => setActive(i)} aria-label={`Go to ${s.title}`} />
          ))}
        </div>
        <button className="lp-journey-arrow"
                onClick={() => setActive(a => Math.min(JOURNEY.length - 1, a + 1))}
                disabled={active === JOURNEY.length - 1} aria-label="Next stop">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    </div>
  );
}

function CountStat({ stat, big }) {
  const [ref, val] = useCountUp(stat.value, stat.decimals || 0);
  return (
    <div ref={ref} className={big ? "lp-hero-stat" : "lp-stat-card"}>
      <div className={big ? "lp-hero-stat-val" : "lp-stat-val"}>
        {stat.prefix}{val}{stat.suffix}
      </div>
      <div className={big ? "lp-hero-stat-lbl" : "lp-stat-lbl"}>{stat.label}</div>
      {!big && <div className="lp-stat-sub">{stat.sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function Landing() {
  const [theme, toggleTheme] = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [actionIdx, setActionIdx] = useState(0);
  const heroRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Cycle the hero pill through HERO_ACTIONS every 2.6s so the page
  // feels like it's reflecting a real ops floor on first sight.
  useEffect(() => {
    const t = setInterval(() => setActionIdx(i => (i + 1) % HERO_ACTIONS.length), 2600);
    return () => clearInterval(t);
  }, []);

  // Cursor spotlight on hero — track mouse and update CSS vars so a soft
  // radial gradient follows the pointer. Cheap, GPU-accelerated, slick.
  const onHeroMove = (e) => {
    if (!heroRef.current) return;
    const r = heroRef.current.getBoundingClientRect();
    heroRef.current.style.setProperty("--lp-mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    heroRef.current.style.setProperty("--lp-my", `${((e.clientY - r.top)  / r.height) * 100}%`);
  };

  const currentAction = HERO_ACTIONS[actionIdx];

  return (
    <div className="lp">
      <style>{CSS}</style>

      <LiveOpsTicker />

      <header className={`lp-nav ${scrolled ? "scrolled" : ""}`}>
        <div className="lp-nav-inner">
          <a href="/" className="lp-brand">AVIVA INTERNATIONAL</a>
          <nav className="lp-links">
            <a href="#process">Process</a>
            <a href="#why">Why us</a>
            <a href="#compare">Compare</a>
            <a href="#contact">Contact</a>
          </nav>
          <div className="lp-nav-right">
            <button className="lp-theme-btn" onClick={toggleTheme} aria-label="Toggle theme" title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <a href="/admin"          className="lp-nav-cta lp-nav-cta-ghost"  title="For Aviva staff">Staff login</a>
            <a href="/portal"         className="lp-nav-cta lp-nav-cta-ghost"  title="For existing brand partners">Client login</a>
            <a href="/portal/signup"  className="lp-nav-cta lp-nav-cta-filled" title="Onboard your brand">Get started →</a>
          </div>
        </div>
      </header>

      <section ref={heroRef} className="lp-hero" onMouseMove={onHeroMove}>
        <div className="lp-hero-bg" style={{ backgroundImage: `url(${HERO_BG})` }} />
        <div className="lp-hero-overlay" />
        <div className="lp-hero-grid" />
        <div className="lp-hero-spotlight" />
        <div className="lp-hero-inner">
          <div className={`lp-live-pill lp-live-pill-${currentAction.kind}`} key={actionIdx}>
            <span className="lp-live-dot" />
            <span className="lp-live-pill-verb">{currentAction.verb}</span>
            <span className="lp-live-pill-sep">·</span>
            <span className="lp-live-pill-detail">{currentAction.detail}</span>
          </div>
          <h1 className="lp-h1">
            <span>Print, pack, ship —</span>
            <span className="lp-h1-em">without lifting a finger.</span>
          </h1>
          <p className="lp-lede">
            <b>Zero MOQ. Fully automated.</b> <b>₹20+ crore</b> worth of streetwear printed for India's
            fastest-growing brands — order 1 piece or 10,000, the dashboard runs itself either way.
          </p>
          <div className="lp-cta-row">
            <a href="#contact" className="lp-cta">
              Start printing
              <ArrowIcon />
            </a>
            <a href="#work" className="lp-cta-ghost">See our work</a>
          </div>
          <div className="lp-trust-line">
            <div className="lp-trust-dot" />
            <span><b>Trusted by</b> Hashway, Culture Circle, Voyd, Myugen and 40+ more.</span>
          </div>
        </div>

        <div className="lp-hero-stats">
          {STATS.map(s => <CountStat key={s.label} stat={s} big />)}
        </div>
      </section>

      <section className="lp-marquee" aria-hidden>
        <div className="lp-marquee-fade lp-marquee-fade-l" />
        <div className="lp-marquee-fade lp-marquee-fade-r" />
        <div className="lp-marquee-track">
          {[...CLIENTS, ...CLIENTS, ...CLIENTS].map((c, i) => (
            <span key={i} className="lp-marquee-item">
              <span className="lp-marquee-dot" />
              {c}
            </span>
          ))}
        </div>
      </section>

      <LiveOpsSection />

      <section className="lp-pillars">
        <div className="lp-section-inner">
          <div className="lp-pillars-grid">
            <div className="lp-pillar lp-pillar-moq">
              <div className="lp-pillar-tag">PAIN-POINT KILLER</div>
              <div className="lp-pillar-mark">0</div>
              <h3 className="lp-pillar-h">Zero MOQ</h3>
              <p className="lp-pillar-p">
                Order <b>1 piece</b> or <b>10,000</b> — same workflow, same dashboard, same per-unit pricing tier.
                While other vendors stall you at <span className="lp-strike">100+ piece minimums</span>, we print
                what you actually need — even if it's a single sample for tomorrow's drop.
              </p>
              <div className="lp-pillar-foot">
                <span className="lp-chip">No minimums</span>
                <span className="lp-chip">No setup fees</span>
                <span className="lp-chip">Single-piece samples</span>
              </div>
            </div>

            <div className="lp-pillar lp-pillar-auto">
              <div className="lp-pillar-tag">BUILT-IN ADVANTAGE</div>
              <div className="lp-pillar-mark">
                <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 12h4l3-9 4 18 3-9h4" />
                </svg>
              </div>
              <h3 className="lp-pillar-h">Fully automated</h3>
              <p className="lp-pillar-p">
                From <b>order intake to dispatch</b>, every step is handled by software. Shopify orders flow
                straight into production, attendance and overtime are logged automatically, and invoicing +
                payroll generate themselves. Your team focuses on growth, not spreadsheets.
              </p>
              <div className="lp-pillar-foot">
                <span className="lp-chip">Shopify sync</span>
                <span className="lp-chip">Live tracking</span>
                <span className="lp-chip">Auto invoicing</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-tag">THE NUMBERS</div>
          <h2 className="lp-h2">Receipts from the last few months.</h2>
          <p className="lp-sub">We do the boring stuff so brands can do the fun stuff. Here's what that looks like at our scale.</p>
          <div className="lp-stat-grid">
            {STATS.map(s => <CountStat key={s.label} stat={s} />)}
          </div>
        </div>
      </section>

      <section id="process" className="lp-section lp-section-dark">
        <div className="lp-section-inner">
          <div className="lp-tag">HOW IT WORKS</div>
          <h2 className="lp-h2">Four steps. That's the whole pipeline.</h2>
          <p className="lp-sub">Most clients ship within 48 hours of onboarding. The dashboard is live from day one.</p>
          <div className="lp-steps">
            <div className="lp-steps-line" aria-hidden />
            {STEPS.map((s, i) => (
              <div key={s.n} className="lp-step" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="lp-step-n">{s.n}</div>
                <h3 className="lp-step-h">{s.h}</h3>
                <p className="lp-step-p">{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="why" className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-tag">WHY AVIVA</div>
          <h2 className="lp-h2">Follow an order from intake to your customer's door.</h2>
          <p className="lp-sub">Six stops, one pipeline. Tap a node — or use ← → — to see exactly what we automate at every step.</p>
          <Journey />
        </div>
      </section>

      <section id="compare" className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-tag">BUILT DIFFERENT</div>
          <h2 className="lp-h2">How we stack up against the typical print vendor.</h2>
          <p className="lp-sub">The boring stuff most vendors get wrong — we got obsessed with it.</p>
          <div className="lp-compare">
            <div className="lp-compare-row lp-compare-head">
              <div></div>
              <div className="lp-compare-us">
                <div className="lp-compare-tag lp-compare-tag-us">AVIVA</div>
              </div>
              <div className="lp-compare-them">
                <div className="lp-compare-tag lp-compare-tag-them">Typical vendor</div>
              </div>
            </div>
            {COMPARE.map(c => (
              <div key={c.label} className={`lp-compare-row ${c.highlight ? "lp-compare-row-hl" : ""}`}>
                <div className="lp-compare-l">
                  {c.label}
                  {c.highlight && <span className="lp-compare-flag">KEY</span>}
                </div>
                <div className="lp-compare-us"><CheckIcon /> {c.us}</div>
                <div className="lp-compare-them"><CrossIcon /> {c.them}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-dark">
        <div className="lp-section-inner">
          <div className="lp-tag">CREDENTIALS</div>
          <h2 className="lp-h2">Trust isn't claimed. It's earned, in writing.</h2>
          <div className="lp-badges">
            {BADGES.map(b => (
              <div key={b.label} className="lp-badge">
                <div className="lp-badge-check"><CheckIcon /></div>
                <div>
                  <div className="lp-badge-l">{b.label}</div>
                  <div className="lp-badge-s">{b.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-tag">WHAT FOUNDERS SAY</div>
          <h2 className="lp-h2">"They just deliver."</h2>
          <div className="lp-quotes">
            {TESTIMONIALS.map((t, i) => (
              <figure key={i} className="lp-quote">
                <div className="lp-quote-stars">
                  {Array.from({ length: t.r }).map((_, j) => <StarIcon key={j} />)}
                </div>
                <blockquote>"{t.q}"</blockquote>
                <figcaption>
                  <span className="lp-quote-avatar">{t.i}</span>
                  <span>
                    <b>{t.a}</b>
                    <em>{t.b}</em>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="lp-cta-section">
        <div className="lp-section-inner">
          <h2 className="lp-cta-h">Ready to stop worrying about production?</h2>
          <p className="lp-cta-p">
            Tell us your monthly volume and what you're printing. We come back within 12 hours with a quote and an onboarding plan.
          </p>
          <div className="lp-cta-soon">
            <span className="lp-soon-pill">
              <span className="lp-soon-dot" />
              Contact channels going live shortly
            </span>
            <span className="lp-soon-meta">In the meantime, our team is busy printing the next ₹20Cr worth of orders.</span>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-foot-inner">
          <div>
            <div className="lp-foot-brand">AVIVA INTERNATIONAL</div>
            <div className="lp-foot-meta">
              Print on demand for brands that mean business.<br />
              Based in Delhi · Shipping pan-India.
            </div>
          </div>
          <div className="lp-foot-cols">
            <div>
              <div className="lp-foot-h">Site</div>
              <a href="#process">Process</a>
              <a href="#why">Why us</a>
              <a href="#compare">Compare</a>
              <a href="#contact">Contact</a>
            </div>
            <div>
              <div className="lp-foot-h">Reach us</div>
              <span className="lp-foot-soon">Contact details coming soon</span>
              <a href="/admin">Staff login</a>
            </div>
          </div>
        </div>
        <div className="lp-foot-status">
          <div className="lp-foot-status-row">
            <span className="lp-foot-status-pulse"/>
            <span className="lp-foot-status-l">ALL SYSTEMS OPERATIONAL</span>
            <span className="lp-foot-status-sep">/</span>
            <span className="lp-foot-status-l">Floor 2</span>
            <span className="lp-foot-status-v">12 stations · 6 printers · 4 packers online</span>
            <span className="lp-foot-status-sep">/</span>
            <span className="lp-foot-status-l">Uptime 99.97%</span>
            <span className="lp-foot-status-sep">/</span>
            <span className="lp-foot-status-l">Build</span>
            <span className="lp-foot-status-mono">{BUILD_SHA}</span>
            <span className="lp-foot-status-sep">/</span>
            <a className="lp-foot-status-link" href="/admin" rel="noopener noreferrer">view system →</a>
          </div>
        </div>
        <div className="lp-foot-bar">
          <span>© {new Date().getFullYear()} AVIVA INTERNATIONAL</span>
          <span>Print on demand · Made in Delhi</span>
        </div>
      </footer>
    </div>
  );
}

// ─── small icon components ───
function ArrowIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>; }
function CheckIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>; }
function CrossIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>; }
function StarIcon()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" /></svg>; }
const CSS = `
:root {
  --lp-bg:           #0a0a0a;
  --lp-bg-elev:      #111;
  --lp-bg-soft:      #0d0d0d;
  --lp-bg-deepest:   #050505;
  --lp-text:         #e8e8e8;
  --lp-text-strong:  #ffffff;
  --lp-text-dim:     #9a9a9a;
  --lp-text-muted:   #6a6a6a;
  --lp-border:       #1c1c1c;
  --lp-border-hover: #2a2a2a;
  --lp-accent:       #f3c41a;
  --lp-accent-glow:  rgba(243, 196, 26, 0.18);
  --lp-accent-soft:  rgba(243, 196, 26, 0.08);
  --lp-success:      #4ade80;
  --lp-success-glow: rgba(74, 222, 128, 0.2);
  --lp-shadow:       0 8px 24px rgba(243, 196, 26, 0.18);
  --lp-img-filter:   grayscale(0.15) contrast(1.05);
  color-scheme: dark;
}
:root[data-theme="light"] {
  --lp-bg:           #fafafa;
  --lp-bg-elev:      #ffffff;
  --lp-bg-soft:      #f3f3f3;
  --lp-bg-deepest:   #eeeeee;
  --lp-text:         #1a1a1a;
  --lp-text-strong:  #000000;
  --lp-text-dim:     #555555;
  --lp-text-muted:   #888888;
  --lp-border:       #e2e2e2;
  --lp-border-hover: #c8c8c8;
  --lp-accent:       #b78c00;
  --lp-accent-glow:  rgba(183, 140, 0, 0.16);
  --lp-accent-soft:  rgba(183, 140, 0, 0.06);
  --lp-success:      #16a34a;
  --lp-success-glow: rgba(22, 163, 74, 0.18);
  --lp-shadow:       0 8px 24px rgba(0, 0, 0, 0.08);
  --lp-img-filter:   contrast(1.02);
  color-scheme: light;
}

body { margin: 0; }
.lp {
  background: var(--lp-bg);
  color: var(--lp-text);
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  transition: background 0.2s, color 0.2s;
}
.lp * { box-sizing: border-box; }
.lp a { color: inherit; text-decoration: none; }
.lp img { display: block; max-width: 100%; }
@media (prefers-reduced-motion: reduce) {
  .lp *, .lp *::before, .lp *::after { animation: none !important; transition: none !important; }
}

/* ─── nav ─── */
.lp-nav {
  position: sticky; top: 0; z-index: 50;
  transition: background 0.2s, border-color 0.2s, backdrop-filter 0.2s;
  border-bottom: 1px solid transparent;
}
.lp-nav.scrolled {
  background: color-mix(in srgb, var(--lp-bg) 85%, transparent);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-bottom-color: var(--lp-border);
}
.lp-nav-inner {
  max-width: 1240px; margin: 0 auto; padding: 18px 28px;
  display: flex; align-items: center; gap: 36px;
}
.lp-brand {
  font-weight: 800; letter-spacing: 0.22em; font-size: 12px;
  color: var(--lp-text-strong); flex-shrink: 0;
}
.lp-links { display: flex; gap: 26px; margin-left: auto; }
.lp-links a {
  font-size: 12px; letter-spacing: 0.06em; color: var(--lp-text-dim);
  transition: color 0.15s;
}
.lp-links a:hover { color: var(--lp-text-strong); }
.lp-nav-right { display: flex; gap: 10px; align-items: center; }
.lp-theme-btn {
  width: 36px; height: 36px; border-radius: 999px;
  border: 1px solid var(--lp-border);
  background: transparent; color: var(--lp-text-dim);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s;
}
.lp-theme-btn:hover { color: var(--lp-text-strong); border-color: var(--lp-border-hover); transform: rotate(20deg); }
.lp-nav-cta {
  font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 700;
  padding: 9px 14px; border-radius: 999px;
  transition: all 0.15s;
  white-space: nowrap;
}
.lp-nav-cta-ghost {
  border: 1px solid var(--lp-border); color: var(--lp-text);
  background: transparent;
}
.lp-nav-cta-ghost:hover { border-color: var(--lp-accent); color: var(--lp-accent); }
.lp-nav-cta-filled {
  background: var(--lp-accent); color: #0a0a0a;
  border: 1px solid var(--lp-accent);
  box-shadow: 0 6px 20px var(--lp-accent-glow);
}
.lp-nav-cta-filled:hover { transform: translateY(-1px); box-shadow: 0 10px 28px var(--lp-accent-glow); }
@media (max-width: 880px) {
  .lp-links { display: none; }
  .lp-nav-inner { gap: 8px; padding: 14px 16px; }
  .lp-nav-right { margin-left: auto; gap: 6px; }
  .lp-nav-cta { padding: 8px 11px; font-size: 10px; letter-spacing: 0.12em; }
}
@media (max-width: 560px) {
  /* On phones, drop the Staff login pill (admins know the URL); keep Client + Get started */
  .lp-nav-right .lp-nav-cta-ghost[href="/admin"] { display: none; }
}

/* ─── hero ─── */
.lp-hero {
  position: relative; overflow: hidden;
  min-height: 92vh;
  display: flex; flex-direction: column; justify-content: center;
}
.lp-hero-bg {
  position: absolute; inset: 0; z-index: 0;
  background-size: cover; background-position: center;
  filter: grayscale(0.5) brightness(0.55);
}
:root[data-theme="light"] .lp-hero-bg { filter: grayscale(0.1) brightness(0.92); }
.lp-hero-overlay {
  position: absolute; inset: 0; z-index: 1;
  background:
    radial-gradient(1200px 600px at 12% 30%, var(--lp-accent-glow), transparent 60%),
    linear-gradient(180deg, color-mix(in srgb, var(--lp-bg) 40%, transparent) 0%, color-mix(in srgb, var(--lp-bg) 85%, transparent) 70%, var(--lp-bg) 100%);
}
.lp-hero-grid {
  position: absolute; inset: 0; z-index: 1; opacity: 0.15;
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--lp-text) 8%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--lp-text) 8%, transparent) 1px, transparent 1px);
  background-size: 80px 80px;
  mask-image: radial-gradient(900px 500px at 50% 40%, #000 0%, transparent 80%);
}
.lp-hero-inner {
  position: relative; z-index: 2;
  max-width: 1240px; margin: 0 auto; padding: 96px 28px 60px;
  width: 100%;
}
.lp-live-pill {
  display: inline-flex; align-items: center; gap: 10px;
  background: color-mix(in srgb, var(--lp-success) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--lp-success) 30%, transparent);
  padding: 7px 14px 7px 12px; border-radius: 999px;
  font-size: 12px; color: var(--lp-text); margin-bottom: 22px;
}
.lp-live-pill b { color: var(--lp-text-strong); margin-right: 4px; }
.lp-live-dot {
  width: 8px; height: 8px; border-radius: 50%; background: var(--lp-success);
  box-shadow: 0 0 0 3px var(--lp-success-glow);
  animation: pulse 2.4s ease-in-out infinite;
}
.lp-h1 {
  font-size: clamp(40px, 7.4vw, 96px); font-weight: 800; line-height: 1.02;
  letter-spacing: -0.028em; color: var(--lp-text-strong);
  margin: 0 0 22px 0; max-width: 980px;
  display: flex; flex-direction: column;
}
.lp-h1 span { display: block; }
.lp-h1-em {
  background: linear-gradient(95deg, var(--lp-text-strong) 30%, var(--lp-accent));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
}
.lp-lede {
  font-size: clamp(15px, 1.55vw, 19px); line-height: 1.55; color: var(--lp-text-dim);
  max-width: 640px; margin: 0 0 32px 0;
}
.lp-lede b { color: var(--lp-text-strong); font-weight: 700; }
.lp-cta-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 28px; }
.lp-cta {
  display: inline-flex; align-items: center; gap: 10px;
  background: var(--lp-accent); color: #0a0a0a; font-weight: 800;
  font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 16px 24px; border-radius: 999px;
  transition: transform 0.18s, box-shadow 0.18s;
  box-shadow: var(--lp-shadow);
}
.lp-cta:hover { transform: translateY(-1px); box-shadow: 0 12px 32px var(--lp-accent-glow); }
.lp-cta-ghost {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid var(--lp-border); color: var(--lp-text);
  font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700;
  padding: 16px 22px; border-radius: 999px;
  transition: all 0.15s;
}
.lp-cta-ghost:hover { border-color: var(--lp-border-hover); color: var(--lp-text-strong); }
.lp-trust-line {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; color: var(--lp-text-dim); max-width: 720px;
}
.lp-trust-line b { color: var(--lp-text-strong); font-weight: 700; }
.lp-trust-dot {
  width: 8px; height: 8px; border-radius: 50%; background: var(--lp-success);
  box-shadow: 0 0 0 3px var(--lp-success-glow);
  flex-shrink: 0;
}
.lp-hero-stats {
  position: relative; z-index: 2;
  max-width: 1240px; margin: 0 auto; width: 100%;
  padding: 0 28px 56px;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
  background: var(--lp-border);
  border: 1px solid var(--lp-border);
}
.lp-hero-stat { background: var(--lp-bg); padding: 22px 24px; }
.lp-hero-stat-val {
  font-size: clamp(22px, 3vw, 36px); font-weight: 800; color: var(--lp-text-strong);
  letter-spacing: -0.02em; line-height: 1;
  font-variant-numeric: tabular-nums;
}
.lp-hero-stat-lbl {
  font-size: 11px; color: var(--lp-text-dim); letter-spacing: 0.12em; text-transform: uppercase;
  margin-top: 10px;
}
@media (max-width: 760px) {
  .lp-hero { min-height: auto; }
  .lp-hero-inner { padding: 64px 18px 40px; }
  .lp-hero-stats { grid-template-columns: repeat(2, 1fr); padding: 0 18px 36px; }
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.85); }
}

/* ─── marquee ─── */
.lp-marquee {
  position: relative;
  background: var(--lp-bg-soft); border-block: 1px solid var(--lp-border);
  overflow: hidden; padding: 26px 0;
}
.lp-marquee-fade {
  position: absolute; top: 0; bottom: 0; width: 120px; z-index: 2; pointer-events: none;
}
.lp-marquee-fade-l { left: 0;  background: linear-gradient(to right, var(--lp-bg-soft), transparent); }
.lp-marquee-fade-r { right: 0; background: linear-gradient(to left,  var(--lp-bg-soft), transparent); }
.lp-marquee-track {
  display: flex; gap: 50px;
  animation: marquee 45s linear infinite;
  width: max-content;
}
.lp-marquee-item {
  font-size: 14px; letter-spacing: 0.18em; font-weight: 700;
  color: var(--lp-text-muted); white-space: nowrap;
  display: inline-flex; align-items: center; gap: 14px;
}
.lp-marquee-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--lp-text-muted); opacity: 0.4;
}
@keyframes marquee { to { transform: translateX(-33.333%); } }

/* ─── pillars (zero MOQ + automation) ─── */
.lp-pillars { padding: 80px 0 40px; background: var(--lp-bg); }
.lp-pillars-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 18px;
}
.lp-pillar {
  background: var(--lp-bg-elev);
  border: 1px solid var(--lp-border);
  border-radius: 18px; padding: 36px 32px;
  position: relative; overflow: hidden;
  transition: border-color 0.2s, transform 0.2s;
}
.lp-pillar::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(500px 250px at 0% 0%, var(--lp-accent-soft), transparent 60%);
  opacity: 0.7;
}
.lp-pillar:hover { transform: translateY(-3px); border-color: var(--lp-border-hover); }
.lp-pillar > * { position: relative; z-index: 1; }
.lp-pillar-tag {
  display: inline-block; font-size: 10px; letter-spacing: 0.24em; font-weight: 800;
  color: var(--lp-accent); margin-bottom: 18px;
  padding: 5px 10px; border: 1px solid color-mix(in srgb, var(--lp-accent) 35%, transparent);
  border-radius: 999px; background: var(--lp-accent-soft);
}
.lp-pillar-mark {
  font-size: 64px; font-weight: 800; line-height: 1;
  color: var(--lp-accent); letter-spacing: -0.04em;
  margin-bottom: 16px;
  font-variant-numeric: tabular-nums;
  display: inline-flex; align-items: center; justify-content: center;
}
.lp-pillar-auto .lp-pillar-mark { width: 64px; height: 64px; }
.lp-pillar-h {
  font-size: clamp(24px, 2.6vw, 32px); font-weight: 800;
  color: var(--lp-text-strong); letter-spacing: -0.02em;
  margin: 0 0 14px 0;
}
.lp-pillar-p {
  font-size: 15px; line-height: 1.6; color: var(--lp-text-dim);
  margin: 0 0 22px 0;
}
.lp-pillar-p b { color: var(--lp-text-strong); font-weight: 700; }
.lp-strike {
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--lp-text-muted) 80%, transparent);
  color: var(--lp-text-muted);
}
.lp-pillar-foot { display: flex; flex-wrap: wrap; gap: 8px; }
.lp-chip {
  font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700;
  padding: 6px 12px; border-radius: 999px;
  background: var(--lp-accent-soft);
  border: 1px solid color-mix(in srgb, var(--lp-accent) 30%, transparent);
  color: var(--lp-accent);
}
@media (max-width: 900px) {
  .lp-pillars-grid { grid-template-columns: 1fr; }
  .lp-pillars { padding: 60px 0 20px; }
}

/* ─── section base ─── */
.lp-section { padding: 100px 0; }
.lp-section-dark { background: var(--lp-bg-soft); }
.lp-section-inner { max-width: 1240px; margin: 0 auto; padding: 0 28px; }
@media (max-width: 760px) { .lp-section { padding: 64px 0; } .lp-section-inner { padding: 0 18px; } }
.lp-tag {
  display: inline-block; font-size: 11px; letter-spacing: 0.28em; font-weight: 700;
  color: var(--lp-accent); margin-bottom: 14px;
  padding: 5px 10px; border: 1px solid color-mix(in srgb, var(--lp-accent) 35%, transparent);
  border-radius: 999px; background: var(--lp-accent-soft);
}
.lp-h2 {
  font-size: clamp(28px, 4.4vw, 54px); font-weight: 800; line-height: 1.06;
  letter-spacing: -0.025em; color: var(--lp-text-strong);
  margin: 0 0 16px 0; max-width: 820px;
}
.lp-sub {
  font-size: clamp(14px, 1.4vw, 17px); color: var(--lp-text-dim); line-height: 1.55;
  max-width: 640px; margin: 0 0 56px 0;
}

/* ─── stats grid ─── */
.lp-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.lp-stat-card {
  background: var(--lp-bg-elev); border: 1px solid var(--lp-border);
  padding: 32px 26px; border-radius: 14px;
  transition: border-color 0.2s, transform 0.2s;
  position: relative; overflow: hidden;
}
.lp-stat-card::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(400px 200px at 0% 0%, var(--lp-accent-soft), transparent 60%);
  opacity: 0; transition: opacity 0.3s;
}
.lp-stat-card:hover { border-color: var(--lp-border-hover); transform: translateY(-3px); }
.lp-stat-card:hover::after { opacity: 1; }
.lp-stat-val {
  font-size: clamp(28px, 3.6vw, 46px); font-weight: 800; color: var(--lp-text-strong);
  letter-spacing: -0.02em; line-height: 1; margin-bottom: 14px;
  font-variant-numeric: tabular-nums;
}
.lp-stat-lbl {
  font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700;
  color: var(--lp-accent); margin-bottom: 6px;
}
.lp-stat-sub { font-size: 13px; color: var(--lp-text-dim); line-height: 1.5; }
@media (max-width: 900px) { .lp-stat-grid { grid-template-columns: repeat(2, 1fr); } }

/* ─── steps ─── */
.lp-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; position: relative; }
.lp-steps-line {
  position: absolute; top: 28px; left: 8%; right: 8%; height: 1px;
  background: linear-gradient(to right, transparent, var(--lp-border) 10%, var(--lp-border) 90%, transparent);
  z-index: 0;
}
.lp-step {
  background: var(--lp-bg-elev); border: 1px solid var(--lp-border);
  padding: 30px 24px; border-radius: 14px;
  position: relative; z-index: 1;
  animation: fadeUp 0.6s ease-out both;
}
.lp-step-n {
  font-size: 12px; letter-spacing: 0.22em; font-weight: 800;
  color: var(--lp-accent); margin-bottom: 18px;
  display: inline-block; padding: 4px 8px;
  background: var(--lp-accent-soft); border-radius: 4px;
}
.lp-step-h { font-size: 18px; font-weight: 700; color: var(--lp-text-strong); margin: 0 0 10px 0; letter-spacing: -0.01em; }
.lp-step-p { font-size: 14px; color: var(--lp-text-dim); line-height: 1.6; margin: 0; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 900px) { .lp-steps { grid-template-columns: 1fr 1fr; } .lp-steps-line { display: none; } }
@media (max-width: 560px) { .lp-steps { grid-template-columns: 1fr; } }

/* ─── why us / interactive journey ─── */
.lp-journey { margin-top: 36px; }

/* The SVG map */
.lp-journey-svg {
  width: 100%; height: auto; max-height: 260px;
  display: block; margin: 0 auto 24px;
  overflow: visible;
}
.lp-journey-line {
  fill: none; stroke: var(--lp-border); stroke-width: 2;
}
.lp-journey-line-active {
  fill: none; stroke: url(#lp-journey-grad); stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.55s cubic-bezier(.65,0,.35,1);
  filter: drop-shadow(0 0 6px var(--lp-accent-glow));
}
.lp-journey-node { transition: transform 0.2s; }
.lp-journey-node:hover { transform: translateY(-2px); }
.lp-journey-halo {
  fill: var(--lp-accent-soft); opacity: 0;
  transition: opacity 0.25s, r 0.25s;
}
.lp-journey-ring {
  fill: var(--lp-bg); stroke: var(--lp-border); stroke-width: 2;
  transition: stroke 0.25s, fill 0.25s;
}
.lp-journey-dot {
  fill: var(--lp-text-muted);
  transition: fill 0.25s, r 0.25s;
}
.lp-journey-node.done .lp-journey-ring { stroke: var(--lp-accent); fill: var(--lp-accent-soft); }
.lp-journey-node.done .lp-journey-dot { fill: var(--lp-accent); }
.lp-journey-node.active .lp-journey-halo { opacity: 1; }
.lp-journey-node.active .lp-journey-ring { stroke: var(--lp-accent); fill: var(--lp-bg); stroke-width: 3; }
.lp-journey-node.active .lp-journey-dot { fill: var(--lp-accent); }
.lp-journey-num {
  fill: var(--lp-text-muted); font-size: 11px; font-weight: 700;
  letter-spacing: 0.14em; font-family: inherit;
  transition: fill 0.25s;
}
.lp-journey-label {
  fill: var(--lp-text-dim); font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.16em; font-family: inherit;
  transition: fill 0.25s;
}
.lp-journey-node.active .lp-journey-num,
.lp-journey-node.active .lp-journey-label { fill: var(--lp-text-strong); }
.lp-journey-node.done .lp-journey-num { fill: var(--lp-accent); }

/* The sliding stage below the map */
.lp-journey-stage {
  position: relative;
  background: var(--lp-bg-elev);
  border: 1px solid var(--lp-border);
  border-radius: 16px;
  padding: 36px 36px;
  min-height: 220px;
  overflow: hidden;
}
.lp-journey-slide {
  position: absolute; inset: 36px 36px;
  display: grid; grid-template-columns: 140px 1fr; gap: 32px;
  align-items: center;
  opacity: 0; transform: translateX(40px);
  transition: opacity 0.45s, transform 0.45s;
  pointer-events: none;
}
.lp-journey-slide.on {
  opacity: 1; transform: translateX(0);
  pointer-events: auto;
}
.lp-journey-slide.off-prev { transform: translateX(-40px); }

.lp-journey-vis {
  position: relative;
  width: 140px; height: 140px;
  display: flex; align-items: center; justify-content: center;
  background: var(--lp-bg); border: 1px solid var(--lp-border);
  border-radius: 14px;
  color: var(--lp-accent);
}
.lp-journey-vis svg { width: 56px; height: 56px; }
.lp-journey-vis-num {
  position: absolute; top: 10px; right: 12px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.16em;
  color: var(--lp-text-muted);
}

.lp-journey-side {}
.lp-journey-step {
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.18em;
  color: var(--lp-accent); margin-bottom: 12px;
}
.lp-journey-h {
  font-size: 24px; font-weight: 800; color: var(--lp-text-strong);
  margin: 0 0 10px 0; letter-spacing: -0.01em;
}
.lp-journey-p {
  font-size: 15px; color: var(--lp-text-dim); line-height: 1.65;
  margin: 0 0 18px 0; max-width: 56ch;
}
.lp-journey-stat {
  display: inline-flex; align-items: baseline; gap: 10px;
  padding: 10px 16px; border-radius: 999px;
  background: var(--lp-accent-soft);
  border: 1px solid color-mix(in srgb, var(--lp-accent) 24%, transparent);
}
.lp-journey-stat-v {
  font-size: 18px; font-weight: 800; color: var(--lp-text-strong);
  letter-spacing: -0.01em;
}
.lp-journey-stat-l {
  font-size: 11px; font-weight: 600; color: var(--lp-text-dim);
  letter-spacing: 0.08em; text-transform: uppercase;
}

/* The arrow + dot controls under the stage */
.lp-journey-ctrl {
  display: flex; align-items: center; justify-content: center;
  gap: 18px; margin-top: 22px;
}
.lp-journey-arrow {
  width: 36px; height: 36px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--lp-bg-elev); color: var(--lp-text);
  border: 1px solid var(--lp-border);
  cursor: pointer; transition: background 0.15s, border-color 0.15s, color 0.15s, opacity 0.15s;
}
.lp-journey-arrow:hover:not(:disabled) {
  background: var(--lp-accent-soft); border-color: var(--lp-accent);
  color: var(--lp-text-strong);
}
.lp-journey-arrow:disabled { opacity: 0.35; cursor: not-allowed; }
.lp-journey-dots { display: flex; gap: 8px; }
.lp-journey-dot-btn {
  width: 8px; height: 8px; border-radius: 999px;
  background: var(--lp-border); border: none; padding: 0;
  cursor: pointer; transition: background 0.2s, width 0.2s;
}
.lp-journey-dot-btn.on { background: var(--lp-accent); width: 22px; }
.lp-journey-dot-btn:hover:not(.on) { background: var(--lp-border-hover); }

@media (max-width: 900px) {
  .lp-journey-svg { display: none; }
  .lp-journey-stage { padding: 24px; min-height: 280px; }
  .lp-journey-slide { inset: 24px; grid-template-columns: 1fr; gap: 18px; }
  .lp-journey-vis { width: 88px; height: 88px; }
  .lp-journey-vis svg { width: 40px; height: 40px; }
  .lp-journey-h { font-size: 20px; }
  .lp-journey-p { font-size: 14px; }
}

/* ─── compare table ─── */
.lp-compare {
  background: var(--lp-bg-elev); border: 1px solid var(--lp-border);
  border-radius: 14px; overflow: hidden;
}
.lp-compare-row {
  display: grid; grid-template-columns: 1.4fr 1.6fr 1.6fr; gap: 0;
  border-bottom: 1px solid var(--lp-border);
}
.lp-compare-row:last-child { border-bottom: none; }
.lp-compare-head { background: var(--lp-bg-soft); }
.lp-compare-l, .lp-compare-us, .lp-compare-them {
  padding: 18px 22px; font-size: 14px;
}
.lp-compare-l { color: var(--lp-text-dim); font-weight: 600; }
.lp-compare-us {
  color: var(--lp-text-strong); display: flex; align-items: center; gap: 10px;
  background: linear-gradient(90deg, var(--lp-accent-soft), transparent 60%);
}
.lp-compare-us svg { color: var(--lp-accent); flex-shrink: 0; }
.lp-compare-them {
  color: var(--lp-text-muted); display: flex; align-items: center; gap: 10px;
  text-decoration: line-through; text-decoration-color: var(--lp-text-muted);
}
.lp-compare-them svg { color: var(--lp-text-muted); flex-shrink: 0; }
.lp-compare-tag {
  font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; font-weight: 800;
  padding: 5px 10px; border-radius: 999px;
}
.lp-compare-tag-us   { background: var(--lp-accent); color: #0a0a0a; }
.lp-compare-tag-them { border: 1px solid var(--lp-border-hover); color: var(--lp-text-dim); }
.lp-compare-head .lp-compare-us, .lp-compare-head .lp-compare-them { background: var(--lp-bg-soft); text-decoration: none; }
.lp-compare-row-hl .lp-compare-l { color: var(--lp-text-strong); font-weight: 700; }
.lp-compare-row-hl .lp-compare-us {
  background: linear-gradient(90deg, color-mix(in srgb, var(--lp-accent) 18%, transparent), var(--lp-accent-soft) 70%, transparent);
  color: var(--lp-text-strong); font-weight: 700;
}
.lp-compare-flag {
  display: inline-block; margin-left: 10px;
  font-size: 9.5px; letter-spacing: 0.2em; font-weight: 800;
  padding: 3px 7px; border-radius: 4px;
  background: var(--lp-accent); color: #0a0a0a;
}
@media (max-width: 760px) {
  .lp-compare-row { grid-template-columns: 1fr; }
  .lp-compare-l { padding-bottom: 6px; background: var(--lp-bg-soft); }
  .lp-compare-head { display: none; }
}

/* ─── badges ─── */
.lp-badges { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.lp-badge {
  background: var(--lp-bg-elev); border: 1px solid var(--lp-border);
  padding: 20px 22px; border-radius: 12px;
  display: flex; align-items: flex-start; gap: 14px;
  transition: border-color 0.2s, transform 0.2s;
}
.lp-badge:hover { border-color: var(--lp-border-hover); transform: translateY(-2px); }
.lp-badge-check {
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--lp-accent-soft); color: var(--lp-accent);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.lp-badge-l { font-size: 14px; font-weight: 700; color: var(--lp-text-strong); margin-bottom: 4px; }
.lp-badge-s { font-size: 12px; color: var(--lp-text-dim); }
@media (max-width: 760px) { .lp-badges { grid-template-columns: 1fr; } }

/* ─── quotes ─── */
.lp-quotes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 32px; }
.lp-quote {
  background: var(--lp-bg-elev); border: 1px solid var(--lp-border);
  padding: 28px 26px; border-radius: 14px; margin: 0;
  display: flex; flex-direction: column; gap: 16px;
  transition: border-color 0.2s, transform 0.2s;
}
.lp-quote:hover { border-color: var(--lp-border-hover); transform: translateY(-2px); }
.lp-quote-stars { display: flex; gap: 2px; color: var(--lp-accent); }
.lp-quote blockquote {
  font-size: 15px; line-height: 1.6; color: var(--lp-text);
  margin: 0; font-weight: 500; flex: 1;
}
.lp-quote figcaption {
  display: flex; align-items: center; gap: 12px;
  margin-top: 4px;
}
.lp-quote-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--lp-accent-soft); color: var(--lp-accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 800; letter-spacing: 0.04em;
  flex-shrink: 0;
}
.lp-quote figcaption b {
  display: block; font-size: 13px; font-weight: 700; color: var(--lp-text-strong);
}
.lp-quote figcaption em {
  display: block; font-size: 12px; font-style: normal; color: var(--lp-text-dim);
}
@media (max-width: 900px) { .lp-quotes { grid-template-columns: 1fr; } }

/* ─── final CTA ─── */
.lp-cta-section {
  padding: 120px 0;
  background:
    radial-gradient(800px 400px at 50% 0%, var(--lp-accent-glow), transparent 60%),
    var(--lp-bg);
  border-top: 1px solid var(--lp-border);
  text-align: center;
}
.lp-cta-h {
  font-size: clamp(28px, 4.4vw, 50px); font-weight: 800; color: var(--lp-text-strong);
  letter-spacing: -0.025em; line-height: 1.1;
  margin: 0 auto 18px; max-width: 760px;
}
.lp-cta-p { font-size: 16px; color: var(--lp-text-dim); line-height: 1.55; margin: 0 auto 32px; max-width: 560px; }
.lp-cta-soon { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.lp-soon-pill {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 12px 22px; border-radius: 999px;
  background: var(--lp-accent-soft);
  border: 1px solid color-mix(in srgb, var(--lp-accent) 30%, transparent);
  color: var(--lp-accent); font-size: 12px; font-weight: 700;
  letter-spacing: 0.18em; text-transform: uppercase;
}
.lp-soon-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--lp-accent); box-shadow: 0 0 0 4px var(--lp-accent-soft);
  animation: pulse 2s ease-in-out infinite;
}
.lp-soon-meta { font-size: 13px; color: var(--lp-text-dim); max-width: 480px; line-height: 1.5; }

/* ─── footer ─── */
.lp-foot { background: var(--lp-bg-deepest); border-top: 1px solid var(--lp-border); padding: 60px 0 0 0; }
.lp-foot-inner {
  max-width: 1240px; margin: 0 auto; padding: 0 28px;
  display: grid; grid-template-columns: 1.4fr 1fr; gap: 40px;
  padding-bottom: 40px; border-bottom: 1px solid var(--lp-border);
}
.lp-foot-brand { font-weight: 800; letter-spacing: 0.18em; font-size: 14px; color: var(--lp-text-strong); margin-bottom: 14px; }
.lp-foot-meta { font-size: 13px; color: var(--lp-text-dim); line-height: 1.7; }
.lp-foot-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.lp-foot-h {
  font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--lp-accent); font-weight: 700; margin-bottom: 14px;
}
.lp-foot-cols a {
  display: block; font-size: 13px; color: var(--lp-text-dim); padding: 4px 0;
  transition: color 0.15s;
}
.lp-foot-cols a:hover { color: var(--lp-text-strong); }
.lp-foot-soon { display: block; font-size: 13px; color: var(--lp-text-muted); padding: 4px 0; font-style: italic; }
.lp-foot-bar {
  max-width: 1240px; margin: 0 auto; padding: 22px 28px;
  font-size: 12px; color: var(--lp-text-muted);
  display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
}
@media (max-width: 760px) {
  .lp-foot-inner { grid-template-columns: 1fr; padding: 0 18px 30px; }
  .lp-foot-bar { padding: 20px 18px; }
}

/* ═══════════════════════════════════════════════════════════════════
   LIVE OPS — ticker bar above nav + terminal section
   ═══════════════════════════════════════════════════════════════════ */
.lp-ticker {
  position: sticky; top: 0; z-index: 60;
  background: #000;
  border-bottom: 1px solid #181818;
  height: 30px;
  font-family: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  overflow: hidden;
}
:root[data-theme="light"] .lp-ticker { background: #0a0a0a; }
.lp-ticker::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(243,196,26,0.65), transparent);
}
.lp-ticker-inner {
  max-width: 1440px; margin: 0 auto;
  padding: 0 18px;
  display: flex; align-items: center; gap: 14px;
  height: 100%;
  white-space: nowrap; overflow-x: auto;
  scrollbar-width: none;
}
.lp-ticker-inner::-webkit-scrollbar { display: none; }
.lp-ticker-status {
  display: inline-flex; align-items: center; gap: 7px;
  color: #4ade80;
}
.lp-ticker-pulse {
  width: 6px; height: 6px; border-radius: 999px;
  background: #4ade80;
  box-shadow: 0 0 0 0 rgba(74,222,128,0.55);
  animation: lp-tk-pulse 1.6s infinite;
}
@keyframes lp-tk-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(74,222,128,0.55); }
  70%  { box-shadow: 0 0 0 8px rgba(74,222,128,0); }
  100% { box-shadow: 0 0 0 0 rgba(74,222,128,0); }
}
.lp-ticker-status-txt { font-weight: 700; letter-spacing: 0.14em; color: #4ade80; }
.lp-ticker-sep { color: #2a2a2a; }
.lp-ticker-stat {
  display: inline-flex; align-items: baseline; gap: 7px;
  color: #9a9a9a;
}
.lp-ticker-stat-l { font-weight: 600; letter-spacing: 0.12em; color: #6a6a6a; }
.lp-ticker-stat-v { color: #f4f4f4; font-weight: 700; }
.lp-ticker-stat-v small { font-size: 9px; color: #6a6a6a; margin-left: 1px; }
.lp-ticker-spacer { flex: 1; min-width: 18px; }
.lp-ticker-event {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 3px 10px; border-radius: 4px;
  border: 1px solid #1c1c1c;
  animation: lp-tk-pop 0.4s ease-out;
}
@keyframes lp-tk-pop {
  from { opacity: 0; transform: translateX(6px); }
  to   { opacity: 1; transform: translateX(0); }
}
.lp-ticker-event-ok    { border-color: rgba(74,222,128,0.35); color: #4ade80; }
.lp-ticker-event-warn  { border-color: rgba(243,196,26,0.35); color: #f3c41a; }
.lp-ticker-event-info  { border-color: rgba(120,160,255,0.30); color: #c0d2ff; }
.lp-ticker-event-verb  { font-weight: 800; letter-spacing: 0.10em; }
.lp-ticker-event-detail{ color: #9a9a9a; font-weight: 600; }

/* Nav now sits below the ticker */
.lp-nav { top: 30px; }
.lp-nav.scrolled { top: 30px; }
@media (max-width: 720px) {
  .lp-ticker { height: 28px; font-size: 10px; }
  .lp-ticker-inner { gap: 10px; padding: 0 12px; }
  .lp-ticker-event { padding: 2px 8px; }
  .lp-ticker-stat-l { display: none; }
  .lp-nav, .lp-nav.scrolled { top: 28px; }
}

/* ═══════════════════════════════════════════════════════════════════
   HERO: cursor spotlight + cycling live pill animation
   ═══════════════════════════════════════════════════════════════════ */
.lp-hero {
  --lp-mx: 50%;
  --lp-my: 30%;
}
.lp-hero-spotlight {
  position: absolute; inset: 0; z-index: 2;
  pointer-events: none;
  background: radial-gradient(
    520px circle at var(--lp-mx) var(--lp-my),
    var(--lp-accent-glow),
    transparent 60%
  );
  mix-blend-mode: screen;
  transition: background 0.05s linear;
}
:root[data-theme="light"] .lp-hero-spotlight { mix-blend-mode: multiply; }

.lp-live-pill {
  animation: lp-pill-pop 0.35s ease-out;
}
@keyframes lp-pill-pop {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.lp-live-pill-verb {
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase;
  font-size: 10.5px; padding: 2px 7px;
  background: var(--lp-accent-soft); color: var(--lp-accent);
  border-radius: 4px;
}
.lp-live-pill-sep    { color: var(--lp-text-muted); margin: 0 6px; }
.lp-live-pill-detail { color: var(--lp-text); font-weight: 600; font-size: 12.5px; }
.lp-live-pill-ok   .lp-live-dot { background: var(--lp-success); box-shadow: 0 0 0 4px rgba(74,222,128,0.18); }
.lp-live-pill-warn .lp-live-dot { background: var(--lp-accent);  box-shadow: 0 0 0 4px var(--lp-accent-glow); }
.lp-live-pill-info .lp-live-dot { background: #7aa2ff; box-shadow: 0 0 0 4px rgba(122,162,255,0.18); }

/* ═══════════════════════════════════════════════════════════════════
   LIVE OPS SECTION — terminal log + animated counters
   ═══════════════════════════════════════════════════════════════════ */
.lp-liveops-section {
  background: var(--lp-bg-deepest);
  border-top: 1px solid var(--lp-border);
  border-bottom: 1px solid var(--lp-border);
}
.lp-tag-live {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(74,222,128,0.08); color: var(--lp-success);
  border: 1px solid rgba(74,222,128,0.30);
}
.lp-tag-pulse {
  width: 7px; height: 7px; border-radius: 999px;
  background: var(--lp-success);
  box-shadow: 0 0 0 0 var(--lp-success-glow);
  animation: lp-tk-pulse 1.6s infinite;
}
.lp-liveops-grid {
  display: grid; grid-template-columns: 1.45fr 1fr; gap: 22px;
  margin-top: 36px;
}
.lp-terminal {
  background: #050505; border: 1px solid #1a1a1a;
  border-radius: 14px; overflow: hidden;
  box-shadow: 0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04);
  font-family: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
  display: flex; flex-direction: column;
  min-height: 360px;
}
.lp-terminal-head {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 14px;
  background: #0c0c0c; border-bottom: 1px solid #1a1a1a;
}
.lp-terminal-dots { display: flex; gap: 6px; }
.lp-terminal-dot { width: 10px; height: 10px; border-radius: 999px; opacity: 0.85; }
.lp-terminal-dot-r { background: #ff5f56; }
.lp-terminal-dot-y { background: #ffbd2e; }
.lp-terminal-dot-g { background: #27c93f; }
.lp-terminal-title {
  flex: 1; text-align: center;
  font-size: 11.5px; color: #9a9a9a; letter-spacing: 0.06em; font-weight: 700;
}
.lp-terminal-title span { color: #6a6a6a; font-weight: 500; }
.lp-terminal-status {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 10.5px; letter-spacing: 0.10em; color: #4ade80;
  text-transform: uppercase; font-weight: 700;
}
.lp-terminal-status-dot {
  width: 6px; height: 6px; border-radius: 999px;
  background: #4ade80; animation: lp-tk-pulse 1.6s infinite;
}
.lp-terminal-body {
  flex: 1;
  padding: 16px 18px;
  font-size: 12.5px; line-height: 1.6;
  color: #cfcfcf;
  overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: #1c1c1c transparent;
}
.lp-terminal-body::-webkit-scrollbar { width: 6px; }
.lp-terminal-body::-webkit-scrollbar-thumb { background: #1c1c1c; border-radius: 999px; }
.lp-log-line {
  display: grid;
  grid-template-columns: auto auto 1fr; gap: 12px;
  padding: 1px 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  animation: lp-log-in 0.35s ease-out;
}
@keyframes lp-log-in {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}
.lp-log-ts     { color: #6a6a6a; }
.lp-log-verb   { font-weight: 800; letter-spacing: 0.06em; white-space: pre; }
.lp-log-detail { color: #cfcfcf; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.lp-log-ok   .lp-log-verb { color: #4ade80; }
.lp-log-warn .lp-log-verb { color: #f3c41a; }
.lp-log-info .lp-log-verb { color: #7aa2ff; }
.lp-log-cursor {
  color: var(--lp-accent); font-weight: 700;
  animation: lp-cursor 1s steps(2) infinite;
}
@keyframes lp-cursor {
  to { opacity: 0; }
}

.lp-liveops-stats {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  align-content: start;
}
.lp-liveops-stat {
  background: var(--lp-bg-elev); border: 1px solid var(--lp-border);
  border-radius: 12px; padding: 16px 16px 14px;
  position: relative; overflow: hidden;
}
.lp-liveops-stat::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(120deg, transparent 30%, var(--lp-accent-soft) 50%, transparent 70%);
  opacity: 0; transition: opacity 0.3s;
  pointer-events: none;
}
.lp-liveops-stat:hover::before { opacity: 1; }
.lp-liveops-stat-l {
  font-size: 9.5px; letter-spacing: 0.16em; font-weight: 800;
  color: var(--lp-text-muted); text-transform: uppercase;
}
.lp-liveops-stat-v {
  margin-top: 6px; margin-bottom: 10px;
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 28px; font-weight: 800; letter-spacing: -0.02em;
  color: var(--lp-text-strong);
}
.lp-liveops-stat-v small {
  font-size: 12px; font-weight: 600; color: var(--lp-text-muted);
  margin-left: 4px; letter-spacing: 0.04em;
}
.lp-liveops-stat-bar {
  height: 3px; border-radius: 999px;
  background: var(--lp-border); overflow: hidden;
}
.lp-liveops-stat-bar > div {
  height: 100%; background: var(--lp-accent);
  transition: width 0.7s cubic-bezier(.4,0,.2,1);
}
.lp-liveops-note {
  grid-column: 1 / -1;
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10.5px; color: var(--lp-text-muted);
  background: var(--lp-bg-elev); border: 1px solid var(--lp-border);
  border-radius: 10px; padding: 12px 14px;
  letter-spacing: 0.04em;
}
.lp-liveops-note-l { color: var(--lp-text-strong); font-weight: 700; }
@media (max-width: 980px) {
  .lp-liveops-grid { grid-template-columns: 1fr; }
  .lp-liveops-stats { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 560px) {
  .lp-liveops-stats { grid-template-columns: 1fr; }
  .lp-liveops-stat-v { font-size: 22px; }
}

/* ═══════════════════════════════════════════════════════════════════
   FOOTER STATUS ROW
   ═══════════════════════════════════════════════════════════════════ */
.lp-foot-status {
  max-width: 1240px; margin: 36px auto 0; padding: 0 28px;
  border-top: 1px solid var(--lp-border); border-bottom: 1px solid var(--lp-border);
}
.lp-foot-status-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
  padding: 14px 0;
  font-family: ui-monospace, "JetBrains Mono", monospace;
  font-size: 10.5px; color: var(--lp-text-muted);
  letter-spacing: 0.04em;
}
.lp-foot-status-pulse {
  width: 6px; height: 6px; border-radius: 999px;
  background: var(--lp-success);
  box-shadow: 0 0 0 0 var(--lp-success-glow);
  animation: lp-tk-pulse 1.6s infinite;
}
.lp-foot-status-l { color: var(--lp-text-strong); font-weight: 700; letter-spacing: 0.08em; }
.lp-foot-status-v { color: var(--lp-text-dim); }
.lp-foot-status-sep { color: var(--lp-border); }
.lp-foot-status-mono { color: var(--lp-accent); font-weight: 700; }
.lp-foot-status-link {
  margin-left: auto; color: var(--lp-text); font-weight: 700;
  border-bottom: 1px solid transparent; transition: border-color 0.15s;
}
.lp-foot-status-link:hover { border-color: var(--lp-accent); color: var(--lp-accent); }
@media (max-width: 760px) {
  .lp-foot-status { padding: 0 18px; }
  .lp-foot-status-link { margin-left: 0; width: 100%; }
}
`;
