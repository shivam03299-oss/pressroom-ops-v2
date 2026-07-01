import React, { useEffect, useRef, useState } from "react";
import { useSmartHeader } from "./useSmartHeader.js";
import SiteFooter from "./SiteFooter.jsx";

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

// Steps for the pinned horizontal-scroll "How Aviva works" scene. The
// stage sticks to the viewport while these panels slide across as you
// scroll — the Apple-style "page is still but things move" effect.
const PIN_STEPS = [
  { n: "01", h: "Send us your art", p: "Upload designs, sizes and quantities from your dashboard — or sync your Shopify store. No spreadsheets, no back-and-forth." },
  { n: "02", h: "We print in-house", p: "DTF & embroidery on our own floor — 200+ pieces an hour, a QC station at every transition. Zero outsourcing, ever." },
  { n: "03", h: "Packed & dispatched", p: "Every order QC-checked, neatly packed and handed to the courier the same day for cycle orders." },
  { n: "04", h: "Tracked to the door", p: "Live, per-order tracking in your dashboard — manifest to delivered, synced with the courier every minute." },
];

const CLIENTS = [
  "STREETWEAR LABEL", "PREMIUM LABEL", "ATHLEISURE BRAND", "OVERSIZED TEES CO.",
  "ESSENTIALS LABEL", "RESORT LABEL", "TECH-WEAR STUDIO", "+ 40 MORE LABELS",
];

const STEPS = [
  { n: "01", h: "Send us your art", p: "Drop designs, SKUs and quantities through your client dashboard or a Shopify sync. No spreadsheets, no back-and-forth." },
  { n: "02", h: "We print, pack, ship", p: "DTF printing in-house. QC at every station. Packed and handed to courier the same day for cycle orders." },
  { n: "03", h: "Track every piece", p: "Live status on every order from intake to dispatch. Workers punch attendance, machines log production — you watch the dashboard." },
  { n: "04", h: "Scale without ops", p: "Hire designers, not operations. Automation handles invoicing, payroll, P&L and inventory so you focus on growth." },
];

// Decoration methods we run in-house — surfaced as the bulk-orders band.
// Each card deep-links to the enquiry form with the service pre-selected.
const METHODS = [
  { id: "dtf",        name: "DTF transfers",   p: "Soft, stretchy, full-colour prints — our in-house default. Photoreal detail, zero minimums." },
  { id: "dtg",        name: "DTG",             p: "Direct-to-garment for fine, photographic art on cotton. Ideal for small, detailed runs." },
  { id: "screen",     name: "Screen printing", p: "The classic for bulk — bold, durable ink-on-fabric. Per-piece cost drops as volume climbs." },
  { id: "embroidery", name: "Embroidery",      p: "Stitched logos on tees, caps, hoodies & polos — that heavyweight, premium brand feel." },
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
  { id: "pack",   icon: "pack",   title: "Packed for you",   desc: "Plain mailers, your brand tag attached. 1 piece, 100 pieces, 10,000 — same packing workflow. Zero MOQ, zero setup fees.",          stat: "0",       statLabel: "MOQ" },
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
  { q: "The dashboard is something else. I can see exactly where every order is at any time. Saves me 10 hours a week.", a: "Operations lead", b: "fashion label", i: "AR", r: 5 },
  { q: "We tried three other vendors before settling here. Quality, turnaround and zero excuses — they just deliver.", a: "Founder", b: "streetwear label", i: "RK", r: 5 },
];

const BADGES = [
  { label: "GST registered",        sub: "fully compliant invoicing" },
  { label: "Same-day dispatch",     sub: "for orders in by 2pm" },
  { label: "Real client dashboards",sub: "live order tracking" },
];

// Hero background — Aviva's own factory floor (the "STREETWEAR FACTORY
// UNIT" shot with the branded wall on the left and sewing line on the
// right). File lives at public/hero-floor.png — Vite serves it at the
// URL "/hero-floor.png". Overlay is intentionally light so the wall
// signage + factory detail stay legible.
const HERO_BG = "/hero-floor.png";

// Fallback if the local file isn't deployed yet — same Unsplash shot
// we used before, just so the page doesn't look broken during the
// deploy window where /hero-floor.jpg might 404.
const HERO_BG_FALLBACK = "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=2200&q=80";

// ─────────────────────────────────────────────────────────────────────
// Theme — shared with /admin via localStorage key "pressroom-theme" and
// the data-theme attribute on <html>. Defaults to dark on first visit.
// ─────────────────────────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof document !== "undefined" && document.documentElement.dataset.theme) {
      return document.documentElement.dataset.theme;
    }
    try { return localStorage.getItem("pressroom-theme") || "light"; } catch { return "light"; }
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
  { verb: "ROUTING",    detail: "ORD-2849 · 12 pcs · streetwear label",   kind: "info" },
  { verb: "PRINTING",   detail: "ORD-2848 · 24 pcs · oversized tee",      kind: "warn" },
  { verb: "QC PASS",    detail: "ORD-2846 · 8 pcs · fashion label",       kind: "ok"   },
  { verb: "PACKING",    detail: "ORD-2845 · 16 pcs · 3 SKUs",             kind: "info" },
  { verb: "DISPATCHED", detail: "ORD-2842 · Delhivery · Mumbai",          kind: "ok"   },
  { verb: "DELIVERED",  detail: "ORD-2839 · Bangalore ✓",                 kind: "ok"   },
  { verb: "INTAKE",     detail: "ORD-2850 from Shopify · client label",   kind: "info" },
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
const LOG_BRANDS = ["streetwear label", "fashion label", "athleisure brand", "essentials co.", "resort label", "tech-wear studio", "premium label"];
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

// ─────────────────────────────────────────────────────────────────────
// Scroll-reveal: fade-up content as it enters the viewport. Used as a
// wrapper or via the useScrollReveal hook for inline elements. Each
// section gets a small choreographed reveal so the page feels like
// it's "developing" as you scroll, not a static dump.
// ─────────────────────────────────────────────────────────────────────
function useScrollReveal(threshold = 0.18) {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setRevealed(true); obs.disconnect(); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, revealed];
}

