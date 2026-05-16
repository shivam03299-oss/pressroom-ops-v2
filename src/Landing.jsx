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

const FEATURES = [
  { i: "automation", h: "Fully automated workflow", p: "From order intake to invoicing — every step logged, every transition timestamped. Zero manual reconciliation." },
  { i: "premium",    h: "DTF printing, premium quality", p: "High-density inks, soft hand-feel, wash-resistant. Tested on every fabric you ship." },
  { i: "realtime",   h: "Real-time ops dashboard", p: "See what's printing, who's on the floor, what's pending — from your phone, anywhere." },
  { i: "fast",       h: "Same-day dispatch", p: "Orders in by 2pm ship the same day. Track every piece end-to-end through the cycle." },
  { i: "scale",      h: "Zero MOQ, any volume", p: "Print 1 piece or 10,000 — same pipeline, same per-unit pricing tier, same dashboard. Other vendors start at 100 pieces; we start at 1." },
  { i: "compliant",  h: "GST-compliant, audit-ready", p: "Auto-generated invoices, payroll, expense reports. Numbers your CA will love." },
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
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="lp">
      <style>{CSS}</style>

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
            <a href="/admin" className="lp-nav-cta">Staff login →</a>
          </div>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-bg" style={{ backgroundImage: `url(${HERO_BG})` }} />
        <div className="lp-hero-overlay" />
        <div className="lp-hero-grid" />
        <div className="lp-hero-inner">
          <div className="lp-live-pill">
            <span className="lp-live-dot" />
            <span><b>Now printing</b> · 14 orders on the floor</span>
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
          <h2 className="lp-h2">Built for brands that want to scale without breaking.</h2>
          <div className="lp-feat-grid">
            {FEATURES.map(f => (
              <div key={f.h} className="lp-feat">
                <FeatureIcon kind={f.i} />
                <h3 className="lp-feat-h">{f.h}</h3>
                <p className="lp-feat-p">{f.p}</p>
              </div>
            ))}
          </div>
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
function FeatureIcon({ kind }) {
  const props = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (kind) {
    case "automation": return <svg {...props}><path d="M3 12h4l3-9 4 18 3-9h4"/></svg>;
    case "premium":    return <svg {...props}><path d="M12 2 4 7v6c0 5 3.5 9 8 9s8-4 8-9V7l-8-5z"/></svg>;
    case "realtime":   return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>;
    case "fast":       return <svg {...props}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>;
    case "scale":      return <svg {...props}><path d="M3 3v18M3 21h18M7 14l4-4 4 4 5-5"/></svg>;
    case "compliant":  return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13l2 2 4-4"/></svg>;
    default: return null;
  }
}

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
  padding: 9px 14px; border: 1px solid var(--lp-border); border-radius: 999px;
  color: var(--lp-text); transition: all 0.15s;
}
.lp-nav-cta:hover { border-color: var(--lp-accent); color: var(--lp-accent); }
@media (max-width: 880px) {
  .lp-links { display: none; }
  .lp-nav-inner { gap: 12px; padding: 14px 18px; }
  .lp-nav-right { margin-left: auto; }
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

/* ─── features ─── */
.lp-feat-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
  background: var(--lp-border); border: 1px solid var(--lp-border);
  border-radius: 14px; overflow: hidden;
}
.lp-feat { background: var(--lp-bg); padding: 34px 28px; transition: background 0.15s; }
.lp-feat:hover { background: var(--lp-bg-elev); }
.lp-feat svg { color: var(--lp-accent); margin-bottom: 18px; }
.lp-feat-h { font-size: 17px; font-weight: 700; color: var(--lp-text-strong); margin: 0 0 10px 0; }
.lp-feat-p { font-size: 14px; color: var(--lp-text-dim); line-height: 1.6; margin: 0; }
@media (max-width: 900px) { .lp-feat-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 560px) { .lp-feat-grid { grid-template-columns: 1fr; } }

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
`;
