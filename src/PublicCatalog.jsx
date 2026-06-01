import React, { useEffect, useState } from "react";
import { listCatalogProducts, CATALOG_FAMILIES } from "./supabase.js";

// Public catalog at /catalog — the indexable landing surface for paid
// traffic. Renders a grid of every published SKU with category filter
// chips and a price tag. Photos are intentionally stubbed with a
// branded placeholder until Aviva supplies real product shots; that
// keeps any ad-driven visitor from landing on a partly-built PDP.

// Public catalog is locked to light mode regardless of the user's saved
// theme. We set data-theme on <html> without writing to localStorage so
// Landing.jsx still restores the user's actual choice on navigation back.
// (Per the brief: only the homepage exposes the toggle.)
function useForcedLightTheme() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const prev = html.dataset.theme;
    html.dataset.theme = "light";
    return () => {
      // Restore whatever the previous attribute was on unmount so a
      // pre-existing dark choice survives if React re-mounts the tree.
      if (prev) html.dataset.theme = prev;
      else delete html.dataset.theme;
    };
  }, []);
}

// ─── Branded "image coming soon" placeholder ────────────────────────
// We mark these visually so anyone seeing the page knows they're not
// looking at final imagery, but we still show the SKU so the catalog
// reads as a real shop.
function PlaceholderHero({ name, family }) {
  return (
    <div className="ct-placeholder" aria-label={`${name} — photo coming soon`}>
      <div className="ct-placeholder-mark">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="9" cy="9" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
      </div>
      <div className="ct-placeholder-label">PHOTO COMING SOON</div>
      <div className="ct-placeholder-sub">{family.toUpperCase()}</div>
    </div>
  );
}

function ColorDots({ colors = [] }) {
  if (!colors.length) return null;
  const shown = colors.slice(0, 5);
  const remain = colors.length - shown.length;
  return (
    <div className="ct-dots" aria-label={`${colors.length} colour${colors.length === 1 ? "" : "s"} available`}>
      {shown.map((c, i) => (
        <span
          key={i}
          className="ct-dot"
          style={{ background: c.hex }}
          title={c.name}
        />
      ))}
      {remain > 0 && <span className="ct-dots-more">+{remain}</span>}
    </div>
  );
}

function PriceTag({ price }) {
  if (price == null) return <span className="ct-price ct-price-tba">Pricing on request</span>;
  return <span className="ct-price"><span className="ct-price-from">From</span> ₹{Number(price).toLocaleString("en-IN")}</span>;
}

function ProductCard({ p }) {
  return (
    <a href={`/catalog/${p.slug}`} className="ct-card" aria-label={p.name}>
      {p.hero_image
        ? <img className="ct-card-img" src={p.hero_image} alt={p.name} loading="lazy" />
        : <PlaceholderHero name={p.name} family={p.family} />}
      <div className="ct-card-body">
        <div className="ct-card-meta">
          <span className="ct-card-family">{p.family.toUpperCase()}</span>
          {p.gsm ? <span className="ct-card-gsm">{p.gsm} GSM</span> : null}
        </div>
        <div className="ct-card-name">{p.name}</div>
        <ColorDots colors={p.colors} />
        <PriceTag price={p.starting_price} />
      </div>
    </a>
  );
}