function Reveal({ children, delay = 0, className = "", as: As = "div" }) {
  const [ref, revealed] = useScrollReveal();
  return (
    <As ref={ref} className={`lp-reveal ${revealed ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </As>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Magnetic button: when the cursor enters a 180px radius the element
// translates toward the cursor by ~35% of the offset. Springs back on
// leave. Subtle enough to be felt without being annoying — premium-app
// micro-interaction signal.
// ─────────────────────────────────────────────────────────────────────
function useMagnetic(strength = 0.32, radius = 180) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let rafId = null;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (dist < radius) {
          el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
        } else {
          el.style.transform = "translate(0, 0)";
        }
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (rafId) cancelAnimationFrame(rafId);
      el.style.transform = "translate(0, 0)";
    };
  }, [strength, radius]);
  return ref;
}

// ─────────────────────────────────────────────────────────────────────
// 3D tilt: rotate an element a few degrees toward the cursor (CSS vars).
// Disabled on touch devices via pointer:fine media query in CSS.
// ─────────────────────────────────────────────────────────────────────
function use3DTilt(max = 8) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top)  / r.height;
      el.style.setProperty("--lp-tilt-y", `${(x - 0.5) * max * 2}deg`);
      el.style.setProperty("--lp-tilt-x", `${(y - 0.5) * -max * 2}deg`);
    };
    const onLeave = () => {
      el.style.setProperty("--lp-tilt-x", "0deg");
      el.style.setProperty("--lp-tilt-y", "0deg");
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [max]);
  return ref;
}


function useCountUp(target, decimals = 0) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const fired = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = typeof window !== "undefined" && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = () => {
      if (fired.current) return;
      fired.current = true;
      if (reduced) { setVal(target); return; }   // no motion → show the real number
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
    };
    let obs;
    if (typeof IntersectionObserver !== "undefined") {
      obs = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) run(); }, { threshold: 0.25 });
      obs.observe(el);
    }
    // Safety net: the stats sit just below the fold, so the scroll observer
    // may never fire for full-page screenshots, crawlers, IO-less browsers,
    // or visitors who don't scroll — leaving the headline numbers stuck at 0
    // (reads as "broken counters"). Guarantee the count-up plays shortly
    // after mount regardless, so the real values always show.
    const fallback = setTimeout(run, 1400);
    return () => { obs && obs.disconnect(); clearTimeout(fallback); };
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
  const [drawn,  setDrawn]  = useState(false);
  const ref = useRef(null);

  // Arrow-key navigation only when the section is in view. ALSO triggers
  // the path-drawing animation the first time the journey is reached.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let inView = false;
    const obs = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (e.isIntersecting) setDrawn(true);
    }, { threshold: 0.25 });
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
  // First-paint: base track is undrawn (offset = totalLen). On viewport
  // entry it draws to fully visible in 1.4s. Once drawn, normal use.
  const baseOffset = drawn ? 0 : totalLen;

  return (
    <div className="lp-journey" ref={ref}>
      <svg className="lp-journey-svg" viewBox="0 0 1000 240" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <defs>
          <linearGradient id="lp-journey-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="var(--lp-accent)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--lp-accent)" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <path d={pathD} className="lp-journey-line"
              style={{ strokeDasharray: totalLen, strokeDashoffset: baseOffset }} />
        <path d={pathD} className="lp-journey-line-active"
              style={{ strokeDasharray: totalLen, strokeDashoffset: drawn ? totalLen * (1 - progress) : totalLen }} />
        {/* Traveling dot that rides along the active portion of the path */}
        {drawn && (
          <circle r="4.5" className="lp-journey-comet">
            <animateMotion dur="2.4s" repeatCount="indefinite" rotate="auto">
              <mpath href="#lp-journey-path-anim"/>
            </animateMotion>
          </circle>
        )}
        <path id="lp-journey-path-anim" d={pathD} fill="none" stroke="none"/>
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
function WhatsAppIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.004c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01zM12.04 20.15h-.004a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.25 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01a.92.92 0 0 0-.67.31c-.23.25-.88.86-.88 2.1 0 1.23.9 2.42 1.03 2.59.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/>
    </svg>
  );
}
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

// When focus is one of "methods" | "process" | "why" | "compare", the
// page renders as a dedicated sub-route — only the matching section
// (plus header, breadcrumb, contact CTA, footer) shows. Used by
// /bulk-orders, /process, /why, /compare. Default (undefined) renders
// the full landing page exactly as before.
export default function Landing({ focus } = {}) {
  const [theme, toggleTheme] = useTheme();
  const { hidden: navHidden, scrolled } = useSmartHeader();
  const [menuOpen, setMenuOpen] = useState(false);
  const heroRef       = useRef(null);
  const magneticCta   = useMagnetic(0.30, 160);

  // Map focus → human-readable page title + intro copy for the
  // breadcrumb that sits above the section on sub-routes.
  const FOCUS_META = {
    dtf:       { tag: "PRINTING TYPES · DTF",        h: "DTF printing, done the way it should be.", sub: "Soft, full-colour, wash-durable transfers on any fabric and any colour — printed entirely in-house, never outsourced." },
    embroidery:{ tag: "PRINTING TYPES · EMBROIDERY", h: "Embroidery that feels like a premium label.", sub: "Dense, raised stitched thread on tees, hoodies, polos and caps — digitised and stitched in-house, with zero setup fees." },
    methods:   { tag: "BULK ORDERS",      h: "Every method, one roof — for any volume.", sub: "DTF, DTG, screen and embroidery under one roof, with bulk & wholesale pricing tuned to your run size." },
    process:   { tag: "OUR PROCESS",      h: "Four steps. That's the whole pipeline.",   sub: "Most brands ship within 48 hours of onboarding. Your dashboard goes live on day one." },
    why:       { tag: "WHY AVIVA",        h: "Follow an order from intake to door.",     sub: "Six stops, one pipeline — see exactly what we automate at every step." },
    compare:   { tag: "VS OTHERS",        h: "Aviva vs the alternatives.",               sub: "An honest side-by-side of how we stack up against agencies, freelancers and other print shops." },
    terms:     { tag: "LEGAL · TERMS",    h: "Terms & Conditions.",                      sub: "The rules that govern your use of Aviva International's services. Last updated 14 June 2026." },
    privacy:   { tag: "LEGAL · PRIVACY",  h: "Privacy Policy.",                          sub: "How we collect, use, store and protect your business and customer data. Last updated 14 June 2026." },
    contactus: { tag: "GET IN TOUCH",     h: "Talk to a human.",                         sub: "WhatsApp is fastest. Phone, email and our floor address are below for everything else." },
  };
  const focusMeta = focus ? FOCUS_META[focus] : null;
  const isFocused = !!focusMeta;

  // Close mobile drawer on Escape; lock body scroll while open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  // Auto-observe every [data-reveal] element — when one enters the
  // viewport, add `.in` for a fade-up animation. Saves wrapping every
  // section in <Reveal/>; we just sprinkle the data-attribute.
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    if (!els.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.14 });
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Scroll-progress engine for the immersive layer. Writes a normalised
  // progress (0→1) into CSS variables on every [data-pin] (sticky scenes)
  // and [data-parallax] (depth layers) on a single rAF-throttled, passive
  // scroll handler — CSS does the actual transform, so React never
  // re-renders and it stays buttery. Disabled under reduced-motion (the
  // CSS fallback turns pinned scenes into normal stacked sections).
  useEffect(() => {
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const pins = Array.from(document.querySelectorAll("[data-pin]"));
    const para = Array.from(document.querySelectorAll("[data-parallax]"));
    if (!pins.length && !para.length) return;
    const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight || 1;
      for (const el of pins) {
        const r = el.getBoundingClientRect();
        const total = r.height - vh;
        el.style.setProperty("--sp", (total > 0 ? clamp(-r.top / total) : 0).toFixed(4));
      }
      for (const el of para) {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--pp", clamp((vh - r.top) / (vh + r.height)).toFixed(4));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isFocused]);

  // Cursor spotlight on hero — track mouse and update CSS vars so a soft
  // radial gradient follows the pointer. Cheap, GPU-accelerated, slick.
  const onHeroMove = (e) => {
    if (!heroRef.current) return;
    const r = heroRef.current.getBoundingClientRect();
    heroRef.current.style.setProperty("--lp-mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    heroRef.current.style.setProperty("--lp-my", `${((e.clientY - r.top)  / r.height) * 100}%`);
  };

  return (
    <div className="lp">
      <style>{CSS}</style>

      <header className={`lp-nav ${scrolled ? "scrolled" : ""} ${navHidden && !menuOpen ? "lp-nav--hidden" : ""}`}>
        <div className="lp-nav-inner">
          {/* Mobile-only hamburger sits as the first column of the grid
              layout; desktop hides it. Placed here (sibling of .lp-brand)
              so the 3-col mobile grid keeps the logo perfectly centred. */}
          <button
            className="lp-burger"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span /><span /><span />
          </button>
          <a href="/" className="lp-brand" aria-label="Aviva International home">
            <img
              className="lp-brand-logo"
              src={theme === "light" ? "/aviva-wordmark-black.png" : "/aviva-wordmark-white.png"}
              alt="Aviva International"
              width="180"
              height="60"
            />
          </a>
          <nav className="lp-links">
            <a href="/catalog">Catalogue</a>
            <div className="lp-dropdown">
              <button className="lp-dropdown-trigger" aria-haspopup="true">
                Printing types
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
              </button>
              <div className="lp-dropdown-menu" role="menu">
                <a href="/dtf" role="menuitem">DTF printing</a>
                <a href="/embroidery" role="menuitem">Embroidery</a>
              </div>
            </div>
            <a href="/bulk-orders">Bulk orders</a>
            <a href="/process">Process</a>
            <a href="/why">Why us</a>
            <a href="/compare">Compare</a>
          </nav>
          <div className="lp-nav-right">
            <button className="lp-theme-btn" onClick={toggleTheme} aria-label="Toggle theme" title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <a href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer" className="lp-nav-cta lp-nav-cta-wa" title="Chat with us on WhatsApp">
              <WhatsAppIcon /> WhatsApp us
            </a>
            <a href="/enquire"        className="lp-nav-cta lp-nav-cta-ghost"  title="Send us a brief">Enquire</a>
            <a href="/portal"         className="lp-nav-cta lp-nav-cta-ghost"  title="For existing brand partners">Client login</a>
            <a href="/portal/signup"  className="lp-nav-cta lp-nav-cta-filled" title="Onboard your brand">Get started →</a>
          </div>
        </div>
      </header>

      {/* Mobile drawer — slides in from the right with the full menu.
          Hidden on desktop via CSS (.lp-drawer { display: none } at >880px).
          Close on backdrop, on link tap, on Esc. */}
      <div
        className={`lp-drawer-backdrop ${menuOpen ? "is-open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden={!menuOpen}
      />
      <aside className={`lp-drawer ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen}>
        <div className="lp-drawer-head">
          <span className="lp-drawer-eyebrow">MENU</span>
          <button className="lp-drawer-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <nav className="lp-drawer-links" onClick={() => setMenuOpen(false)}>
          <a href="/catalog">Catalogue</a>
          <a href="/dtf">DTF printing</a>
          <a href="/embroidery">Embroidery</a>
          <a href="/bulk-orders">Bulk orders</a>
          <a href="/process">Process</a>
          <a href="/why">Why us</a>
          <a href="/compare">Compare</a>
          <a href="/enquire">Enquire</a>
          <a href="/portal">Client login</a>
        </nav>
        <div className="lp-drawer-foot">
          <a href="/portal/signup" className="lp-drawer-cta" onClick={() => setMenuOpen(false)}>Get started →</a>
          <a href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer" className="lp-drawer-reach">
            WhatsApp · +91 92177 65507
          </a>
        </div>
      </aside>

      {/* Sub-route breadcrumb — only renders on /process /why /compare
          /bulk-orders. Lets the visitor know they landed on a dedicated
          page (not a fragment scroll) and gives them an easy way back. */}
      {isFocused && (
        <section className="lp-subpage-head">
          <div className="lp-section-inner">
            <div className="lp-subpage-crumb">
              <a href="/">← Home</a>
              <span className="lp-subpage-crumb-sep">/</span>
              <span>{focusMeta.tag}</span>
            </div>
            <div className="lp-tag" style={{ marginTop: 14 }}>{focusMeta.tag}</div>
            <h1 className="lp-h2 lp-subpage-h">{focusMeta.h}</h1>
            <p className="lp-sub">{focusMeta.sub}</p>
          </div>
        </section>
      )}

      {!isFocused && (
      <section ref={heroRef} className="lp-hero" onMouseMove={onHeroMove}>
        <div className="lp-hero-spotlight" />
        <div className="lp-hero-blob lp-hero-blob-a" aria-hidden />
        <div className="lp-hero-blob lp-hero-blob-b" aria-hidden />
        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <div className="lp-hero-eyebrow">
              <span className="lp-hero-eyebrow-dot" />
              PRINT ON DEMAND · ZERO MOQ
            </div>
            <h1 className="lp-h1">
              <span>Print, pack, ship —</span>
              <span className="lp-h1-em">without lifting a finger.</span>
            </h1>
            <p className="lp-lede">
              <b>Zero MOQ. Fully automated.</b> ₹20+ crore of streetwear printed for India's
              fastest-growing brands — order 1 piece or 10,000, the dashboard runs itself either way.
            </p>
            <div className="lp-cta-row">
              <span className="lp-magnetic-wrap" ref={magneticCta}>
                <a href="/portal/signup" className="lp-cta">
                  Create your account — free
                  <ArrowIcon />
                </a>
              </span>
              <a href="/catalog" className="lp-cta-ghost">Browse the catalogue</a>
            </div>
            <div className="lp-trust-line">
              <div className="lp-trust-dot" />
              <span><b>No sales call.</b> Sign up in minutes and order a single piece to test quality first.</span>
            </div>
            <div className="lp-trust-line">
              <div className="lp-trust-dot" />
              <span><b>Trusted by</b> 40+ streetwear &amp; fashion labels across India.</span>
            </div>
          </div>

          <div className="lp-hero-visual" data-parallax>
            <div className="lp-hero-visual-frame">
              <div
                className="lp-hero-photo"
                style={{ backgroundImage: `url(${HERO_BG}), url(${HERO_BG_FALLBACK})` }}
              />
              <div className="lp-hero-chip lp-hero-chip-tl">
                <div className="lp-hero-chip-dot" />
                <div>
                  <div className="lp-hero-chip-v">Same-day dispatch</div>
                  <div className="lp-hero-chip-l">for orders in by 2pm</div>
                </div>
              </div>
              <div className="lp-hero-chip lp-hero-chip-br">
                <div className="lp-hero-chip-v">DTF · in-house</div>
                <div className="lp-hero-chip-l">200+ pcs / hour</div>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-hero-stats">
          {STATS.map(s => <CountStat key={s.label} stat={s} big />)}
        </div>
      </section>
      )}

      {!isFocused && (
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
      )}

      {!isFocused && (
      <section className="lp-pin" data-pin aria-label="How Aviva works">
        <div className="lp-pin-stage">
          <div className="lp-pin-head">
            <span className="lp-pin-eyebrow">How Aviva works</span>
            <div className="lp-pin-bars">
              {PIN_STEPS.map((_, i) => <span key={i} className="lp-pin-bar" style={{ "--i": i }} />)}
            </div>
          </div>
          <div className="lp-pin-track">
            {PIN_STEPS.map((s) => (
              <div className="lp-pin-panel" key={s.n}>
                <div className="lp-pin-n">{s.n}</div>
                <div className="lp-pin-h">{s.h}</div>
                <div className="lp-pin-p">{s.p}</div>
              </div>
            ))}
          </div>
          <div className="lp-pin-hint" aria-hidden>Scroll ↓</div>
        </div>
      </section>
      )}

      {!isFocused && (
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
      )}

      {(!isFocused || focus === "process") && (
      <section id="process" className="lp-section lp-section-dark">
        <div className="lp-section-inner" data-reveal>
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
      )}

      {(!isFocused || focus === "why") && (
      <section id="why" className="lp-section">
        <div className="lp-section-inner" data-reveal>
          <div className="lp-tag">WHY AVIVA</div>
          <h2 className="lp-h2">Follow an order from intake to your customer's door.</h2>
          <p className="lp-sub">Six stops, one pipeline. Tap a node — or use ← → — to see exactly what we automate at every step.</p>
          <Journey />
        </div>
      </section>
      )}

      {(!isFocused || focus === "methods") && (
      <section id="methods" className="lp-section lp-section-dark">
        <div className="lp-section-inner" data-reveal>
          <div className="lp-tag">EVERY METHOD · ONE ROOF</div>
          <h2 className="lp-h2">Bulk orders? We print every way there is.</h2>
          <p className="lp-sub">DTF, DTG, screen printing and embroidery — under one roof, with bulk &amp; wholesale pricing. From a single sample to tens of thousands of pieces.</p>
          <div className="lp-methods">
            {METHODS.map((m, i) => (
              <a key={m.id} href={`/enquire?service=${m.id}`} className="lp-method" data-method={m.id} style={{ animationDelay: `${i * 60}ms` }}>
                <div className="lp-method-visual"><MethodIcon kind={m.id} /></div>
                <div className="lp-method-name">{m.name}</div>
                <p className="lp-method-p">{m.p}</p>
                <span className="lp-method-cta">Enquire <span aria-hidden>→</span></span>
              </a>
            ))}
          </div>
          <div className="lp-methods-foot">
            <span>Need a large or recurring run?</span>
            <a href="/enquire?service=bulk" className="lp-method-bulk">Get bulk &amp; wholesale pricing →</a>
          </div>
        </div>
      </section>
      )}

      {(!isFocused || focus === "pricing") && (
      <section id="pricing" className="lp-section lp-section-dark">
        <div className="lp-section-inner" data-reveal>
          <div className="lp-tag">PRICING</div>
          <h2 className="lp-h2">Premium prints. Honest prices. No surprises.</h2>
          <p className="lp-sub">We obsess over print quality — and keep it the best-priced in the market. Transparent, GST-inclusive, pay only for what you print. No minimums, no setup traps, no hidden costs.</p>
          <div className="lp-pricing-grid">
            <div className="lp-price-card">
              <div className="lp-price-k">DTF prints</div>
              <div className="lp-price-v">from ₹54</div>
              <p className="lp-price-sub">Vivid, wash-durable full-colour prints up to 16×20″ — priced <strong>up to 50% below the market</strong>.</p>
            </div>
            <div className="lp-price-card lp-price-card-hl">
              <div className="lp-price-k">Embroidery</div>
              <div className="lp-price-v">flat ₹300</div>
              <p className="lp-price-sub">Per patch, any design — with <strong>zero digitizing or setup fees</strong> (most charge ₹400+ upfront).</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">Minimum order</div>
              <div className="lp-price-v">just 1</div>
              <p className="lp-price-sub">Start from a single piece and scale to thousands — wholesale rates kick in on bulk runs.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">What you see</div>
              <div className="lp-price-v">is what you pay</div>
              <p className="lp-price-sub">GST-inclusive pricing shown live in your dashboard before you confirm. Nothing hidden, ever.</p>
            </div>
          </div>
          <div className="lp-methods-foot">
            <span>Running volume?</span>
            <a href="/enquire?service=bulk" className="lp-method-bulk">Get bulk &amp; wholesale pricing →</a>
          </div>
        </div>
      </section>
      )}

      {(!isFocused || focus === "store") && (
      <section id="store" className="lp-section">
        <div className="lp-section-inner" data-reveal>
          <div className="lp-tag">YOUR OWN STORE</div>
          <h2 className="lp-h2">No store yet? We'll build you one the market hasn't seen.</h2>
          <p className="lp-sub">Stuck on where to sell — or stuck with a store that looks like everyone else's? We design and build your own <strong>Shopify store</strong>: premium, unmistakably yours, and nothing like the cookie-cutter template every other print &amp; email brand ships. Running out of ideas? <strong>Just enquire — we're here to help.</strong></p>
          <div className="lp-pricing-grid">
            <div className="lp-price-card lp-price-card-hl">
              <div className="lp-price-k">Premium by default</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>Looks funded</div>
              <p className="lp-price-sub">Editorial, high-end design that reads like a backed D2C label — not a print catalogue.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">Truly custom</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>One of a kind</div>
              <p className="lp-price-sub">Built around your brand — type, motion, layout, the works. No two Aviva stores look alike.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">All under one roof</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>You sell, we ship</div>
              <p className="lp-price-sub">Store, products, printing &amp; fulfilment — wired together. You make sales; we print and dispatch.</p>
            </div>
          </div>
          <div className="lp-cta-row" style={{ marginTop: 30 }}>
            <a href="/enquire?service=store" className="lp-cta">Build my store →</a>
            <a href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer" className="lp-method-bulk">Or message us on WhatsApp →</a>
          </div>
        </div>
      </section>
      )}

      {(!isFocused || focus === "compare") && (
      <section id="compare" className="lp-section">
        <div className="lp-section-inner" data-reveal>
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
      )}

      {/* ── /dtf — Printing types › DTF ──────────────────────────── */}
      {focus === "dtf" && (
      <section className="lp-section">
        <div className="lp-section-inner" data-reveal>
          <p className="lp-sub" style={{ maxWidth: 780 }}>
            <strong>DTF (Direct-to-Film)</strong> is the modern way to print apparel: your artwork is printed onto a film, bonded to the garment with adhesive and heat, then cured. The result is a soft, full-colour, stretchable print that survives wash after wash — on cotton, polyester, blends and fleece, in any colour. We run it <strong>entirely in-house</strong>, so quality and pricing are ours to control, never outsourced.
          </p>

          <div className="lp-tag" style={{ marginTop: 44 }}>WHAT MAKES OUR DTF DIFFERENT</div>
          <div className="lp-pricing-grid">
            <div className="lp-price-card">
              <div className="lp-price-k">Photoreal detail</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>Full colour, free</div>
              <p className="lp-price-sub">High-density inks lay down crisp gradients, fine lines and photographic artwork that screen printing simply can't match — at no extra cost per colour.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">Soft hand-feel</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>Moves with it</div>
              <p className="lp-price-sub">A thin, stretchy finish that flexes with the fabric — none of that stiff plastic patch sitting on top of the garment.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">Any fabric, any colour</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>Vivid on darks</div>
              <p className="lp-price-sub">Cotton, poly, blends, fleece, lights or blacks — DTF bonds to all of them with bright, opaque colour.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">Wash-durable</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>Cured right</div>
              <p className="lp-price-sub">Properly cured on every run, so prints survive repeated washing without cracking, peeling or fading.</p>
            </div>
          </div>

          <div className="lp-tag" style={{ marginTop: 44 }}>WHY OURS BEATS THE ALTERNATIVES</div>
          <div className="lp-pricing-grid">
            <div className="lp-price-card lp-price-card-hl">
              <div className="lp-price-k">vs outsourced POD</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>100% in-house</div>
              <p className="lp-price-sub">No blended pricing, no mystery quality, no finger-pointing. We print it, we QC it, we own it.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">vs screen printing</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>Zero setup</div>
              <p className="lp-price-sub">No screens, no minimums, no per-colour fees — order 1 piece or 10,000 at the same per-unit quality.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">vs cheap transfers</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>No peeling</div>
              <p className="lp-price-sub">Premium films + correct curing + a QC check on every piece before it ships. Quality you can feel.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">Best price in market</div>
              <div className="lp-price-v">from ₹54</div>
              <p className="lp-price-sub">Up to 16×20″, GST-inclusive — <strong>up to 50% below the market</strong>, shown live in your dashboard.</p>
            </div>
          </div>

          <div className="lp-methods-foot">
            <span>Ready to print?</span>
            <a href="/enquire?service=dtf" className="lp-method-bulk">Get a DTF quote →</a>
          </div>
        </div>
      </section>
      )}

      {/* ── /embroidery — Printing types › Embroidery ───────────────── */}
      {focus === "embroidery" && (
      <section className="lp-section">
        <div className="lp-section-inner" data-reveal>
          <p className="lp-sub" style={{ maxWidth: 780 }}>
            <strong>Embroidery</strong> stitches your logo or artwork directly into the garment with real thread — the dense, raised, textured finish that instantly reads as a premium, funded brand. It's the most durable decoration there is: thread outlives the fabric. We digitise and stitch <strong>in-house</strong> on tees, hoodies, polos and caps — with <strong>zero setup fees</strong>.
          </p>

          <div className="lp-tag" style={{ marginTop: 44 }}>WHAT MAKES OUR EMBROIDERY DIFFERENT</div>
          <div className="lp-pricing-grid">
            <div className="lp-price-card">
              <div className="lp-price-k">Premium hand-feel</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>Reads funded</div>
              <p className="lp-price-sub">Dense, raised stitching that signals a high-end label the moment it's touched — the look money usually buys.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">Built to last</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>Outlives it</div>
              <p className="lp-price-sub">Thread doesn't crack, peel or fade. Embroidery typically outlives the garment it sits on.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">Front, back, sleeve &amp; cap</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>Up to 3.5×6.5″</div>
              <p className="lp-price-sub">Portrait or landscape, multiple patches per piece — placed exactly where your brand needs them.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">Digitised in-house</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>No delays</div>
              <p className="lp-price-sub">We convert your logo into a clean stitch file ourselves — no third-party hand-offs, no waiting.</p>
            </div>
          </div>

          <div className="lp-tag" style={{ marginTop: 44 }}>WHY OURS BEATS THE ALTERNATIVES</div>
          <div className="lp-pricing-grid">
            <div className="lp-price-card lp-price-card-hl">
              <div className="lp-price-k">No digitizing fee</div>
              <div className="lp-price-v">flat ₹300</div>
              <p className="lp-price-sub">Most vendors charge ₹400+ upfront per design to digitise. We don't — flat ₹300 a patch, 5% GST, done.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">Zero minimums</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>Order just 1</div>
              <p className="lp-price-sub">Embroider a single cap or a thousand hoodies at exactly the same quality and price per piece.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">In-house = consistent</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>No variance</div>
              <p className="lp-price-sub">Same machines, same operators, same QC every run — none of the drift you get from outsourcing.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-price-k">Best premium value</div>
              <div className="lp-price-v" style={{ fontSize: 22 }}>Print-level price</div>
              <p className="lp-price-sub">The most premium-looking decoration there is — at pricing closer to a print than a luxury add-on.</p>
            </div>
          </div>

          <div className="lp-methods-foot">
            <span>Want that premium feel?</span>
            <a href="/enquire?service=embroidery" className="lp-method-bulk">Get an embroidery quote →</a>
          </div>
        </div>
      </section>
      )}

      {/* ── /terms ─────────────────────────────────────────────────
          Sub-page only. Standard B2B print-services terms — concise,
          plain-language, no legalese spread. Numbered sections so
          we can reference clauses by id if a client asks. */}
      {focus === "terms" && (
      <section className="lp-section">
        <div className="lp-section-inner lp-legal">
          <h3>1. Acceptance</h3>
          <p>By creating an Aviva account, uploading orders, or recharging your wallet, you agree to be bound by these Terms &amp; Conditions and our <a href="/privacy">Privacy Policy</a>. If you don't agree, stop using the service.</p>

          <h3>2. The service</h3>
          <p>Aviva International ("Aviva", "we") provides print-on-demand DTF, DTG, screen-printing and embroidery services from our Delhi production unit, plus a dashboard that automates intake, production, packing, dispatch and invoicing for streetwear brands.</p>

          <h3>3. Your responsibilities</h3>
          <p>You agree to (a) provide accurate brand, billing and GST information, (b) hold all rights to artwork you upload — Aviva is not liable for copyright disputes arising from your designs, (c) keep your login credentials secure, and (d) keep your wallet balance positive before placing new orders.</p>

          <h3>4. Payments &amp; wallet</h3>
          <p>Aviva operates on a prepaid wallet model. You top up via Cashfree (UPI, cards, net banking, payment links). Production costs are debited from the wallet at the point your batch is packed. Wallet balances are non-refundable in cash but can be applied against future orders indefinitely. All prices include 5% GST unless otherwise stated; tax invoices are auto-generated on every recharge and downloadable from your dashboard.</p>

          <h3>5. Production timelines</h3>
          <p>Standard production is 24–72 hours from upload to dispatch, courier-dependent. Same-day dispatch applies only to orders confirmed before our cut-off (1:00 PM IST, Mon–Sat). We make no guarantee of delivery dates — those are set by the courier (Velocity, Delhivery, Bluedart, DTDC, etc.).</p>

          <h3>6. Quality &amp; reprints</h3>
          <p>Each piece is QC-checked at pack. If you receive a misprint, wrong size or damaged item, raise it within 7 days of delivery via WhatsApp with a photo. We reprint or refund (your call) at our cost. Damages reported after 7 days are best-effort.</p>

          <h3>7. Cancellations &amp; refunds</h3>
          <p>Orders can be cancelled before they reach the "in production" stage in your dashboard at no charge. Once in production, the printed pieces have been costed against your wallet and cannot be cancelled. Wallet refunds (instead of credit) are issued only in cases of our error, processed via the original payment method within 7 business days.</p>

          <h3>8. Intellectual property</h3>
          <p>You retain all rights to your artwork, brand assets, customer data and order data. Aviva claims no ownership over content you upload. We may use anonymised aggregate data (e.g. "we printed 4M pieces last year") for marketing. We will never share your customer-level data with anyone outside your fulfilment chain.</p>

          <h3>9. Limitation of liability</h3>
          <p>Aviva's total liability for any claim is limited to the wallet balance held by you at the time of the claim. We are not liable for indirect or consequential damages (lost sales, brand reputation, etc.). Force majeure events (courier strikes, natural disasters, network outages) are excluded.</p>

          <h3>10. Governing law</h3>
          <p>These Terms are governed by the laws of India. Any dispute is subject to the exclusive jurisdiction of courts in Delhi.</p>

          <h3>11. Changes</h3>
          <p>We may update these Terms from time to time. Material changes will be notified via email or the dashboard banner at least 14 days before they take effect.</p>

          <h3>12. Contact</h3>
          <p>Questions about these Terms? Email <a href="mailto:avivainternational05@gmail.com">avivainternational05@gmail.com</a> or WhatsApp <a href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer">+91 92177 65507</a>.</p>
        </div>
      </section>
      )}

      {/* ── /privacy ──────────────────────────────────────────────── */}
      {focus === "privacy" && (
      <section className="lp-section">
        <div className="lp-section-inner lp-legal">
          <h3>1. Who we are</h3>
          <p>Aviva International ("Aviva", "we") operates print-on-demand services from Delhi, India. This policy explains what data we collect when you use our dashboard at avivainternational.co, why, and your rights over it.</p>

          <h3>2. What we collect</h3>
          <ul>
            <li><strong>Account data</strong> — name, email, phone, brand name, password (hashed).</li>
            <li><strong>Billing data</strong> — legal entity name, GSTIN, billing address, PAN (optional) — for tax invoices.</li>
            <li><strong>Order data</strong> — shipping labels you upload, courier &amp; AWB info, product details, design files.</li>
            <li><strong>Your customers' data</strong> — names, addresses, phone numbers that appear on the labels you upload. We do not contact your customers; we use this only to print, pack and dispatch.</li>
            <li><strong>Payment data</strong> — handled by Cashfree, not stored on our servers. We see only "₹X paid on date".</li>
            <li><strong>Usage data</strong> — login timestamps, page views, errors. No third-party analytics tracker is loaded.</li>
          </ul>

          <h3>3. How we use it</h3>
          <p>Strictly to deliver the service: print, pack, ship, invoice, support. We don't sell or rent your data. We don't profile you for advertising. We don't share customer-level data with anyone except the couriers you've chosen.</p>

          <h3>4. Third parties we share with</h3>
          <ul>
            <li><strong>Couriers</strong> — Velocity, Delhivery, Bluedart, DTDC, Amazon Shipping — for pickup &amp; delivery. They receive only the data on the shipping label you uploaded.</li>
            <li><strong>Cashfree</strong> — for payment processing. Their privacy policy applies to payment instrument data.</li>
            <li><strong>Supabase</strong> — our database + auth provider. Data is stored encrypted at rest in their Mumbai region.</li>
            <li><strong>Shopify</strong> (if you connect your store) — read-only access to orders, products, customers, fulfilments via OAuth. You can disconnect at any time from /portal → Stores.</li>
          </ul>

          <h3>5. Data retention</h3>
          <p>Account &amp; billing data are kept for as long as your account is active, plus 7 years after closure to meet Indian tax-record requirements. Order &amp; customer data tied to invoices share the same 7-year window. Other data (logs, session tokens) is purged within 90 days.</p>

          <h3>6. Cookies</h3>
          <p>One essential session cookie (Supabase auth token) — no analytics, no advertising, no third-party trackers. Your browser handles it; clearing cookies logs you out.</p>

          <h3>7. Security</h3>
          <p>All traffic is over HTTPS. Passwords are bcrypt-hashed. Database access is gated by row-level security policies that scope each client's data to their own tenant. Production environment is on Vercel + Supabase, both SOC 2 compliant.</p>

          <h3>8. Your rights</h3>
          <p>You can request a data export, correct any inaccuracy, or have your account &amp; data deleted (subject to the 7-year tax retention) by emailing <a href="mailto:avivainternational05@gmail.com">avivainternational05@gmail.com</a>. We respond within 30 days.</p>

          <h3>9. Children</h3>
          <p>Aviva is a B2B service. We do not knowingly collect data from anyone under 18.</p>

          <h3>10. Changes</h3>
          <p>Material policy changes are emailed and posted as a banner on your dashboard at least 14 days before they take effect.</p>

          <h3>11. Contact</h3>
          <p>Privacy questions or data requests: <a href="mailto:avivainternational05@gmail.com">avivainternational05@gmail.com</a> or WhatsApp <a href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer">+91 92177 65507</a>.</p>
        </div>
      </section>
      )}

      {/* ── /contact-us ───────────────────────────────────────────── */}
      {focus === "contactus" && (
      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-contact-grid">
            <a className="lp-contact-card" href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer">
              <div className="lp-contact-card-tag">FASTEST</div>
              <div className="lp-contact-card-h">WhatsApp</div>
              <div className="lp-contact-card-v">+91 92177 65507</div>
              <div className="lp-contact-card-sub">Quotes &amp; ops · usually under 10 min</div>
            </a>
            <a className="lp-contact-card" href="mailto:avivainternational05@gmail.com">
              <div className="lp-contact-card-tag">EMAIL</div>
              <div className="lp-contact-card-h">Inbox</div>
              <div className="lp-contact-card-v">avivainternational05@gmail.com</div>
              <div className="lp-contact-card-sub">Invoicing, contracts, partnerships</div>
            </a>
            <a className="lp-contact-card" href="tel:+919217765507">
              <div className="lp-contact-card-tag">PHONE</div>
              <div className="lp-contact-card-h">Call</div>
              <div className="lp-contact-card-v">+91 92177 65507</div>
              <div className="lp-contact-card-sub">Mon–Sat · 10:00 – 19:00 IST</div>
            </a>
            <a className="lp-contact-card" href="/enquire">
              <div className="lp-contact-card-tag">FORM</div>
              <div className="lp-contact-card-h">Send a brief</div>
              <div className="lp-contact-card-v">Onboarding form</div>
              <div className="lp-contact-card-sub">Volume + product + timelines — we reply in 12h</div>
            </a>
          </div>

          <div className="lp-contact-foot">
            <div>
              <div className="lp-tag">FLOOR</div>
              <h3 className="lp-contact-floor-h">Aviva International · Delhi production unit</h3>
              <p>
                Walk-ins by appointment only. WhatsApp first — the floor runs lean and we'd rather not have you waiting.<br/>
                Pickup pin <strong>110089</strong> · ships pan-India via Velocity, Delhivery, Bluedart, DTDC &amp; Amazon Shipping.
              </p>
            </div>
            <div>
              <div className="lp-tag">HOURS</div>
              <h3 className="lp-contact-floor-h">Mon–Sat · 10:00–19:00 IST</h3>
              <p>
                Sundays the floor is shut, but WhatsApp messages still get answered for emergencies (RTO escalations, dispatch issues, urgent re-prints).
              </p>
            </div>
          </div>
        </div>
      </section>
      )}

      {!isFocused && (
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
      )}

      {!isFocused && (
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
      )}

      <section id="contact" className="lp-cta-section">
        <div className="lp-section-inner">
          <h2 className="lp-cta-h">Ready to stop worrying about production?</h2>
          <p className="lp-cta-p">
            Tell us your monthly volume and what you're printing. We come back within 12 hours with a quote and an onboarding plan.
          </p>
          <div className="lp-cta-channels">
            <a className="lp-cta-channel" href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer">
              <span className="lp-cta-channel-l">WhatsApp</span>
              <span className="lp-cta-channel-v">+91 92177 65507</span>
            </a>
            <a className="lp-cta-channel" href="mailto:avivainternational05@gmail.com">
              <span className="lp-cta-channel-l">Email</span>
              <span className="lp-cta-channel-v">avivainternational05@gmail.com</span>
            </a>
          </div>
        </div>
      </section>

      <SiteFooter theme={theme} />
    </div>
  );
}

// ─── small icon components ───
function ArrowIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>; }
function CheckIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>; }
function CrossIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>; }
function StarIcon()  { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" /></svg>; }
function MethodIcon({ kind }) {
  const p = { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (kind) {
    case "dtf":        return <svg {...p}><path d="M12 2 3 7l9 5 9-5-9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 17l9 5 9-5" /></svg>;
    case "dtg":        return <svg {...p}><rect x="3" y="8" width="18" height="9" rx="2" /><path d="M7 8V4h10v4" /><path d="M7 17v3h10v-3" /><path d="M17 12h.01" /></svg>;
    case "screen":     return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
    case "embroidery": return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="3.4" /></svg>;
    default: return null;
  }
}
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

/* ───────────────────────────────────────────────────────────────────
   AVIVA · marketing landing — bright "Gelato-grade" design system.
   Light is the primary, conversion-optimised theme; dark is a tasteful
   secondary kept on the shared toggle. One signature accent: electric
   lime-green. Generous whitespace, big rounded cards, soft shadows,
   pill buttons, friendly geometric type.
   ─────────────────────────────────────────────────────────────────── */
:root {
  --lp-bg:            #ffffff;
  --lp-bg-elev:       #ffffff;
  --lp-bg-soft:       #f4f6fb;   /* alternating cool band */
  --lp-bg-card:       #ffffff;
  --lp-bg-mint:       #eaf0ff;   /* light-blue tinted band */
  --lp-ink:           #0b0e16;   /* near-black headlines */
  --lp-text:          #3a4150;   /* body */
  --lp-text-strong:   #0b0e16;
  --lp-text-dim:      #555d6c;   /* secondary */
  --lp-text-muted:    #868d9c;   /* hints */
  --lp-border:        #e6e9f1;
  --lp-border-hover:  #d2d8e6;
  --lp-accent:        #2c5cff;   /* electric blue */
  --lp-accent-2:      #1c43d8;   /* deep blue — text on white / hover */
  --lp-accent-ink:    #ffffff;   /* text that sits on blue */
  --lp-accent-soft:   #eaf0ff;   /* very light blue fill */
  --lp-accent-soft-2: #d7e2ff;
  --lp-accent-glow:   rgba(44, 92, 255, 0.32);
  --lp-accent-line:   rgba(44, 92, 255, 0.42);
  --lp-success:       #16a34a;
  --lp-success-glow:  rgba(22, 163, 74, 0.18);
  --lp-err:           #e11d48;
  --lp-cyan:          #0891b2;
  --lp-warn:          #d97706;
  --lp-r:             22px;
  --lp-r-lg:          30px;
  --lp-r-sm:          14px;
  --lp-shadow-sm:     0 2px 10px rgba(13, 18, 38, 0.05);
  --lp-shadow:        0 14px 38px rgba(13, 22, 60, 0.08);
  --lp-shadow-lg:     0 30px 70px rgba(13, 22, 60, 0.14);
  --lp-shadow-accent: 0 16px 34px rgba(44, 92, 255, 0.30);
  --lp-img-filter:    saturate(1.02) contrast(1.02);
  color-scheme: light;
}
:root[data-theme="dark"] {
  --lp-bg:            #0a0d15;
  --lp-bg-elev:       #121826;
  --lp-bg-soft:       #0d1119;
  --lp-bg-card:       #141a2a;
  --lp-bg-mint:       #101a33;
  --lp-ink:           #eef2fa;
  --lp-text:          #bcc3d4;
  --lp-text-strong:   #f5f8ff;
  --lp-text-dim:      #8e97a9;
  --lp-text-muted:    #69717f;
  --lp-border:        #222a3c;
  --lp-border-hover:  #33405c;
  --lp-accent:        #4f7bff;
  --lp-accent-2:      #2c5cff;
  --lp-accent-ink:    #ffffff;
  --lp-accent-soft:   rgba(79, 123, 255, 0.14);
  --lp-accent-soft-2: rgba(79, 123, 255, 0.20);
  --lp-accent-glow:   rgba(79, 123, 255, 0.32);
  --lp-accent-line:   rgba(79, 123, 255, 0.45);
  --lp-success:       #34d399;
  --lp-success-glow:  rgba(52, 211, 153, 0.20);
  --lp-err:           #fb7185;
  --lp-cyan:          #22d3ee;
  --lp-warn:          #fb923c;
  --lp-shadow-sm:     0 2px 10px rgba(0, 0, 0, 0.4);
  --lp-shadow:        0 16px 40px rgba(0, 0, 0, 0.45);
  --lp-shadow-lg:     0 30px 70px rgba(0, 0, 0, 0.55);
  --lp-shadow-accent: 0 16px 34px rgba(79, 123, 255, 0.28);
  --lp-img-filter:    saturate(1.0) contrast(1.02) brightness(0.96);
  color-scheme: dark;
}

html, body { overflow-x: clip; max-width: 100%; -webkit-text-size-adjust: 100%; }
body { margin: 0; }
.lp {
  background: var(--lp-bg);
  color: var(--lp-text);
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  transition: background 0.25s, color 0.25s;
  overflow-x: clip; width: 100%; max-width: 100vw;
}
.lp * { box-sizing: border-box; }
.lp a { color: inherit; text-decoration: none; }
.lp img { display: block; max-width: 100%; }
@media (prefers-reduced-motion: reduce) {
  .lp *, .lp *::before, .lp *::after { animation: none !important; transition: none !important; }
}

/* ─── shared section scaffolding ─── */
.lp-section { padding: 96px 0; position: relative; }
.lp-section-inner { max-width: 1200px; margin: 0 auto; padding: 0 28px; width: 100%; }
.lp-section-dark { background: var(--lp-bg-soft); }
.lp-tag {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--lp-accent-soft); color: var(--lp-accent-2);
  border: 1px solid var(--lp-accent-line);
  font-size: 11.5px; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase;
  padding: 7px 14px; border-radius: 999px; margin-bottom: 20px;
}
:root[data-theme="dark"] .lp-tag { color: var(--lp-accent); }
.lp-tag-live { background: var(--lp-accent-soft); }
.lp-tag-pulse {
  width: 8px; height: 8px; border-radius: 50%; background: var(--lp-accent-2);
  box-shadow: 0 0 0 4px var(--lp-accent-glow); animation: pulse 2.4s ease-in-out infinite;
}
.lp-h2 {
  font-size: clamp(28px, 4.2vw, 50px); font-weight: 800; line-height: 1.06;
  letter-spacing: -0.028em; color: var(--lp-ink); margin: 0 0 16px; max-width: 18ch;
}
.lp-sub {
  font-size: clamp(15px, 1.55vw, 19px); line-height: 1.6; color: var(--lp-text-dim);
  max-width: 60ch; margin: 0 0 40px;
}

/* ─── nav ─── */
.lp-nav {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--lp-bg) 80%, transparent);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s, background 0.2s, transform 0.34s cubic-bezier(.4,0,.2,1);
  will-change: transform;
}
.lp-nav--hidden { transform: translateY(-100%); }
.lp-nav.scrolled { border-bottom-color: var(--lp-border); box-shadow: var(--lp-shadow-sm); }
.lp-nav-inner {
  max-width: 1440px; margin: 0 auto; padding: 12px 28px;
  display: flex; align-items: center; gap: 18px;
}
.lp-brand { display: inline-flex; align-items: center; gap: 10px; color: var(--lp-ink); flex-shrink: 0; transition: transform 0.18s; }
.lp-brand:hover { transform: translateY(-1px); }
.lp-brand-logo { height: 40px; width: auto; display: block; object-fit: contain; }
.lp-foot-brand .lp-brand-logo, .lp-brand-logo-lg { height: 84px; }
.lp-links { display: flex; gap: 18px; margin-left: auto; }
.lp-links a {
  font-size: 13.5px; letter-spacing: 0.02em; color: var(--lp-text-dim);
  font-weight: 600; transition: color 0.15s; text-transform: uppercase; white-space: nowrap;
}
.lp-links a:hover { color: var(--lp-ink); }
.lp-dropdown { position: relative; display: flex; align-items: center; }
.lp-dropdown-trigger { display: inline-flex; align-items: center; gap: 5px; font-size: 13.5px; letter-spacing: 0.02em; text-transform: uppercase; font-weight: 600; color: var(--lp-text-dim); background: none; border: 0; padding: 0; cursor: pointer; font-family: inherit; white-space: nowrap; transition: color 0.15s; }
.lp-dropdown:hover .lp-dropdown-trigger, .lp-dropdown:focus-within .lp-dropdown-trigger { color: var(--lp-ink); }
.lp-dropdown-trigger svg { transition: transform 0.2s; }
.lp-dropdown:hover .lp-dropdown-trigger svg, .lp-dropdown:focus-within .lp-dropdown-trigger svg { transform: rotate(180deg); }
.lp-dropdown-menu { position: absolute; top: calc(100% + 14px); left: 50%; min-width: 196px; background: var(--lp-bg-elev); border: 1px solid var(--lp-border); border-radius: 14px; box-shadow: var(--lp-shadow-sm); padding: 7px; display: flex; flex-direction: column; gap: 2px; opacity: 0; visibility: hidden; transform: translateX(-50%) translateY(6px); transition: opacity 0.16s, transform 0.16s; z-index: 60; }
.lp-dropdown-menu::before { content: ""; position: absolute; top: -14px; left: 0; right: 0; height: 14px; }
.lp-dropdown:hover .lp-dropdown-menu, .lp-dropdown:focus-within .lp-dropdown-menu { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); }
.lp-dropdown-menu a { padding: 10px 14px; border-radius: 9px; font-size: 13.5px; font-weight: 600; color: var(--lp-ink); white-space: nowrap; text-transform: none; letter-spacing: 0; transition: background 0.14s, color 0.14s; }
.lp-dropdown-menu a:hover { background: var(--lp-accent-soft); color: var(--lp-accent-2); }
.lp-nav-right { display: flex; gap: 8px; align-items: center; }
.lp-theme-btn {
  width: 38px; height: 38px; border-radius: 999px;
  border: 1px solid var(--lp-border); background: var(--lp-bg-elev); color: var(--lp-text-dim);
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  transition: all 0.18s;
}
.lp-theme-btn:hover { color: var(--lp-ink); border-color: var(--lp-border-hover); transform: rotate(18deg); }
.lp-nav-cta {
  font-size: 13px; letter-spacing: 0.02em; text-transform: uppercase; font-weight: 700;
  padding: 9px 13px; border-radius: 999px; transition: all 0.16s; white-space: nowrap;
}
.lp-nav-cta-ghost { border: 1px solid var(--lp-border); color: var(--lp-ink); background: var(--lp-bg-elev); }
.lp-nav-cta-ghost:hover { border-color: var(--lp-accent); color: var(--lp-accent-2); }
a.lp-nav-cta-wa {
  display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid rgba(37, 211, 102, 0.5); color: #1aa654; background: var(--lp-bg-elev);
}
a.lp-nav-cta-wa:hover { background: #25d366; border-color: #25d366; color: #fff; transform: translateY(-1px); }
a.lp-nav-cta-filled {
  background: var(--lp-accent); color: var(--lp-accent-ink);
  border: 1px solid var(--lp-accent);
  box-shadow: 0 8px 20px var(--lp-accent-glow);
}
a.lp-nav-cta-filled:hover { transform: translateY(-1px); box-shadow: 0 12px 28px var(--lp-accent-glow); background: var(--lp-accent-2); border-color: var(--lp-accent-2); }

/* ── hamburger + drawer ── */
.lp-burger {
  display: none; width: 40px; height: 40px; border-radius: 12px;
  border: 1px solid var(--lp-border); background: var(--lp-bg-elev); cursor: pointer;
  align-items: center; justify-content: center; flex-direction: column; gap: 4px; padding: 0;
}
.lp-burger span { display: block; width: 18px; height: 2px; background: var(--lp-ink); border-radius: 2px; }
.lp-burger:hover { border-color: var(--lp-border-hover); }
.lp-drawer-backdrop {
  position: fixed; inset: 0; background: rgba(10, 18, 8, 0.45);
  opacity: 0; pointer-events: none; transition: opacity 0.22s; z-index: 90;
  backdrop-filter: blur(2px);
}
.lp-drawer-backdrop.is-open { opacity: 1; pointer-events: auto; }
.lp-drawer {
  position: fixed; top: 0; left: 0; bottom: 0; width: min(86vw, 360px);
  background: var(--lp-bg); border-right: 1px solid var(--lp-border);
  transform: translateX(-102%); transition: transform 0.26s cubic-bezier(.4,0,.2,1);
  z-index: 100; display: flex; flex-direction: column; padding: 18px 22px 22px;
  box-shadow: 18px 0 60px rgba(0,0,0,0.18);
}
.lp-drawer.is-open { transform: translateX(0); }
.lp-drawer-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: 1px solid var(--lp-border); }
.lp-drawer-eyebrow { font-size: 11px; letter-spacing: 0.16em; font-weight: 800; color: var(--lp-text-muted); }
.lp-drawer-close {
  width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--lp-border);
  background: var(--lp-bg-elev); color: var(--lp-ink); display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
}
.lp-drawer-close:hover { border-color: var(--lp-border-hover); }
.lp-drawer-links { display: flex; flex-direction: column; padding: 14px 0 6px; }
.lp-drawer-links a { font-size: 18px; font-weight: 700; color: var(--lp-ink); padding: 13px 0; border-bottom: 1px solid var(--lp-border); }
.lp-drawer-links a:hover { color: var(--lp-accent-2); }
.lp-drawer-foot { margin-top: auto; display: flex; flex-direction: column; gap: 10px; padding-top: 16px; }
a.lp-drawer-cta {
  display: block; background: var(--lp-accent); color: var(--lp-accent-ink); text-align: center;
  font-size: 14px; font-weight: 800; padding: 15px 18px; border-radius: 999px; box-shadow: 0 8px 22px var(--lp-accent-glow);
}
.lp-drawer-reach { text-align: center; font-size: 13px; font-weight: 700; color: var(--lp-text-dim); padding: 8px 0 4px; }
.lp-drawer-reach:hover { color: var(--lp-ink); }

@media (max-width: 1300px) {
  .lp-nav-inner { display: grid; grid-template-columns: 44px 1fr 44px; gap: 8px; padding: 10px 16px; align-items: center; }
  .lp-burger { display: inline-flex; grid-column: 1; justify-self: start; }
  .lp-brand  { grid-column: 2; justify-self: center; }
  .lp-links, .lp-nav-right { display: none; }
  .lp-brand-logo { height: 46px; }
}
@media (max-width: 560px) { .lp-brand-logo { height: 40px; } .lp-nav-inner { padding: 10px 12px; } }

/* ─── hero ─── */
.lp-hero {
  position: relative; overflow: hidden;
  background:
    radial-gradient(1200px 620px at 88% -8%, var(--lp-accent-soft), transparent 60%),
    radial-gradient(900px 520px at -6% 8%, var(--lp-bg-soft), transparent 64%),
    var(--lp-bg);
}
.lp-hero-spotlight {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(420px 420px at var(--lp-mx, 80%) var(--lp-my, 20%), var(--lp-accent-glow), transparent 70%);
  opacity: 0.5; mix-blend-mode: multiply;
}
:root[data-theme="dark"] .lp-hero-spotlight { mix-blend-mode: screen; opacity: 0.35; }
.lp-hero-blob { position: absolute; border-radius: 50%; filter: blur(60px); z-index: 0; pointer-events: none; }
.lp-hero-blob-a { width: 420px; height: 420px; right: -90px; top: -120px; background: var(--lp-accent-glow); opacity: 0.5; }
.lp-hero-blob-b { width: 360px; height: 360px; left: -140px; bottom: -120px; background: color-mix(in srgb, var(--lp-accent) 22%, transparent); opacity: 0.4; }
.lp-hero-inner {
  position: relative; z-index: 2; max-width: 1200px; margin: 0 auto;
  padding: clamp(48px, 7vw, 92px) 28px 36px;
  display: grid; grid-template-columns: 1.04fr 0.96fr; gap: clamp(32px, 5vw, 64px); align-items: center;
}
.lp-hero-copy { max-width: 620px; }
.lp-hero-eyebrow {
  display: inline-flex; align-items: center; gap: 9px;
  background: var(--lp-bg-elev); border: 1px solid var(--lp-border);
  color: var(--lp-text-dim); font-size: 12px; font-weight: 700; letter-spacing: 0.10em;
  padding: 8px 15px; border-radius: 999px; margin-bottom: 22px; box-shadow: var(--lp-shadow-sm);
}
.lp-hero-eyebrow-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--lp-accent); box-shadow: 0 0 0 4px var(--lp-accent-glow); animation: pulse 2.4s ease-in-out infinite; }
.lp-h1 {
  font-size: clamp(36px, 5vw, 64px); font-weight: 800; line-height: 1.04;
  letter-spacing: -0.032em; color: var(--lp-ink); margin: 0 0 22px; display: flex; flex-direction: column;
}
.lp-h1 span { display: block; }
.lp-h1-em { color: var(--lp-accent-2); }
:root[data-theme="dark"] .lp-h1-em { color: var(--lp-accent); }
.lp-lede { font-size: clamp(16px, 1.6vw, 20px); line-height: 1.6; color: var(--lp-text-dim); max-width: 560px; margin: 0 0 30px; }
.lp-lede b { color: var(--lp-ink); font-weight: 700; }
.lp-cta-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 26px; align-items: center; }
.lp-magnetic-wrap { display: inline-flex; }
a.lp-cta {
  display: inline-flex; align-items: center; gap: 10px;
  background: var(--lp-accent); color: var(--lp-accent-ink); font-weight: 800;
  font-size: 15px; letter-spacing: 0; padding: 16px 26px; border-radius: 999px;
  transition: transform 0.18s, box-shadow 0.18s, background 0.18s; box-shadow: var(--lp-shadow-accent);
}
a.lp-cta:hover { transform: translateY(-2px); background: var(--lp-accent-2); box-shadow: 0 22px 44px var(--lp-accent-glow); }
.lp-cta-ghost {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1.5px solid var(--lp-border-hover); color: var(--lp-ink); background: var(--lp-bg-elev);
  font-size: 15px; font-weight: 800; padding: 15px 24px; border-radius: 999px; transition: all 0.16s;
}
.lp-cta-ghost:hover { border-color: var(--lp-ink); transform: translateY(-2px); box-shadow: var(--lp-shadow); }
.lp-trust-line { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--lp-text-dim); max-width: 720px; }
.lp-trust-line b { color: var(--lp-ink); font-weight: 700; }
.lp-trust-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--lp-accent); box-shadow: 0 0 0 4px var(--lp-accent-glow); flex-shrink: 0; }

/* hero visual card + floating chips */
.lp-hero-visual { position: relative; z-index: 2; }
.lp-hero-visual-frame { position: relative; }
.lp-hero-photo {
  border-radius: var(--lp-r-lg); height: clamp(360px, 44vw, 520px);
  background-size: cover; background-position: center; filter: var(--lp-img-filter);
  border: 1px solid var(--lp-border); box-shadow: var(--lp-shadow-lg);
}
.lp-hero-chip {
  position: absolute; display: inline-flex; align-items: center; gap: 10px;
  background: var(--lp-bg-elev); border: 1px solid var(--lp-border);
  border-radius: 16px; padding: 12px 16px; box-shadow: var(--lp-shadow);
  animation: floaty 5s ease-in-out infinite;
}
.lp-hero-chip-tl { top: 22px; left: -22px; }
.lp-hero-chip-br { bottom: 26px; right: -20px; animation-delay: 1.4s; }
.lp-hero-chip-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--lp-accent); box-shadow: 0 0 0 4px var(--lp-accent-glow); flex-shrink: 0; }
.lp-hero-chip-v { font-size: 14px; font-weight: 800; color: var(--lp-ink); }
.lp-hero-chip-l { font-size: 11.5px; color: var(--lp-text-muted); margin-top: 1px; }

/* hero stats band */
.lp-hero-stats {
  position: relative; z-index: 2; max-width: 1200px; margin: 12px auto 0; padding: 0 28px 84px;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
}
.lp-hero-stat {
  background: var(--lp-bg-elev); border: 1px solid var(--lp-border); border-radius: var(--lp-r);
  padding: 22px 22px; box-shadow: var(--lp-shadow-sm);
}
.lp-hero-stat-val { font-size: clamp(26px, 3vw, 38px); font-weight: 800; color: var(--lp-ink); letter-spacing: -0.02em; line-height: 1; }
.lp-hero-stat-lbl { margin-top: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.10em; text-transform: uppercase; color: var(--lp-text-muted); }

@media (max-width: 940px) {
  .lp-hero-inner { grid-template-columns: 1fr; gap: 36px; padding-top: clamp(40px, 9vw, 64px); }
  .lp-hero-copy { max-width: 640px; }
  .lp-hero-visual { order: 2; }
  .lp-hero-chip-tl { left: 12px; }
  .lp-hero-chip-br { right: 12px; }
  .lp-hero-stats { grid-template-columns: repeat(2, 1fr); padding-bottom: 56px; }
}
@media (max-width: 480px) { .lp-hero-stats { grid-template-columns: 1fr 1fr; } }

/* ─── client marquee ─── */
.lp-marquee { position: relative; overflow: hidden; padding: 26px 0; border-top: 1px solid var(--lp-border); border-bottom: 1px solid var(--lp-border); background: var(--lp-bg); }
.lp-marquee-fade { position: absolute; top: 0; bottom: 0; width: 140px; z-index: 2; pointer-events: none; }
.lp-marquee-fade-l { left: 0; background: linear-gradient(90deg, var(--lp-bg), transparent); }
.lp-marquee-fade-r { right: 0; background: linear-gradient(270deg, var(--lp-bg), transparent); }
.lp-marquee-track { display: flex; gap: 52px; width: max-content; animation: marquee 38s linear infinite; }
.lp-marquee-item { display: inline-flex; align-items: center; gap: 16px; font-size: 14px; font-weight: 700; letter-spacing: 0.12em; color: var(--lp-text-muted); white-space: nowrap; }
.lp-marquee-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--lp-accent); }

/* ─── stat cards (numbers section) ─── */
.lp-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
.lp-stat-card {
  background: var(--lp-bg-card); border: 1px solid var(--lp-border); border-radius: var(--lp-r);
  padding: 30px 26px; box-shadow: var(--lp-shadow-sm); transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.lp-stat-card:hover { transform: translateY(-4px); box-shadow: var(--lp-shadow); border-color: var(--lp-border-hover); }
.lp-stat-val { font-size: clamp(30px, 3.6vw, 46px); font-weight: 800; color: var(--lp-ink); letter-spacing: -0.02em; line-height: 1; }
.lp-stat-lbl { margin-top: 12px; font-size: 14px; font-weight: 700; color: var(--lp-ink); }
.lp-stat-sub { margin-top: 4px; font-size: 13px; color: var(--lp-text-muted); }
@media (max-width: 880px) { .lp-stat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 460px) { .lp-stat-grid { grid-template-columns: 1fr; } }

/* ─── process steps ─── */
.lp-steps { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
.lp-steps-line { display: none; }
.lp-step {
  background: var(--lp-bg-card); border: 1px solid var(--lp-border); border-radius: var(--lp-r);
  padding: 28px 24px; box-shadow: var(--lp-shadow-sm);
  animation: fadeUp 0.6s both; transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.lp-step:hover { transform: translateY(-4px); box-shadow: var(--lp-shadow); border-color: var(--lp-accent-line); }
.lp-step-n {
  display: inline-flex; align-items: center; justify-content: center;
  width: 46px; height: 46px; border-radius: 14px; background: var(--lp-accent-soft);
  color: var(--lp-accent-2); font-weight: 800; font-size: 16px; margin-bottom: 18px;
}
:root[data-theme="dark"] .lp-step-n { color: var(--lp-accent); }
.lp-step-h { font-size: 18px; font-weight: 800; color: var(--lp-ink); margin: 0 0 8px; }
.lp-step-p { font-size: 14.5px; line-height: 1.55; color: var(--lp-text-dim); margin: 0; }
@media (max-width: 880px) { .lp-steps { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 460px) { .lp-steps { grid-template-columns: 1fr; } }

/* ─── pricing cards ─── */
.lp-pricing-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 30px; }
.lp-price-card {
  padding: 22px 20px; border-radius: 16px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10);
  display: flex; flex-direction: column; gap: 6px;
}
.lp-price-card-hl {
  background: linear-gradient(160deg, rgba(79,123,255,0.18), rgba(79,123,255,0.05));
  border-color: rgba(79,123,255,0.45);
}
.lp-price-k { font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.6); }
.lp-price-v { font-size: 30px; font-weight: 850; letter-spacing: -0.02em; color: #fff; line-height: 1.05; }
.lp-price-sub { font-size: 13px; line-height: 1.55; color: rgba(255,255,255,0.72); margin: 4px 0 0; }
.lp-price-sub strong { color: #fff; font-weight: 700; }
@media (max-width: 880px) { .lp-pricing-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 460px) { .lp-pricing-grid { grid-template-columns: 1fr; } }

/* ─── methods (product-style cards) ─── */
.lp-methods { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
.lp-method {
  display: flex; flex-direction: column; background: var(--lp-bg-card);
  border: 1px solid var(--lp-border); border-radius: var(--lp-r); padding: 18px;
  box-shadow: var(--lp-shadow-sm); animation: fadeUp 0.6s both;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.lp-method:hover { transform: translateY(-5px); box-shadow: var(--lp-shadow); border-color: var(--lp-accent-line); }
.lp-method-visual {
  height: 116px; border-radius: 16px; display: flex; align-items: center; justify-content: center;
  color: var(--lp-accent-ink); margin-bottom: 16px;
  background: linear-gradient(135deg, var(--lp-accent) 0%, color-mix(in srgb, var(--lp-accent) 60%, #ffffff) 100%);
}
.lp-method[data-method="dtg"] .lp-method-visual { background: linear-gradient(135deg, #5b86ff, #2c5cff); }
.lp-method[data-method="screen"] .lp-method-visual { background: linear-gradient(135deg, #0c1430, #2c5cff); color: #ffffff; }
.lp-method[data-method="embroidery"] .lp-method-visual { background: linear-gradient(135deg, #dbe6ff, #9fb8ff); color: #0b0e16; }
.lp-method-name { font-size: 17px; font-weight: 800; color: var(--lp-ink); margin-bottom: 6px; }
.lp-method-p { font-size: 13.5px; line-height: 1.5; color: var(--lp-text-dim); margin: 0 0 16px; flex: 1; }
.lp-method-cta { font-size: 13px; font-weight: 800; color: var(--lp-accent-2); display: inline-flex; gap: 6px; align-items: center; }
:root[data-theme="dark"] .lp-method-cta { color: var(--lp-accent); }
.lp-method:hover .lp-method-cta span { transform: translateX(3px); }
.lp-method-cta span { transition: transform 0.16s; }
.lp-methods-foot {
  margin-top: 28px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px;
  background: var(--lp-bg-elev); border: 1px solid var(--lp-border); border-radius: var(--lp-r);
  padding: 20px 24px; box-shadow: var(--lp-shadow-sm);
}
.lp-methods-foot > span { font-size: 15px; font-weight: 600; color: var(--lp-ink); }
a.lp-method-bulk {
  margin-left: auto; background: var(--lp-accent); color: var(--lp-accent-ink); font-weight: 800; font-size: 14px;
  padding: 12px 20px; border-radius: 999px; box-shadow: 0 8px 20px var(--lp-accent-glow); transition: all 0.16s;
}
a.lp-method-bulk:hover { background: var(--lp-accent-2); transform: translateY(-2px); }
@media (max-width: 880px) { .lp-methods { grid-template-columns: repeat(2, 1fr); } a.lp-method-bulk { margin-left: 0; } }
@media (max-width: 460px) { .lp-methods { grid-template-columns: 1fr; } }

/* ─── why-us journey ─── */
.lp-journey { position: relative; }
.lp-journey-svg { width: 100%; height: auto; max-height: 250px; display: block; overflow: visible; }
.lp-journey-line { fill: none; stroke: var(--lp-border); stroke-width: 2.5; transition: stroke-dashoffset 1.4s ease; }
.lp-journey-line-active { fill: none; stroke: var(--lp-accent); stroke-width: 3.5; stroke-linecap: round; transition: stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1); filter: drop-shadow(0 0 6px var(--lp-accent-glow)); }
.lp-journey-comet { fill: var(--lp-accent); filter: drop-shadow(0 0 6px var(--lp-accent-glow)); }
.lp-journey-halo { fill: var(--lp-accent-glow); opacity: 0; transition: opacity 0.2s; }
.lp-journey-ring { fill: var(--lp-bg); stroke: var(--lp-border); stroke-width: 2; transition: stroke 0.2s, fill 0.2s; }
.lp-journey-dot { fill: var(--lp-text-muted); transition: fill 0.2s; }
.lp-journey-node.done .lp-journey-ring { stroke: var(--lp-accent); }
.lp-journey-node.done .lp-journey-dot { fill: var(--lp-accent); }
.lp-journey-node.active .lp-journey-halo { opacity: 1; }
.lp-journey-node.active .lp-journey-ring { stroke: var(--lp-accent); fill: var(--lp-accent-soft); }
.lp-journey-node.active .lp-journey-dot { fill: var(--lp-accent-2); }
.lp-journey-node:hover .lp-journey-ring { stroke: var(--lp-accent); }
.lp-journey-num { fill: var(--lp-text-muted); font-size: 13px; font-weight: 800; font-family: 'Plus Jakarta Sans', sans-serif; }
.lp-journey-node.active .lp-journey-num { fill: var(--lp-ink); }
.lp-journey-label { fill: var(--lp-text-muted); font-size: 10px; font-weight: 700; letter-spacing: 0.08em; font-family: 'Plus Jakarta Sans', sans-serif; }
.lp-journey-node.active .lp-journey-label { fill: var(--lp-accent-2); }
.lp-journey-stage { position: relative; margin-top: 26px; min-height: 280px; }
.lp-journey-slide {
  position: absolute; inset: 0; display: grid; grid-template-columns: 280px 1fr; gap: 36px; align-items: center;
  opacity: 0; transform: translateX(40px); pointer-events: none; transition: opacity 0.45s, transform 0.45s;
}
.lp-journey-slide.on { opacity: 1; transform: translateX(0); pointer-events: auto; position: relative; }
.lp-journey-slide.off-prev { transform: translateX(-40px); }
.lp-journey-vis {
  position: relative; height: 240px; border-radius: var(--lp-r-lg); display: flex; align-items: center; justify-content: center;
  background: linear-gradient(150deg, var(--lp-accent-soft), var(--lp-bg-soft)); border: 1px solid var(--lp-border); color: var(--lp-accent-2);
}
:root[data-theme="dark"] .lp-journey-vis { color: var(--lp-accent); }
.lp-journey-vis svg { width: 84px; height: 84px; }
.lp-journey-vis-num { position: absolute; top: 16px; right: 22px; font-size: 56px; font-weight: 800; color: color-mix(in srgb, var(--lp-accent) 35%, transparent); }
.lp-journey-step { font-size: 12px; font-weight: 800; letter-spacing: 0.12em; color: var(--lp-accent-2); margin-bottom: 12px; }
:root[data-theme="dark"] .lp-journey-step { color: var(--lp-accent); }
.lp-journey-h { font-size: clamp(24px, 3vw, 34px); font-weight: 800; color: var(--lp-ink); margin: 0 0 12px; letter-spacing: -0.02em; }
.lp-journey-p { font-size: 16px; line-height: 1.6; color: var(--lp-text-dim); margin: 0 0 20px; max-width: 52ch; }
.lp-journey-stat { display: inline-flex; align-items: baseline; gap: 10px; background: var(--lp-bg-elev); border: 1px solid var(--lp-border); border-radius: 14px; padding: 12px 18px; box-shadow: var(--lp-shadow-sm); }
.lp-journey-stat-v { font-size: 26px; font-weight: 800; color: var(--lp-accent-2); letter-spacing: -0.02em; }
:root[data-theme="dark"] .lp-journey-stat-v { color: var(--lp-accent); }
.lp-journey-stat-l { font-size: 13px; color: var(--lp-text-muted); font-weight: 600; }
.lp-journey-ctrl { display: flex; align-items: center; justify-content: center; gap: 18px; margin-top: 28px; }
.lp-journey-arrow {
  width: 44px; height: 44px; border-radius: 999px; border: 1px solid var(--lp-border); background: var(--lp-bg-elev);
  color: var(--lp-ink); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.16s;
}
.lp-journey-arrow:hover:not(:disabled) { border-color: var(--lp-accent); color: var(--lp-accent-2); }
.lp-journey-arrow:disabled { opacity: 0.35; cursor: not-allowed; }
.lp-journey-dots { display: flex; gap: 8px; }
.lp-journey-dot-btn { width: 9px; height: 9px; border-radius: 999px; border: none; background: var(--lp-border-hover); cursor: pointer; transition: all 0.18s; padding: 0; }
.lp-journey-dot-btn.on { background: var(--lp-accent); width: 26px; }
@media (max-width: 760px) {
  .lp-journey-svg { display: none; }
  .lp-journey-slide { grid-template-columns: 1fr; gap: 20px; }
  .lp-journey-vis { height: 180px; }
}

/* ─── compare table ─── */
.lp-compare { border: 1px solid var(--lp-border); border-radius: var(--lp-r-lg); overflow: hidden; box-shadow: var(--lp-shadow); background: var(--lp-bg-card); }
.lp-compare-row { display: grid; grid-template-columns: 1.3fr 1fr 1fr; align-items: center; border-top: 1px solid var(--lp-border); }
.lp-compare-row:first-child { border-top: none; }
.lp-compare-head { background: var(--lp-bg-soft); }
.lp-compare-head > div { padding: 18px 22px; }
.lp-compare-l { padding: 18px 22px; font-size: 14.5px; font-weight: 700; color: var(--lp-ink); display: flex; align-items: center; gap: 10px; }
.lp-compare-us, .lp-compare-them { padding: 18px 22px; font-size: 14px; display: flex; align-items: center; gap: 9px; }
.lp-compare-us { color: var(--lp-ink); font-weight: 600; background: var(--lp-accent-soft); }
:root[data-theme="dark"] .lp-compare-us { background: var(--lp-accent-soft); }
.lp-compare-them { color: var(--lp-text-muted); }
.lp-compare-us svg { color: var(--lp-accent-2); flex-shrink: 0; }
.lp-compare-them svg { color: var(--lp-text-muted); flex-shrink: 0; }
.lp-compare-tag { font-size: 13px; font-weight: 800; letter-spacing: 0.04em; }
.lp-compare-tag-us { color: var(--lp-accent-2); }
:root[data-theme="dark"] .lp-compare-tag-us { color: var(--lp-accent); }
.lp-compare-tag-them { color: var(--lp-text-muted); }
.lp-compare-row-hl .lp-compare-l { color: var(--lp-ink); }
.lp-compare-flag { font-size: 10px; font-weight: 800; letter-spacing: 0.08em; color: var(--lp-accent-ink); background: var(--lp-accent); padding: 3px 8px; border-radius: 999px; }
@media (max-width: 720px) {
  .lp-compare-row { grid-template-columns: 1fr; }
  .lp-compare-l { border-bottom: 1px solid var(--lp-border); }
  .lp-compare-head { display: none; }
  .lp-compare-us::before { content: "AVIVA"; font-weight: 800; color: var(--lp-accent-2); margin-right: 6px; font-size: 11px; }
  .lp-compare-them::before { content: "OTHERS"; font-weight: 800; margin-right: 6px; font-size: 11px; }
}

/* ─── credentials / badges ─── */
.lp-badges { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.lp-badge { display: flex; align-items: center; gap: 16px; background: var(--lp-bg-card); border: 1px solid var(--lp-border); border-radius: var(--lp-r); padding: 22px 24px; box-shadow: var(--lp-shadow-sm); }
.lp-badge-check { width: 44px; height: 44px; border-radius: 999px; background: var(--lp-accent); color: var(--lp-accent-ink); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.lp-badge-l { font-size: 16px; font-weight: 800; color: var(--lp-ink); }
.lp-badge-s { font-size: 13px; color: var(--lp-text-dim); margin-top: 2px; }
@media (max-width: 760px) { .lp-badges { grid-template-columns: 1fr; } }

/* ─── testimonials ─── */
.lp-quotes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.lp-quote { background: var(--lp-bg-card); border: 1px solid var(--lp-border); border-radius: var(--lp-r); padding: 28px 26px; box-shadow: var(--lp-shadow-sm); display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; }
.lp-quote:hover { transform: translateY(-4px); box-shadow: var(--lp-shadow); }
.lp-quote-stars { display: flex; gap: 3px; color: var(--lp-accent-2); margin-bottom: 16px; }
:root[data-theme="dark"] .lp-quote-stars { color: var(--lp-accent); }
.lp-quote blockquote { font-size: 16px; line-height: 1.6; color: var(--lp-ink); margin: 0 0 22px; font-weight: 500; flex: 1; }
.lp-quote figcaption { display: flex; align-items: center; gap: 12px; }
.lp-quote-avatar { width: 44px; height: 44px; border-radius: 999px; background: var(--lp-accent-soft); color: var(--lp-accent-2); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0; }
:root[data-theme="dark"] .lp-quote-avatar { color: var(--lp-accent); }
.lp-quote figcaption b { display: block; font-size: 14px; color: var(--lp-ink); }
.lp-quote figcaption em { font-style: normal; font-size: 13px; color: var(--lp-text-muted); }
@media (max-width: 880px) { .lp-quotes { grid-template-columns: 1fr; } }

/* ─── big CTA block ─── */
.lp-cta-section { padding: 30px 28px 96px; }
.lp-cta-section .lp-section-inner {
  background: linear-gradient(135deg, #0b1020 0%, var(--lp-accent) 130%);
  border-radius: var(--lp-r-lg); padding: clamp(44px, 6vw, 76px) clamp(28px, 5vw, 64px);
  text-align: center; box-shadow: var(--lp-shadow-lg); position: relative; overflow: hidden;
}
.lp-cta-section .lp-section-inner::before {
  content: ""; position: absolute; width: 380px; height: 380px; border-radius: 50%;
  background: rgba(255,255,255,0.18); top: -160px; right: -80px; filter: blur(20px);
}
.lp-cta-h { font-size: clamp(28px, 4vw, 46px); font-weight: 800; color: var(--lp-accent-ink); margin: 0 0 14px; letter-spacing: -0.028em; position: relative; }
.lp-cta-p { font-size: clamp(15px, 1.7vw, 19px); line-height: 1.55; color: color-mix(in srgb, var(--lp-accent-ink) 78%, transparent); max-width: 58ch; margin: 0 auto 32px; position: relative; }
.lp-cta-channels { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; position: relative; }
.lp-cta-channel {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  background: rgba(255,255,255,0.92); border-radius: 16px; padding: 14px 24px; min-width: 200px;
  border: 1px solid rgba(255,255,255,0.6); transition: transform 0.16s, box-shadow 0.16s;
}
.lp-cta-channel:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(14,33,6,0.22); }
.lp-cta-channel-l { font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--lp-accent-2); }
.lp-cta-channel-v { font-size: 15px; font-weight: 700; color: #0b0e16; }

/* ─── subpage header / legal / contact ─── */
.lp-subpage-head { background: var(--lp-bg-soft); border-bottom: 1px solid var(--lp-border); padding: 56px 0 48px; }
.lp-subpage-crumb { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--lp-text-muted); font-weight: 600; }
.lp-subpage-crumb a { color: var(--lp-accent-2); }
:root[data-theme="dark"] .lp-subpage-crumb a { color: var(--lp-accent); }
.lp-subpage-crumb-sep { opacity: 0.5; }
.lp-subpage-h { max-width: 20ch; }
.lp-legal { max-width: 760px; }
.lp-legal h3 { font-size: 18px; font-weight: 800; color: var(--lp-ink); margin: 30px 0 10px; }
.lp-legal p, .lp-legal li { font-size: 15px; line-height: 1.7; color: var(--lp-text-dim); }
.lp-legal a { color: var(--lp-accent-2); font-weight: 600; }
:root[data-theme="dark"] .lp-legal a { color: var(--lp-accent); }
.lp-legal ul { padding-left: 20px; }
.lp-contact-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
.lp-contact-card { background: var(--lp-bg-card); border: 1px solid var(--lp-border); border-radius: var(--lp-r); padding: 26px; box-shadow: var(--lp-shadow-sm); transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s; }
.lp-contact-card:hover { transform: translateY(-4px); box-shadow: var(--lp-shadow); border-color: var(--lp-accent-line); }
.lp-contact-card-tag { font-size: 11px; font-weight: 800; letter-spacing: 0.12em; color: var(--lp-accent-2); margin-bottom: 14px; }
:root[data-theme="dark"] .lp-contact-card-tag { color: var(--lp-accent); }
.lp-contact-card-h { font-size: 22px; font-weight: 800; color: var(--lp-ink); margin-bottom: 6px; }
.lp-contact-card-v { font-size: 15px; font-weight: 700; color: var(--lp-ink); }
.lp-contact-card-sub { font-size: 13px; color: var(--lp-text-muted); margin-top: 6px; }
.lp-contact-foot { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 40px; padding-top: 36px; border-top: 1px solid var(--lp-border); }
.lp-contact-floor-h { font-size: 19px; font-weight: 800; color: var(--lp-ink); margin: 12px 0 8px; }
.lp-contact-foot p { font-size: 14.5px; line-height: 1.6; color: var(--lp-text-dim); }
.lp-contact-foot strong { color: var(--lp-ink); }
@media (max-width: 720px) { .lp-contact-grid, .lp-contact-foot { grid-template-columns: 1fr; } }

/* ─── footer ─── */
.lp-foot { background: var(--lp-bg-soft); border-top: 1px solid var(--lp-border); padding: 64px 0 0; }
.lp-foot-inner { max-width: 1200px; margin: 0 auto; padding: 0 28px 48px; display: grid; grid-template-columns: 1.2fr 2fr; gap: 48px; }
.lp-foot-meta { font-size: 14px; line-height: 1.6; color: var(--lp-text-dim); margin-top: 16px; }
.lp-foot-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
.lp-foot-h { font-size: 12px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; color: var(--lp-text-muted); margin-bottom: 16px; }
.lp-foot-cols a { display: block; font-size: 14.5px; color: var(--lp-text-dim); padding: 6px 0; transition: color 0.15s; }
.lp-foot-cols a:hover { color: var(--lp-accent-2); }
:root[data-theme="dark"] .lp-foot-cols a:hover { color: var(--lp-accent); }
.lp-foot-bar { max-width: 1200px; margin: 0 auto; padding: 22px 28px; border-top: 1px solid var(--lp-border); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 12.5px; letter-spacing: 0.04em; color: var(--lp-text-muted); }
@media (max-width: 760px) { .lp-foot-inner { grid-template-columns: 1fr; gap: 36px; } .lp-foot-cols { grid-template-columns: 1fr 1fr; } }

/* ─── reveal animation ─── */
[data-reveal] { opacity: 0; transform: translateY(24px); transition: opacity 0.7s cubic-bezier(.16,1,.3,1), transform 0.7s cubic-bezier(.16,1,.3,1); }
[data-reveal].in { opacity: 1; transform: none; }

/* ─── immersive scroll layer: hero parallax + pinned filmstrip scene ─── */
.lp-hero-visual { transform: translate3d(0, calc((var(--pp, 0.5) - 0.5) * 64px), 0); will-change: transform; }

.lp-pin { position: relative; height: 380vh; }
.lp-pin-stage { position: sticky; top: 0; height: 100vh; overflow: hidden; background: var(--lp-bg-soft); }
.lp-pin-head { position: absolute; top: clamp(76px, 13vh, 150px); left: 0; right: 0; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 14px; pointer-events: none; }
.lp-pin-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--lp-text-muted); }
.lp-pin-bars { display: flex; gap: 8px; }
.lp-pin-bar { position: relative; width: 46px; height: 4px; border-radius: 999px; background: var(--lp-border); overflow: hidden; }
.lp-pin-bar::after { content: ""; position: absolute; inset: 0; background: var(--lp-accent); transform-origin: left; transform: scaleX(clamp(0, calc(var(--sp, 0) * 4 - var(--i)), 1)); }
.lp-pin-track { display: flex; width: 400%; height: 100%; transform: translate3d(calc(var(--sp, 0) * -75%), 0, 0); will-change: transform; }
.lp-pin-panel { flex: 0 0 25%; width: 25%; box-sizing: border-box; padding: 0 clamp(28px, 7vw, 120px); display: flex; flex-direction: column; justify-content: center; align-items: flex-start; }
.lp-pin-n { font-size: clamp(38px, 5vw, 72px); font-weight: 800; line-height: 0.9; letter-spacing: -0.04em; color: var(--lp-accent); opacity: 0.16; }
.lp-pin-h { font-size: clamp(24px, 2.8vw, 40px); font-weight: 800; letter-spacing: -0.02em; color: var(--lp-ink); margin-top: 10px; }
.lp-pin-p { font-size: clamp(15px, 1.1vw, 18px); line-height: 1.55; color: var(--lp-text-dim); max-width: 440px; margin-top: 16px; }
.lp-pin-hint { position: absolute; bottom: 30px; left: 0; right: 0; text-align: center; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--lp-text-muted); opacity: clamp(0, calc(1 - var(--sp, 0) * 6), 1); }
@media (max-width: 760px) {
  .lp-pin { height: 300vh; }
  .lp-pin-panel { padding: 0 26px; }
  .lp-pin-n { font-size: 42px; }
  .lp-pin-h { font-size: 27px; }
  .lp-pin-p { font-size: 15px; margin-top: 12px; max-width: 320px; }
  .lp-pin-head { top: 84px; }
}
@media (prefers-reduced-motion: reduce) {
  .lp-hero-visual { transform: none; }
  .lp-pin { height: auto; }
  .lp-pin-stage { position: static; height: auto; display: block; padding: 72px 0; }
  .lp-pin-head { position: static; align-items: flex-start; padding: 0 28px; margin-bottom: 32px; }
  .lp-pin-track { flex-direction: column; width: auto; height: auto; transform: none; gap: 48px; padding: 0 28px; }
  .lp-pin-panel { width: auto; flex: none; padding: 0; }
  .lp-pin-hint { display: none; }
}
.lp-reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.6s, transform 0.6s; }
.lp-reveal.in { opacity: 1; transform: none; }

/* ─── live ops terminal (defined for completeness; not rendered) ─── */
.lp-liveops-section { background: var(--lp-bg-soft); }
.lp-liveops-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; margin-top: 12px; }
.lp-terminal { background: #0c120a; border: 1px solid var(--lp-border); border-radius: var(--lp-r); overflow: hidden; box-shadow: var(--lp-shadow); }
.lp-terminal-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #0a0f08; border-bottom: 1px solid #1c2417; }
.lp-terminal-dots { display: flex; gap: 6px; }
.lp-terminal-dot { width: 11px; height: 11px; border-radius: 50%; }
.lp-terminal-dot-r { background: #ff5f56; } .lp-terminal-dot-y { background: #ffbd2e; } .lp-terminal-dot-g { background: #27c93f; }
.lp-terminal-title { font-family: ui-monospace, monospace; font-size: 12px; color: #8a917f; } .lp-terminal-title span { color: #c4cbb8; }
.lp-terminal-status { margin-left: auto; font-family: ui-monospace, monospace; font-size: 11px; color: var(--lp-accent); display: flex; align-items: center; gap: 6px; }
.lp-terminal-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--lp-accent); }
.lp-terminal-body { height: 320px; overflow: hidden; padding: 14px 16px; font-family: ui-monospace, monospace; font-size: 12.5px; }
.lp-log-line { display: flex; gap: 10px; padding: 2px 0; }
.lp-log-ts { color: #5c6357; } .lp-log-verb { color: var(--lp-accent); font-weight: 700; } .lp-log-detail { color: #c4cbb8; }
.lp-log-ok .lp-log-verb { color: #34d399; } .lp-log-warn .lp-log-verb { color: #fbbf24; } .lp-log-info .lp-log-verb { color: #22d3ee; }
.lp-log-cursor { color: var(--lp-accent); animation: pulse 1s steps(2) infinite; }
.lp-liveops-stats { display: flex; flex-direction: column; gap: 14px; }
.lp-liveops-stat { background: var(--lp-bg-card); border: 1px solid var(--lp-border); border-radius: var(--lp-r); padding: 18px; }
.lp-liveops-stat-l { font-size: 11px; font-weight: 800; letter-spacing: 0.10em; color: var(--lp-text-muted); }
.lp-liveops-stat-v { font-size: 28px; font-weight: 800; color: var(--lp-ink); } .lp-liveops-stat-v small { font-size: 13px; color: var(--lp-text-muted); font-weight: 600; }
.lp-liveops-stat-bar { height: 6px; border-radius: 999px; background: var(--lp-border); margin-top: 10px; overflow: hidden; }
.lp-liveops-stat-bar > div { height: 100%; background: var(--lp-accent); border-radius: 999px; transition: width 0.6s; }
.lp-liveops-note { font-size: 12px; color: var(--lp-text-muted); } .lp-liveops-note-l { font-weight: 800; color: var(--lp-text-dim); }
@media (max-width: 880px) { .lp-liveops-grid { grid-template-columns: 1fr; } }

/* ─── live ticker (defined for completeness) ─── */
.lp-ticker { background: var(--lp-ink); color: #fff; font-size: 12px; overflow: hidden; }
.lp-ticker-inner { max-width: 1200px; margin: 0 auto; padding: 8px 28px; display: flex; align-items: center; gap: 14px; }
.lp-ticker-status { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; }
.lp-ticker-pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--lp-accent); }
.lp-ticker-sep { opacity: 0.3; } .lp-ticker-stat-l { opacity: 0.6; margin-right: 6px; } .lp-ticker-spacer { flex: 1; }

/* ─── keyframes ─── */
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-33.33%); } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
@keyframes floaty { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }

.lp-tilt { display: inline-flex; transition: transform 0.4s cubic-bezier(.16,1,.3,1); will-change: transform; }
@media (hover: hover) and (pointer: fine) {
  .lp-tilt { transform: perspective(900px) rotateX(var(--lp-tilt-x, 0deg)) rotateY(var(--lp-tilt-y, 0deg)); transform-style: preserve-3d; }
  .lp-tilt > * { transform: translateZ(20px); transform-style: preserve-3d; }
}
`;
