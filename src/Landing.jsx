import React, { useEffect, useState } from "react";

// Marketing landing for AVIVA INTERNATIONAL. Hosted at `/`; the staff
// dashboard lives at `/admin` and is mounted separately by main.jsx.
// All copy is in this file — edit headings/stats/quotes in place.

const STATS = [
  { value: "₹20Cr+", label: "Printed for clients", sub: "in the last few months alone" },
  { value: "500K+",  label: "Pieces shipped",       sub: "every size, every fabric" },
  { value: "99.2%",  label: "On-time dispatch",     sub: "tracked in real time" },
  { value: "100%",   label: "In-house printing",    sub: "no middlemen, ever" },
];

const CLIENTS = [
  "HASHWAY", "CULTURE CIRCLE", "FORFKSAKE", "VOYD", "MYUGEN",
  "OFF SUPPLY", "KANYE WEST", "BEAUTYST", "+ 40 MORE",
];

const STEPS = [
  { n: "01", h: "Send us your art", p: "Drop your designs, SKUs and quantities through your dashboard or a Shopify sync. No spreadsheets, no back-and-forth." },
  { n: "02", h: "We print, pack, ship", p: "DTF printing in-house. QC at every station. Packed and handed to courier the same day for cycle orders." },
  { n: "03", h: "Track every piece", p: "Live status on every order from intake to dispatch. Workers punch attendance, machines log production — you watch the dashboard." },
  { n: "04", h: "Scale without ops", p: "Hire designers, not operations. Our automation handles invoicing, payroll, P&L and inventory so you focus on growth." },
];

const FEATURES = [
  { h: "Fully automated workflow", p: "From order intake to invoicing — every step logged, every transition timestamped. Zero manual reconciliation." },
  { h: "DTF printing, premium quality", p: "High-density inks, soft hand-feel, wash-resistant. Tested on every fabric you ship." },
  { h: "Real-time ops dashboard", p: "See what's printing, who's on the floor, what's pending — from your phone, anywhere." },
  { h: "Same-day dispatch", p: "Orders in by 2pm ship the same day. Track every piece end-to-end through the cycle." },
  { h: "Bulk + dropship in one place", p: "Whether you need 50 pieces or 5,000, the same pipeline handles both. One dashboard, one workflow." },
  { h: "GST-compliant, audit-ready", p: "Auto-generated invoices, payroll, expense reports. Numbers your CA will love." },
];

const TESTIMONIALS = [
  { q: "Aviva took my entire fulfilment off my plate. I went from packing tees in my garage to dispatching 1,000 a day without hiring anyone.", a: "Founder, premium streetwear label" },
  { q: "The dashboard is something else. I can see exactly where every order is at any time. Saves me 10 hours a week.", a: "Operations lead, Culture Circle" },
  { q: "We tried three other vendors before settling here. Quality, turnaround and zero excuses — they just deliver.", a: "Founder, Hashway" },
];

const BADGES = [
  { label: "Made in Delhi", sub: "100% in-house production" },
  { label: "GST registered", sub: "07DVSPG2365C2ZI" },
  { label: "Same-day dispatch", sub: "for orders in by 2pm" },
  { label: "Secure payments", sub: "Razorpay + bank transfer" },
  { label: "Eco-friendly inks", sub: "OEKO-TEX compliant" },
  { label: "Real client dashboards", sub: "live order tracking" },
];

const GALLERY = [
  "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=80",
];

const HERO_BG = "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=2200&q=80";