export default function PublicCatalog() {
  useForcedLightTheme();
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    listCatalogProducts()
      .then(rows => { if (alive) { setProducts(rows); setLoading(false); } })
      .catch(e => { if (alive) { setError(e.message || String(e)); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const filtered = filter === "all" ? products : products.filter(p => p.family === filter);

  // Order family chips so any with zero products fall to the end (we
  // still show them so visitors see what's coming).
  const familyCounts = Object.fromEntries(CATALOG_FAMILIES.map(f => [f.id, 0]));
  for (const p of products) if (familyCounts[p.family] != null) familyCounts[p.family]++;

  return (
    <div className="ct">
      <style>{CATALOG_CSS}</style>

      <header className="ct-nav">
        <div className="ct-nav-inner">
          <a href="/" className="ct-brand" aria-label="Aviva International home">
            <img
              className="ct-brand-logo"
              src="/aviva-wordmark-black.png"
              alt="Aviva International"
              width="180" height="60"
            />
          </a>
          <nav className="ct-nav-links">
            <a href="/">Home</a>
            <a href="/catalog" aria-current="page">Catalogue</a>
            <a href="/#process">Process</a>
            <a href="/#contact">Contact</a>
          </nav>
          <div className="ct-nav-right">
            <a href="/portal" className="ct-nav-ghost">Client login</a>
            <a href="/portal/signup" className="ct-nav-filled">Get started →</a>
          </div>
        </div>
      </header>

      <section className="ct-hero">
        <div className="ct-hero-inner">
          <div className="ct-hero-eyebrow">PRODUCT CATALOGUE · VOL 01 · 2026</div>
          <h1 className="ct-hero-h">Every blank we print on.</h1>
          <p className="ct-hero-p">
            Tees, hoodies, sweats, joggers — sourced from our own floor, finished in-house with DTF.
            Zero MOQ on every SKU. Photography is being shot in the next drop; product specs and
            colour ranges are final.
          </p>
        </div>
      </section>

      <section className="ct-controls" aria-label="Filter by category">
        <button
          className={`ct-chip ${filter === "all" ? "on" : ""}`}
          onClick={() => setFilter("all")}
        >
          ALL <span className="ct-chip-count">{products.length}</span>
        </button>
        {CATALOG_FAMILIES.map(f => (
          <button
            key={f.id}
            className={`ct-chip ${filter === f.id ? "on" : ""}`}
            onClick={() => setFilter(f.id)}
            disabled={!familyCounts[f.id]}
          >
            {f.label.toUpperCase()} <span className="ct-chip-count">{familyCounts[f.id] || 0}</span>
          </button>
        ))}
      </section>

      <main className="ct-grid-wrap">
        {loading && <div className="ct-empty">Loading catalogue…</div>}
        {error   && <div className="ct-empty ct-err">Couldn’t load catalogue: {error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="ct-empty">Nothing in this category yet — check back soon.</div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="ct-grid">
            {filtered.map(p => <ProductCard key={p.slug} p={p} />)}
          </div>
        )}
      </main>

      <footer className="ct-foot">
        <div className="ct-foot-inner">
          <img
            className="ct-brand-logo ct-foot-logo"
            src="/aviva-wordmark-black.png"
            alt="Aviva International"
            width="200" height="68"
          />
          <div className="ct-foot-meta">
            Print on demand for brands that mean business.<br/>
            Based in Delhi · Shipping pan-India.
          </div>
          <div className="ct-foot-links">
            <a href="/">Home</a>
            <a href="/portal">Client login</a>
            <a href="/portal/signup">Get started →</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CSS — scoped under .ct. Reuses --lp-* tokens for theme consistency
// with the Landing page (same monochrome inversion palette).
// ═══════════════════════════════════════════════════════════════════
const CATALOG_CSS = `
/* Self-contained light-mode tokens for /catalog. Mirrors the light-mode
   block in Landing.jsx but lives here so the catalog renders correctly
   when reached as a hard navigation (Landing's CSS isn't mounted). The
   page is locked to light mode via useForcedLightTheme(), so we only
   need the light values — no [data-theme="dark"] override. */
:root {
  --lp-bg:           #efefef;
  --lp-bg-elev:      #ffffff;
  --lp-bg-card:      #ffffff;
  --lp-bg-deepest:   #d9d9d9;
  --lp-text:         #2a2a2a;
  --lp-text-strong:  #0a0a0a;
  --lp-text-dim:     #555555;
  --lp-text-muted:   #8a8a8a;
  --lp-border:       #d9d9d9;
  --lp-border-hover: #c4c4c4;
  --lp-accent:       #0a0a0a;
  --lp-accent-ink:   #efefef;
  --lp-accent-glow:  rgba(0, 0, 0, 0.14);
  --lp-accent-soft:  rgba(0, 0, 0, 0.05);
  --lp-err:          #E11D48;
  --lp-shadow:       0 8px 24px rgba(0, 0, 0, 0.10);
  color-scheme: light;
}
/* index.html sets body{background:#0a0a0a} for the landing's dark mode.
   Override it on these public-website pages so the cream bg shows
   immediately (and any scroll-overflow area looks correct). */
html, body { background: var(--lp-bg) !important; color: var(--lp-text); }

.ct {
  background: var(--lp-bg);
  color: var(--lp-text);
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.ct * { box-sizing: border-box; }
.ct a { color: inherit; text-decoration: none; }

/* ─── Nav ─── */
.ct-nav {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--lp-bg) 88%, transparent);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--lp-border);
}
.ct-nav-inner {
  max-width: 1240px; margin: 0 auto;
  padding: 16px 28px;
  display: flex; align-items: center; gap: 28px;
}
.ct-brand { display: inline-flex; align-items: center; flex-shrink: 0; }
.ct-brand-logo {
  height: 52px; width: auto; display: block;
  object-fit: contain;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.35));
}
:root[data-theme="light"] .ct-brand-logo {
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.12));
}
.ct-nav-links { display: flex; gap: 24px; margin-left: auto; }
.ct-nav-links a {
  font-size: 12px; letter-spacing: 0.06em;
  color: var(--lp-text-dim);
  transition: color 0.15s;
}
.ct-nav-links a:hover, .ct-nav-links a[aria-current="page"] {
  color: var(--lp-text-strong);
}
.ct-nav-right { display: flex; gap: 10px; align-items: center; }
.ct-nav-ghost, .ct-nav-filled {
  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700;
  padding: 9px 14px; border-radius: 999px;
  white-space: nowrap;
  transition: all 0.15s;
}
.ct-nav-ghost {
  border: 1px solid var(--lp-border);
  color: var(--lp-text);
}
.ct-nav-ghost:hover { border-color: var(--lp-text-strong); color: var(--lp-text-strong); }
a.ct-nav-filled {
  background: var(--lp-accent); color: var(--lp-accent-ink);
  border: 1px solid var(--lp-accent);
  box-shadow: 0 6px 20px var(--lp-accent-glow);
}
a.ct-nav-filled:hover { transform: translateY(-1px); box-shadow: 0 10px 28px var(--lp-accent-glow); }

/* ─── Hero strip ─── */
.ct-hero {
  background: var(--lp-bg-deepest);
  border-bottom: 1px solid var(--lp-border);
}
.ct-hero-inner {
  max-width: 1240px; margin: 0 auto;
  padding: 52px 28px 38px;
}
.ct-hero-eyebrow {
  font-size: 10px; letter-spacing: 0.20em; color: var(--lp-text-muted);
  font-weight: 700; margin-bottom: 12px;
}
.ct-hero-h {
  font-size: clamp(30px, 4.8vw, 52px); line-height: 1.05;
  font-weight: 900; letter-spacing: -0.01em;
  color: var(--lp-text-strong);
  margin: 0 0 14px;
}
.ct-hero-p {
  font-size: clamp(13px, 1.2vw, 15px); line-height: 1.6;
  max-width: 640px; color: var(--lp-text-dim);
  margin: 0;
}

/* ─── Filter chips ─── */
.ct-controls {
  max-width: 1240px; margin: 0 auto;
  padding: 22px 28px 4px;
  display: flex; flex-wrap: wrap; gap: 8px;
  position: sticky; top: 64px; z-index: 30;
  background: color-mix(in srgb, var(--lp-bg) 92%, transparent);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.ct-chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: 999px;
  font-size: 11px; letter-spacing: 0.10em; font-weight: 700;
  border: 1px solid var(--lp-border);
  background: var(--lp-bg-elev); color: var(--lp-text);
  cursor: pointer;
  transition: all 0.15s;
}
.ct-chip:hover:not(:disabled) { border-color: var(--lp-border-hover); color: var(--lp-text-strong); }
.ct-chip.on {
  background: var(--lp-accent); color: var(--lp-accent-ink);
  border-color: var(--lp-accent);
}
.ct-chip:disabled { opacity: 0.32; cursor: not-allowed; }
.ct-chip-count {
  font-size: 9px; opacity: 0.65;
  padding: 1px 6px; border-radius: 999px;
  background: rgba(255,255,255,0.08);
}
.ct-chip.on .ct-chip-count { background: rgba(0,0,0,0.10); opacity: 0.9; }
:root[data-theme="light"] .ct-chip-count { background: rgba(0,0,0,0.06); }

/* ─── Grid ─── */
.ct-grid-wrap {
  max-width: 1240px; margin: 0 auto;
  padding: 26px 28px 60px;
}
.ct-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 22px;
}
.ct-card {
  display: block;
  background: var(--lp-bg-card);
  border: 1px solid var(--lp-border);
  border-radius: 14px;
  overflow: hidden;
  transition: transform 0.18s ease-out, border-color 0.18s, box-shadow 0.18s;
}
.ct-card:hover {
  transform: translateY(-3px);
  border-color: var(--lp-border-hover);
  box-shadow: 0 16px 40px rgba(0,0,0,0.30);
}
:root[data-theme="light"] .ct-card:hover {
  box-shadow: 0 12px 32px rgba(0,0,0,0.08);
}
.ct-card-img {
  width: 100%; aspect-ratio: 1 / 1;
  object-fit: cover; background: var(--lp-bg-deepest);
  display: block;
}
.ct-card-body {
  padding: 16px 18px 18px;
  display: flex; flex-direction: column; gap: 10px;
}
.ct-card-meta {
  display: flex; gap: 10px; align-items: center;
  font-size: 9px; letter-spacing: 0.14em; font-weight: 700;
  color: var(--lp-text-muted);
}
.ct-card-gsm {
  padding: 2px 7px; border-radius: 6px;
  background: var(--lp-accent-soft);
  color: var(--lp-text);
}
.ct-card-name {
  font-size: 14px; font-weight: 800; letter-spacing: -0.01em;
  color: var(--lp-text-strong);
  line-height: 1.3;
}

/* ─── Color dots ─── */
.ct-dots { display: flex; align-items: center; gap: 5px; }
.ct-dot {
  width: 14px; height: 14px; border-radius: 999px;
  border: 1px solid var(--lp-border-hover);
  display: inline-block;
}
.ct-dots-more {
  font-size: 9px; letter-spacing: 0.06em; font-weight: 700;
  color: var(--lp-text-dim);
  padding-left: 4px;
}

/* ─── Price tag ─── */
.ct-price {
  font-size: 13px; font-weight: 800;
  color: var(--lp-text-strong);
  display: inline-flex; align-items: baseline; gap: 5px;
}
.ct-price-from {
  font-size: 9px; letter-spacing: 0.12em; font-weight: 700;
  text-transform: uppercase; color: var(--lp-text-muted);
}
.ct-price-tba {
  font-size: 10px; letter-spacing: 0.10em; font-weight: 700;
  text-transform: uppercase; color: var(--lp-text-muted);
}

/* ─── Placeholder ─── */
.ct-placeholder {
  position: relative;
  width: 100%; aspect-ratio: 1 / 1;
  background:
    linear-gradient(135deg, var(--lp-bg-deepest), var(--lp-bg-card));
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px;
  border-bottom: 1px solid var(--lp-border);
}
.ct-placeholder::before {
  content: "";
  position: absolute; inset: 0;
  background-image:
    repeating-linear-gradient(45deg,
      transparent 0,
      transparent 22px,
      var(--lp-accent-soft) 22px,
      var(--lp-accent-soft) 23px);
  opacity: 0.45;
  pointer-events: none;
}
.ct-placeholder-mark {
  width: 44px; height: 44px; border-radius: 12px;
  background: var(--lp-bg-card);
  border: 1px solid var(--lp-border);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--lp-text-dim);
  position: relative;
}
.ct-placeholder-label {
  font-size: 10px; letter-spacing: 0.18em; font-weight: 800;
  color: var(--lp-text-dim);
  position: relative;
}
.ct-placeholder-sub {
  font-size: 9px; letter-spacing: 0.14em; font-weight: 700;
  color: var(--lp-text-muted);
  position: relative;
}

/* ─── Empty / errors ─── */
.ct-empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--lp-text-muted);
  font-size: 13px;
}
.ct-err { color: var(--lp-err); }

/* ─── Footer ─── */
.ct-foot {
  border-top: 1px solid var(--lp-border);
  background: var(--lp-bg-deepest);
}
.ct-foot-inner {
  max-width: 1240px; margin: 0 auto;
  padding: 36px 28px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 32px;
  align-items: center;
}
.ct-foot-logo { height: 44px; }
.ct-foot-meta {
  font-size: 12px; line-height: 1.6;
  color: var(--lp-text-dim);
}
.ct-foot-links {
  display: flex; gap: 18px;
  font-size: 11px; letter-spacing: 0.10em; font-weight: 700;
  text-transform: uppercase;
}
.ct-foot-links a {
  color: var(--lp-text-dim);
  transition: color 0.15s;
}
.ct-foot-links a:hover { color: var(--lp-text-strong); }

/* ─── Responsive ─── */
@media (max-width: 880px) {
  .ct-nav-links { display: none; }
  .ct-nav-inner { gap: 10px; padding: 14px 16px; }
  .ct-nav-right .ct-nav-ghost { display: none; }
  .ct-brand-logo { height: 40px; }
  .ct-controls { top: 56px; padding: 18px 16px 4px; }
  .ct-grid-wrap { padding: 18px 16px 40px; }
  .ct-hero-inner { padding: 36px 16px 28px; }
  .ct-foot-inner { grid-template-columns: 1fr; text-align: center; gap: 18px; }
  .ct-foot-links { justify-content: center; }
}
@media (max-width: 520px) {
  .ct-grid { gap: 14px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
  .ct-card-body { padding: 12px 12px 14px; }
  .ct-card-name { font-size: 12px; }
  .ct-chip { padding: 6px 10px; font-size: 10px; }
}
`;