export default function Landing() {
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
          <div className="lp-brand">AVIVA INTERNATIONAL</div>
          <nav className="lp-links">
            <a href="#process">Process</a>
            <a href="#work">Work</a>
            <a href="#why">Why us</a>
            <a href="#contact">Contact</a>
          </nav>
          <a href="/admin" className="lp-nav-cta">Staff login →</a>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-bg" style={{ backgroundImage: `url(${HERO_BG})` }} />
        <div className="lp-hero-overlay" />
        <div className="lp-hero-inner">
          <div className="lp-eyebrow">PRINT ON DEMAND · MADE IN DELHI</div>
          <h1 className="lp-h1">
            Print, pack, ship —<br />
            without lifting a finger.
          </h1>
          <p className="lp-lede">
            <b>₹20+ crore</b> worth of streetwear printed for India's fastest-growing brands.
            Fully automated workflows, real-time dashboards, zero ops headache.
          </p>
          <div className="lp-cta-row">
            <a href="#contact" className="lp-cta">Start printing →</a>
            <a href="#work" className="lp-cta-ghost">See our work</a>
          </div>
          <div className="lp-trust-line">
            <div className="lp-trust-dot" />
            <span><b>Trusted by</b> India's premium streetwear labels — Hashway, Culture Circle, Voyd, Myugen and 40+ more.</span>
          </div>
        </div>

        <div className="lp-hero-stats">
          {STATS.map(s => (
            <div key={s.label} className="lp-hero-stat">
              <div className="lp-hero-stat-val">{s.value}</div>
              <div className="lp-hero-stat-lbl">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-marquee" aria-hidden>
        <div className="lp-marquee-track">
          {[...CLIENTS, ...CLIENTS].map((c, i) => (
            <span key={i} className="lp-marquee-item">{c}</span>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-tag">THE NUMBERS</div>
          <h2 className="lp-h2">Receipts from the last few months.</h2>
          <p className="lp-sub">We do the boring stuff so brands can do the fun stuff. Here's what that looks like at our scale.</p>
          <div className="lp-stat-grid">
            {STATS.map(s => (
              <div key={s.label} className="lp-stat-card">
                <div className="lp-stat-val">{s.value}</div>
                <div className="lp-stat-lbl">{s.label}</div>
                <div className="lp-stat-sub">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="process" className="lp-section lp-section-dark">
        <div className="lp-section-inner">
          <div className="lp-tag">HOW IT WORKS</div>
          <h2 className="lp-h2">Four steps. That's the whole pipeline.</h2>
          <p className="lp-sub">Most clients ship within 48 hours of onboarding. The dashboard is live from day one.</p>
          <div className="lp-steps">
            {STEPS.map(s => (
              <div key={s.n} className="lp-step">
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
                <div className="lp-feat-dot" />
                <h3 className="lp-feat-h">{f.h}</h3>
                <p className="lp-feat-p">{f.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="work" className="lp-section lp-section-dark">
        <div className="lp-section-inner">
          <div className="lp-tag">RECENT WORK</div>
          <h2 className="lp-h2">A snapshot of what's left the floor.</h2>
          <p className="lp-sub">Premium DTF prints on a range of fabrics — tees, polos, quarter zips, hoodies.</p>
          <div className="lp-gallery">
            {GALLERY.map((src, i) => (
              <div key={i} className="lp-gallery-cell">
                <img src={src} alt="" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-tag">CREDENTIALS</div>
          <h2 className="lp-h2">Trust isn't claimed. It's earned, in writing.</h2>
          <div className="lp-badges">
            {BADGES.map(b => (
              <div key={b.label} className="lp-badge">
                <div className="lp-badge-check">✓</div>
                <div>
                  <div className="lp-badge-l">{b.label}</div>
                  <div className="lp-badge-s">{b.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-dark">
        <div className="lp-section-inner">
          <div className="lp-tag">WHAT FOUNDERS SAY</div>
          <h2 className="lp-h2">"They just deliver."</h2>
          <div className="lp-quotes">
            {TESTIMONIALS.map((t, i) => (
              <figure key={i} className="lp-quote">
                <blockquote>"{t.q}"</blockquote>
                <figcaption>— {t.a}</figcaption>
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
            <span className="lp-soon-pill">Contact channels going live shortly</span>
            <span className="lp-soon-meta">In the meantime, our team is busy printing the next ₹20Cr worth of orders.</span>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-foot-inner">
          <div>
            <div className="lp-foot-brand">AVIVA INTERNATIONAL</div>
            <div className="lp-foot-meta">
              Floor 2, A-57, Badli Ext, Delhi 110042<br />
              GSTIN 07DVSPG2365C2ZI · Proprietorship
            </div>
          </div>
          <div className="lp-foot-cols">
            <div>
              <div className="lp-foot-h">Site</div>
              <a href="#process">Process</a>
              <a href="#work">Work</a>
              <a href="#why">Why us</a>
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
          © {new Date().getFullYear()} AVIVA INTERNATIONAL · Print on demand for brands that mean business.
        </div>
      </footer>
    </div>
  );
}

const CSS = `
:root { color-scheme: dark; }
body { margin: 0; }
.lp {
  background: #0a0a0a; color: #e8e8e8;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.lp * { box-sizing: border-box; }
.lp a { color: inherit; text-decoration: none; }
.lp img { display: block; max-width: 100%; }

/* ─── nav ─── */
.lp-nav {
  position: sticky; top: 0; z-index: 50;
  transition: background 0.2s, border-color 0.2s, backdrop-filter 0.2s;
  border-bottom: 1px solid transparent;
}
.lp-nav.scrolled {
  background: rgba(10, 10, 10, 0.85);
  backdrop-filter: blur(12px);
  border-bottom-color: #1c1c1c;
}
.lp-nav-inner {
  max-width: 1240px; margin: 0 auto; padding: 18px 28px;
  display: flex; align-items: center; gap: 36px;
}
.lp-brand {
  font-weight: 800; letter-spacing: 0.22em; font-size: 12px;
  flex-shrink: 0;
}
.lp-links { display: flex; gap: 26px; margin-left: auto; }
.lp-links a {
  font-size: 12px; letter-spacing: 0.06em; color: #9a9a9a;
  transition: color 0.15s;
}
.lp-links a:hover { color: #fff; }
.lp-nav-cta {
  font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 700;
  padding: 9px 14px; border: 1px solid #2a2a2a; border-radius: 999px;
  transition: all 0.15s;
}
.lp-nav-cta:hover { border-color: #f3c41a; color: #f3c41a; }
@media (max-width: 760px) {
  .lp-links { display: none; }
  .lp-nav-inner { gap: 16px; padding: 14px 18px; }
  .lp-nav-cta { margin-left: auto; }
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
.lp-hero-overlay {
  position: absolute; inset: 0; z-index: 1;
  background:
    radial-gradient(1200px 600px at 12% 30%, rgba(243, 196, 26, 0.06), transparent 60%),
    linear-gradient(180deg, rgba(10,10,10,0.4) 0%, rgba(10,10,10,0.85) 70%, #0a0a0a 100%);
}
.lp-hero-inner {
  position: relative; z-index: 2;
  max-width: 1240px; margin: 0 auto; padding: 80px 28px 60px;
  width: 100%;
}
.lp-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 11px; letter-spacing: 0.28em; font-weight: 700;
  color: #f3c41a; margin-bottom: 22px;
  padding: 6px 12px; border: 1px solid rgba(243, 196, 26, 0.35); border-radius: 999px;
  background: rgba(243, 196, 26, 0.06);
}
.lp-h1 {
  font-size: clamp(38px, 7vw, 92px); font-weight: 800; line-height: 1.02;
  letter-spacing: -0.025em; color: #fff;
  margin: 0 0 22px 0; max-width: 900px;
}
.lp-lede {
  font-size: clamp(15px, 1.6vw, 19px); line-height: 1.55; color: #c2c2c2;
  max-width: 640px; margin: 0 0 32px 0;
}
.lp-lede b { color: #fff; font-weight: 700; }
.lp-cta-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 28px; }
.lp-cta {
  display: inline-flex; align-items: center; gap: 8px;
  background: #f3c41a; color: #0a0a0a; font-weight: 800;
  font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;
  padding: 16px 24px; border-radius: 999px;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 8px 24px rgba(243, 196, 26, 0.18);
}
.lp-cta:hover { transform: translateY(-1px); box-shadow: 0 10px 32px rgba(243, 196, 26, 0.28); }
.lp-cta-ghost {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid #2a2a2a; color: #e8e8e8;
  font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700;
  padding: 16px 22px; border-radius: 999px;
  transition: all 0.15s;
}
.lp-cta-ghost:hover { border-color: #555; color: #fff; }
.lp-trust-line {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; color: #9a9a9a; max-width: 720px;
}
.lp-trust-line b { color: #fff; font-weight: 700; }
.lp-trust-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #4ade80;
  box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.18);
  flex-shrink: 0;
}
.lp-hero-stats {
  position: relative; z-index: 2;
  max-width: 1240px; margin: 0 auto; width: 100%;
  padding: 0 28px 48px;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
  background: #1c1c1c;
  border: 1px solid #1c1c1c;
}
.lp-hero-stat { background: #0a0a0a; padding: 22px 24px; }
.lp-hero-stat-val {
  font-size: clamp(22px, 3vw, 34px); font-weight: 800; color: #fff;
  letter-spacing: -0.02em; line-height: 1;
}
.lp-hero-stat-lbl {
  font-size: 11px; color: #9a9a9a; letter-spacing: 0.12em; text-transform: uppercase;
  margin-top: 10px;
}
@media (max-width: 760px) {
  .lp-hero { min-height: auto; }
  .lp-hero-inner { padding: 60px 18px 40px; }
  .lp-hero-stats { grid-template-columns: repeat(2, 1fr); padding: 0 18px 32px; }
}

/* ─── marquee ─── */
.lp-marquee {
  background: #0a0a0a; border-block: 1px solid #1c1c1c;
  overflow: hidden; padding: 22px 0;
}
.lp-marquee-track {
  display: flex; gap: 56px;
  animation: marquee 40s linear infinite;
  width: max-content;
}
.lp-marquee-item {
  font-size: 14px; letter-spacing: 0.2em; font-weight: 700;
  color: #555; white-space: nowrap;
}
@keyframes marquee {
  to { transform: translateX(-50%); }
}

/* ─── section ─── */
.lp-section { padding: 90px 0; }
.lp-section-dark { background: #0d0d0d; }
.lp-section-inner { max-width: 1240px; margin: 0 auto; padding: 0 28px; }
@media (max-width: 760px) {
  .lp-section { padding: 60px 0; }
  .lp-section-inner { padding: 0 18px; }
}
.lp-tag {
  display: inline-block; font-size: 11px; letter-spacing: 0.28em; font-weight: 700;
  color: #f3c41a; margin-bottom: 14px;
  padding: 5px 10px; border: 1px solid rgba(243, 196, 26, 0.35); border-radius: 999px;
}
.lp-h2 {
  font-size: clamp(28px, 4.2vw, 50px); font-weight: 800; line-height: 1.08;
  letter-spacing: -0.02em; color: #fff;
  margin: 0 0 16px 0; max-width: 800px;
}
.lp-sub {
  font-size: clamp(14px, 1.4vw, 17px); color: #9a9a9a; line-height: 1.55;
  max-width: 620px; margin: 0 0 48px 0;
}

/* ─── stats grid ─── */
.lp-stat-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
}
.lp-stat-card {
  background: #111; border: 1px solid #1c1c1c;
  padding: 28px 24px; border-radius: 12px;
  transition: border-color 0.2s, transform 0.2s;
}
.lp-stat-card:hover { border-color: #2a2a2a; transform: translateY(-2px); }
.lp-stat-val {
  font-size: clamp(28px, 3.6vw, 44px); font-weight: 800; color: #fff;
  letter-spacing: -0.02em; line-height: 1; margin-bottom: 14px;
}
.lp-stat-lbl {
  font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700;
  color: #f3c41a; margin-bottom: 6px;
}
.lp-stat-sub { font-size: 13px; color: #9a9a9a; line-height: 1.5; }
@media (max-width: 900px) { .lp-stat-grid { grid-template-columns: repeat(2, 1fr); } }

/* ─── steps ─── */
.lp-steps {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
}
.lp-step {
  background: #111; border: 1px solid #1c1c1c;
  padding: 30px 24px; border-radius: 12px;
  position: relative;
}
.lp-step-n {
  font-size: 14px; letter-spacing: 0.2em; font-weight: 800;
  color: #f3c41a; margin-bottom: 18px;
}
.lp-step-h {
  font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 10px 0;
  letter-spacing: -0.01em;
}
.lp-step-p {
  font-size: 14px; color: #9a9a9a; line-height: 1.6; margin: 0;
}
@media (max-width: 900px) { .lp-steps { grid-template-columns: 1fr 1fr; } }
@media (max-width: 560px) { .lp-steps { grid-template-columns: 1fr; } }

/* ─── features ─── */
.lp-feat-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
  background: #1c1c1c; border: 1px solid #1c1c1c;
}
.lp-feat {
  background: #0a0a0a; padding: 32px 26px;
  transition: background 0.15s;
}
.lp-feat:hover { background: #111; }
.lp-feat-dot {
  width: 10px; height: 10px; border-radius: 2px; background: #f3c41a;
  margin-bottom: 18px;
}
.lp-feat-h {
  font-size: 17px; font-weight: 700; color: #fff; margin: 0 0 10px 0;
}
.lp-feat-p { font-size: 14px; color: #9a9a9a; line-height: 1.6; margin: 0; }
@media (max-width: 900px) { .lp-feat-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 560px) { .lp-feat-grid { grid-template-columns: 1fr; } }

/* ─── gallery ─── */
.lp-gallery {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
}
.lp-gallery-cell {
  aspect-ratio: 4 / 5; overflow: hidden; border-radius: 8px;
  background: #111; position: relative;
}
.lp-gallery-cell img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.4s;
  filter: grayscale(0.15) contrast(1.05);
}
.lp-gallery-cell:hover img { transform: scale(1.05); }
@media (max-width: 900px) { .lp-gallery { grid-template-columns: 1fr 1fr; } }

/* ─── badges ─── */
.lp-badges {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
}
.lp-badge {
  background: #111; border: 1px solid #1c1c1c; padding: 18px 20px;
  border-radius: 10px;
  display: flex; align-items: flex-start; gap: 14px;
}
.lp-badge-check {
  width: 28px; height: 28px; border-radius: 50%;
  background: rgba(243, 196, 26, 0.12); color: #f3c41a;
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; flex-shrink: 0;
}
.lp-badge-l { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 3px; }
.lp-badge-s { font-size: 12px; color: #9a9a9a; }
@media (max-width: 760px) { .lp-badges { grid-template-columns: 1fr; } }

/* ─── quotes ─── */
.lp-quotes {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
  margin-top: 32px;
}
.lp-quote {
  background: #111; border: 1px solid #1c1c1c;
  padding: 28px 26px; border-radius: 12px; margin: 0;
}
.lp-quote blockquote {
  font-size: 15px; line-height: 1.6; color: #e8e8e8;
  margin: 0 0 18px 0; font-weight: 500;
}
.lp-quote figcaption {
  font-size: 12px; color: #9a9a9a; letter-spacing: 0.04em;
}
@media (max-width: 900px) { .lp-quotes { grid-template-columns: 1fr; } }

/* ─── final CTA ─── */
.lp-cta-section {
  padding: 110px 0;
  background:
    radial-gradient(800px 400px at 50% 0%, rgba(243, 196, 26, 0.08), transparent 60%),
    #0a0a0a;
  border-top: 1px solid #1c1c1c;
  text-align: center;
}
.lp-cta-h {
  font-size: clamp(28px, 4.2vw, 48px); font-weight: 800; color: #fff;
  letter-spacing: -0.02em; line-height: 1.1;
  margin: 0 auto 18px; max-width: 720px;
}
.lp-cta-p {
  font-size: 16px; color: #c2c2c2; line-height: 1.55;
  margin: 0 auto 32px; max-width: 560px;
}
.lp-cta-section .lp-cta-row { justify-content: center; }
.lp-cta-foot {
  margin-top: 22px; font-size: 12px; color: #6a6a6a; letter-spacing: 0.06em;
}
.lp-cta-soon {
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  margin-top: 4px;
}
.lp-soon-pill {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 12px 22px; border-radius: 999px;
  background: rgba(243, 196, 26, 0.08);
  border: 1px solid rgba(243, 196, 26, 0.3);
  color: #f3c41a; font-size: 12px; font-weight: 700;
  letter-spacing: 0.18em; text-transform: uppercase;
}
.lp-soon-pill::before {
  content: ""; width: 8px; height: 8px; border-radius: 50%;
  background: #f3c41a; box-shadow: 0 0 0 4px rgba(243, 196, 26, 0.18);
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.85); }
}
.lp-soon-meta { font-size: 13px; color: #8a8a8a; max-width: 480px; line-height: 1.5; }
.lp-foot-soon {
  display: block; font-size: 13px; color: #6a6a6a; padding: 4px 0;
  font-style: italic;
}

/* ─── footer ─── */
.lp-foot {
  background: #050505; border-top: 1px solid #1c1c1c;
  padding: 60px 0 0 0;
}
.lp-foot-inner {
  max-width: 1240px; margin: 0 auto; padding: 0 28px;
  display: grid; grid-template-columns: 1.4fr 1fr; gap: 40px;
  padding-bottom: 40px; border-bottom: 1px solid #1c1c1c;
}
.lp-foot-brand {
  font-weight: 800; letter-spacing: 0.18em; font-size: 14px; color: #fff;
  margin-bottom: 14px;
}
.lp-foot-meta { font-size: 13px; color: #777; line-height: 1.7; }
.lp-foot-cols {
  display: grid; grid-template-columns: 1fr 1fr; gap: 32px;
}
.lp-foot-h {
  font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase;
  color: #f3c41a; font-weight: 700; margin-bottom: 14px;
}
.lp-foot-cols a {
  display: block; font-size: 13px; color: #aaa; padding: 4px 0;
  transition: color 0.15s;
}
.lp-foot-cols a:hover { color: #fff; }
.lp-foot-bar {
  max-width: 1240px; margin: 0 auto; padding: 22px 28px;
  font-size: 12px; color: #555;
}
@media (max-width: 760px) {
  .lp-foot-inner { grid-template-columns: 1fr; padding: 0 18px 30px; }
  .lp-foot-bar { padding: 20px 18px; }
}
`;
