import React, { useEffect, useState } from "react";
import { getCatalogProduct, listCatalogProducts, CATALOG_FAMILIES } from "./supabase.js";

// Product detail page at /catalog/[slug]. Single hero + spec block +
// description + CTA into the signup deeplink. Two-column on desktop,
// stacked on mobile. Hero falls back to a branded placeholder until
// real product photography is supplied via the admin editor.

// PDPs are locked to light mode — only the homepage exposes the theme
// toggle. data-theme is set on <html> without touching localStorage so
// Landing.jsx still restores the user's saved choice on navigation back.
function useForcedLightTheme() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const prev = html.dataset.theme;
    html.dataset.theme = "light";
    return () => {
      if (prev) html.dataset.theme = prev;
      else delete html.dataset.theme;
    };
  }, []);
}

function familyLabel(id) {
  return (CATALOG_FAMILIES.find(f => f.id === id) || {}).label || id;
}

function PlaceholderHero({ family }) {
  return (
    <div className="pdp-placeholder" aria-label="photo coming soon">
      <div className="pdp-placeholder-mark">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="9" cy="9" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
      </div>
      <div className="pdp-placeholder-label">PHOTO COMING SOON</div>
      <div className="pdp-placeholder-sub">{(family || "").toUpperCase()}</div>
    </div>
  );
}

export default function PublicPDP({ slug }) {
  useForcedLightTheme();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [activeColor, setActiveColor] = useState(0);
  const [activeSize,  setActiveSize]  = useState(null);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    let alive = true;
    getCatalogProduct(slug)
      .then(p => {
        if (!alive) return;
        if (!p) { setError("Product not found."); setLoading(false); return; }
        setProduct(p);
        setActiveSize(p.sizes?.[Math.floor((p.sizes?.length || 0) / 2)] || null);
        setActiveImage(0);
        setLoading(false);
      })
      .catch(e => { if (alive) { setError(e.message || String(e)); setLoading(false); } });
    return () => { alive = false; };
  }, [slug]);

  // Build a single flat list of every image to render in the gallery.
  // hero_image comes first, then any extra shots stored in the `images`
  // JSONB column. De-dupe in case a back-shot accidentally got saved as
  // the hero too.
  const gallery = React.useMemo(() => {
    if (!product) return [];
    const list = [];
    if (product.hero_image) list.push(product.hero_image);
    if (Array.isArray(product.images)) {
      for (const u of product.images) {
        if (u && !list.includes(u)) list.push(u);
      }
    }
    return list;
  }, [product]);

  // Set <title> + meta description for shareability / SEO. We're not
  // prerendering yet, but Google does JS-render SPAs eventually and
  // social cards rely on at least the title being right on share-time.
  useEffect(() => {
    if (!product) return;
    document.title = `${product.name} · Aviva International`;
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
    m.setAttribute("content", (product.description || "").slice(0, 160));
  }, [product]);

  const navHeader = (
    <header className="pdp-nav">
      <div className="pdp-nav-inner">
        <a href="/" className="pdp-brand" aria-label="Aviva International home">
          <img
            className="pdp-brand-logo"
            src="/aviva-wordmark-black.png"
            alt="Aviva International"
            width="180" height="60"
          />
        </a>
        <nav className="pdp-nav-links">
          <a href="/">Home</a>
          <a href="/catalog">Catalogue</a>
          <a href="/#contact">Contact</a>
        </nav>
        <div className="pdp-nav-right">
          <a href="/portal" className="pdp-nav-ghost">Client login</a>
          <a href={`/portal/signup?return=/catalog/${slug}`} className="pdp-nav-filled">Get started →</a>
        </div>
      </div>
    </header>
  );

  if (loading) {
    return (<div className="pdp"><style>{PDP_CSS}</style>{navHeader}<div className="pdp-state">Loading…</div></div>);
  }
  if (error) {
    return (
      <div className="pdp">
        <style>{PDP_CSS}</style>
        {navHeader}
        <div className="pdp-state pdp-state-err">
          <h2>Couldn’t load this product</h2>
          <p>{error}</p>
          <a href="/catalog" className="pdp-cta-link">← Back to catalogue</a>
        </div>
      </div>
    );
  }

  const colors = product.colors || [];
  const sizes  = product.sizes  || [];

  return (
    <div className="pdp">
      <style>{PDP_CSS}</style>
      {navHeader}

      <nav className="pdp-crumbs" aria-label="breadcrumb">
        <div className="pdp-crumbs-inner">
          <a href="/">Aviva</a>
          <span>›</span>
          <a href="/catalog">Catalogue</a>
          <span>›</span>
          <a href={`/catalog?family=${product.family}`}>{familyLabel(product.family)}</a>
          <span>›</span>
          <span className="pdp-crumbs-current">{product.name}</span>
        </div>
      </nav>

      <main className="pdp-wrap">
        {/* Hero gallery — front shot (hero_image) + any extra shots
            stored on the row's `images` array, with a thumb rail to
            switch between them. Falls back to the branded placeholder
            when there's no real photography yet. */}
        <section className="pdp-gallery">
          {gallery.length === 0 ? (
            <PlaceholderHero family={product.family} />
          ) : (
            <>
              <div className="pdp-hero-frame">
                <img
                  key={gallery[activeImage]}
                  className="pdp-hero-img"
                  src={gallery[activeImage]}
                  alt={`${product.name} — view ${activeImage + 1}`}
                />
              </div>
              {gallery.length > 1 && (
                <div className="pdp-thumbs" role="tablist" aria-label="Product images">
                  {gallery.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      role="tab"
                      aria-selected={i === activeImage}
                      className={`pdp-thumb ${i === activeImage ? "is-active" : ""}`}
                      onClick={() => setActiveImage(i)}
                    >
                      <img src={url} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Info column */}
        <section className="pdp-info">
          <div className="pdp-eyebrow">
            {familyLabel(product.family).toUpperCase()}
            {product.gsm && <> · <span className="pdp-eyebrow-gsm">{product.gsm} GSM</span></>}
          </div>
          <h1 className="pdp-h">{product.name}</h1>

          <div className="pdp-price-row">
            {product.starting_price == null ? (
              <span className="pdp-price-tba">PRICING ON REQUEST</span>
            ) : (
              <>
                <span className="pdp-price">₹{Number(product.starting_price).toLocaleString("en-IN")}</span>
                <span className="pdp-price-lbl">starting price · per piece</span>
              </>
            )}
          </div>

          {colors.length > 0 && (
            <div className="pdp-block">
              <div className="pdp-block-head">
                COLOUR <span className="pdp-block-sub">{colors[activeColor]?.name}</span>
              </div>
              <div className="pdp-swatches" role="radiogroup" aria-label="Colour">
                {colors.map((c, i) => (
                  <button
                    key={i}
                    role="radio"
                    aria-checked={i === activeColor}
                    aria-label={c.name}
                    className={`pdp-swatch ${i === activeColor ? "on" : ""}`}
                    style={{ background: c.hex }}
                    title={c.name}
                    onClick={() => setActiveColor(i)}
                  />
                ))}
              </div>
            </div>
          )}

          {sizes.length > 0 && (
            <div className="pdp-block">
              <div className="pdp-block-head">SIZE</div>
              <div className="pdp-sizes" role="radiogroup" aria-label="Size">
                {sizes.map(s => (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={s === activeSize}
                    className={`pdp-size ${s === activeSize ? "on" : ""}`}
                    onClick={() => setActiveSize(s)}
                  >{s}</button>
                ))}
              </div>
            </div>
          )}

          <div className="pdp-block">
            <div className="pdp-block-head">SPECIFICATION</div>
            <dl className="pdp-spec">
              {product.gsm && (<><dt>Weight</dt><dd>{product.gsm} GSM</dd></>)}
              {product.fabric && (<><dt>Fabric</dt><dd>{product.fabric}</dd></>)}
              {product.fit && (<><dt>Fit</dt><dd>{product.fit[0].toUpperCase() + product.fit.slice(1)}</dd></>)}
              <dt>Print method</dt><dd>DTF (direct-to-film), in-house</dd>
              <dt>MOQ</dt><dd>1 piece</dd>
            </dl>
          </div>

          {product.description && (
            <div className="pdp-block">
              <div className="pdp-block-head">ABOUT THIS BLANK</div>
              <p className="pdp-desc">{product.description}</p>
            </div>
          )}

          <div className="pdp-cta-row">
            {/* "Talk to us" deep-links into our WhatsApp with the product
                name pre-filled so the conversation has context from the
                first message. Number matches the one used in the
                landing footer + portal auth-help copy. */}
            <a
              href={`https://wa.me/919217765507?text=${encodeURIComponent(`Hey, can I know more about your brand? (Interested in: ${product.name})`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="pdp-cta"
            >
              Talk to us
            </a>
          </div>

          <div className="pdp-trust">
            Zero MOQ · DTF in-house · Same-day dispatch on orders by 2pm.
          </div>
        </section>
      </main>

      <footer className="pdp-foot">
        <div className="pdp-foot-inner">
          <img
            className="pdp-brand-logo pdp-foot-logo"
            src="/aviva-wordmark-black.png"
            alt="Aviva International"
            width="200" height="68"
          />
          <div className="pdp-foot-links">
            <a href="/">Home</a>
            <a href="/catalog">Catalogue</a>
            <a href="/portal">Client login</a>
            <a href="/portal/signup">Get started →</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const PDP_CSS = `
/* Self-contained light-mode tokens for /catalog/<slug> PDPs. Mirrors
   Landing's light-mode block but lives here so PDPs render correctly
   on direct/refresh navigation when Landing's CSS isn't mounted. The
   PDP is locked to light mode via useForcedLightTheme(). */
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
html, body { background: var(--lp-bg) !important; color: var(--lp-text); }

.pdp {
  background: var(--lp-bg);
  color: var(--lp-text);
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.pdp * { box-sizing: border-box; }
.pdp a { color: inherit; text-decoration: none; }

/* ─── Nav (shared shape with catalog index, slightly slimmer) ─── */
.pdp-nav {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--lp-bg) 88%, transparent);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--lp-border);
}
.pdp-nav-inner {
  max-width: 1240px; margin: 0 auto;
  padding: 14px 28px;
  display: flex; align-items: center; gap: 28px;
}
.pdp-brand { display: inline-flex; align-items: center; flex-shrink: 0; }
.pdp-brand-logo {
  height: 48px; width: auto; display: block;
  object-fit: contain;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.35));
}
:root[data-theme="light"] .pdp-brand-logo {
  filter: drop-shadow(0 2px 6px rgba(0,0,0,0.12));
}
.pdp-nav-links { display: flex; gap: 24px; margin-left: auto; font-size: 12px; letter-spacing: 0.06em; }
.pdp-nav-links a { color: var(--lp-text-dim); transition: color 0.15s; }
.pdp-nav-links a:hover { color: var(--lp-text-strong); }
.pdp-nav-right { display: flex; gap: 10px; align-items: center; }
.pdp-nav-ghost, .pdp-nav-filled {
  font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700;
  padding: 9px 14px; border-radius: 999px; white-space: nowrap;
  transition: all 0.15s;
}
.pdp-nav-ghost { border: 1px solid var(--lp-border); color: var(--lp-text); }
.pdp-nav-ghost:hover { border-color: var(--lp-text-strong); color: var(--lp-text-strong); }
a.pdp-nav-filled {
  background: var(--lp-accent); color: var(--lp-accent-ink);
  border: 1px solid var(--lp-accent);
  box-shadow: 0 6px 20px var(--lp-accent-glow);
}
a.pdp-nav-filled:hover { transform: translateY(-1px); box-shadow: 0 10px 28px var(--lp-accent-glow); }

/* ─── Breadcrumbs ─── */
.pdp-crumbs {
  border-bottom: 1px solid var(--lp-border);
  background: var(--lp-bg-deepest);
}
.pdp-crumbs-inner {
  max-width: 1240px; margin: 0 auto;
  padding: 14px 28px;
  font-size: 11px; letter-spacing: 0.06em;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  color: var(--lp-text-muted);
}
.pdp-crumbs a { transition: color 0.15s; }
.pdp-crumbs a:hover { color: var(--lp-text-strong); }
.pdp-crumbs-current { color: var(--lp-text); font-weight: 600; }

/* ─── Main two-column layout ─── */
.pdp-wrap {
  max-width: 1240px; margin: 0 auto;
  padding: 36px 28px 60px;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 48px;
}
.pdp-gallery {
  position: sticky; top: 80px;
  align-self: start;
  display: flex; flex-direction: column; gap: 14px;
}
.pdp-hero-frame {
  width: 100%; aspect-ratio: 1 / 1;
  border-radius: 14px;
  overflow: hidden;
  background: var(--lp-bg-deepest);
}
.pdp-hero-img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
  /* fade in when the active thumb changes */
  animation: pdp-fade 220ms ease-out;
}
@keyframes pdp-fade {
  from { opacity: 0; transform: scale(1.01); }
  to   { opacity: 1; transform: scale(1);    }
}
/* Thumbnail rail: horizontal strip under the hero. Wraps on narrow
   columns so tall PDPs don't introduce horizontal scroll on tablet. */
.pdp-thumbs {
  display: flex; flex-wrap: wrap; gap: 10px;
}
.pdp-thumb {
  width: 72px; height: 72px;
  padding: 0;
  border-radius: 10px;
  overflow: hidden;
  background: var(--lp-bg-deepest);
  border: 1.5px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.pdp-thumb img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
}
.pdp-thumb:hover { transform: translateY(-1px); border-color: var(--lp-border-hover); }
.pdp-thumb.is-active {
  border-color: var(--lp-text-strong);
}

/* ─── Placeholder (PDP-scale) ─── */
.pdp-placeholder {
  position: relative;
  width: 100%; aspect-ratio: 1 / 1;
  background: linear-gradient(135deg, var(--lp-bg-deepest), var(--lp-bg-card));
  border-radius: 14px;
  border: 1px solid var(--lp-border);
  overflow: hidden;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 14px;
}
.pdp-placeholder::before {
  content: ""; position: absolute; inset: 0;
  background-image: repeating-linear-gradient(45deg,
    transparent 0, transparent 32px,
    var(--lp-accent-soft) 32px, var(--lp-accent-soft) 33px);
  opacity: 0.55;
  pointer-events: none;
}
.pdp-placeholder-mark {
  width: 70px; height: 70px; border-radius: 16px;
  background: var(--lp-bg-card);
  border: 1px solid var(--lp-border);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--lp-text-dim);
  position: relative;
}
.pdp-placeholder-label {
  font-size: 12px; letter-spacing: 0.20em; font-weight: 800;
  color: var(--lp-text-dim);
  position: relative;
}
.pdp-placeholder-sub {
  font-size: 10px; letter-spacing: 0.18em; font-weight: 700;
  color: var(--lp-text-muted);
  position: relative;
}

/* ─── Info column ─── */
.pdp-info { display: flex; flex-direction: column; gap: 22px; }
.pdp-eyebrow {
  font-size: 10px; letter-spacing: 0.20em; font-weight: 700;
  color: var(--lp-text-muted);
}
.pdp-eyebrow-gsm { color: var(--lp-text); }
.pdp-h {
  font-size: clamp(26px, 3.4vw, 38px); line-height: 1.1;
  font-weight: 900; letter-spacing: -0.01em;
  color: var(--lp-text-strong);
  margin: 0;
}
.pdp-price-row {
  display: flex; align-items: baseline; gap: 12px;
  padding: 14px 0 4px;
  border-bottom: 1px solid var(--lp-border);
}
.pdp-price {
  font-size: 28px; font-weight: 900;
  color: var(--lp-text-strong);
  letter-spacing: -0.01em;
}
.pdp-price-lbl {
  font-size: 10px; letter-spacing: 0.14em; font-weight: 700;
  text-transform: uppercase; color: var(--lp-text-muted);
}
.pdp-price-tba {
  font-size: 12px; letter-spacing: 0.16em; font-weight: 800;
  text-transform: uppercase; color: var(--lp-text-dim);
  padding: 6px 0;
}

/* ─── Spec / option blocks ─── */
.pdp-block { display: flex; flex-direction: column; gap: 10px; }
.pdp-block-head {
  font-size: 10px; letter-spacing: 0.18em; font-weight: 800;
  color: var(--lp-text-muted);
}
.pdp-block-sub {
  font-weight: 600; letter-spacing: 0; text-transform: none;
  font-size: 11px; color: var(--lp-text);
  margin-left: 8px;
}

/* ─── Swatches ─── */
.pdp-swatches { display: flex; gap: 8px; flex-wrap: wrap; }
.pdp-swatch {
  width: 32px; height: 32px; border-radius: 999px;
  border: 1px solid var(--lp-border-hover);
  cursor: pointer; padding: 0;
  transition: transform 0.12s, box-shadow 0.12s;
}
.pdp-swatch:hover { transform: translateY(-1px); }
.pdp-swatch.on {
  box-shadow: 0 0 0 2px var(--lp-bg), 0 0 0 4px var(--lp-text-strong);
}

/* ─── Size pills ─── */
.pdp-sizes { display: flex; gap: 8px; flex-wrap: wrap; }
.pdp-size {
  min-width: 44px;
  padding: 9px 14px; border-radius: 8px;
  border: 1px solid var(--lp-border);
  background: var(--lp-bg-card); color: var(--lp-text);
  font-size: 12px; font-weight: 700; letter-spacing: 0.04em;
  cursor: pointer;
  transition: all 0.12s;
}
.pdp-size:hover { border-color: var(--lp-border-hover); color: var(--lp-text-strong); }
.pdp-size.on {
  background: var(--lp-accent); color: var(--lp-accent-ink);
  border-color: var(--lp-accent);
}

/* ─── Spec list ─── */
.pdp-spec {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 18px;
  margin: 0;
  font-size: 13px;
}
.pdp-spec dt {
  color: var(--lp-text-muted);
  font-size: 11px; letter-spacing: 0.10em; font-weight: 700;
  text-transform: uppercase;
  padding-top: 2px;
}
.pdp-spec dd {
  margin: 0;
  color: var(--lp-text-strong);
}

/* ─── Description ─── */
.pdp-desc {
  font-size: 14px; line-height: 1.65; color: var(--lp-text-dim);
  margin: 0;
}

/* ─── Sticky CTA row ─── */
.pdp-cta-row {
  display: flex; gap: 12px; flex-wrap: wrap;
  margin-top: 6px;
}
a.pdp-cta {
  display: inline-flex; align-items: center;
  background: var(--lp-accent); color: var(--lp-accent-ink);
  font-size: 13px; letter-spacing: 0.08em; font-weight: 800;
  text-transform: uppercase;
  padding: 16px 26px; border-radius: 999px;
  border: 1px solid var(--lp-accent);
  transition: all 0.18s;
  box-shadow: var(--lp-shadow);
}
a.pdp-cta:hover { transform: translateY(-1px); box-shadow: 0 12px 32px var(--lp-accent-glow); }
.pdp-cta-ghost {
  display: inline-flex; align-items: center;
  border: 1.5px solid var(--lp-text-strong); color: var(--lp-text-strong);
  font-size: 13px; letter-spacing: 0.08em; font-weight: 800;
  text-transform: uppercase;
  padding: 14px 22px; border-radius: 999px;
  transition: all 0.15s;
}
.pdp-cta-ghost:hover { background: var(--lp-accent-soft); }

.pdp-trust {
  font-size: 11px; color: var(--lp-text-muted);
  letter-spacing: 0.04em;
  border-top: 1px solid var(--lp-border);
  padding-top: 14px;
}

/* ─── Footer ─── */
.pdp-foot {
  border-top: 1px solid var(--lp-border);
  background: var(--lp-bg-deepest);
}
.pdp-foot-inner {
  max-width: 1240px; margin: 0 auto;
  padding: 30px 28px;
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 18px;
}
.pdp-foot-logo { height: 38px; }
.pdp-foot-links {
  display: flex; gap: 18px;
  font-size: 11px; letter-spacing: 0.10em; font-weight: 700;
  text-transform: uppercase;
}
.pdp-foot-links a { color: var(--lp-text-dim); transition: color 0.15s; }
.pdp-foot-links a:hover { color: var(--lp-text-strong); }

/* ─── States ─── */
.pdp-state {
  text-align: center; padding: 80px 20px;
  color: var(--lp-text-muted); font-size: 14px;
}
.pdp-state-err h2 {
  color: var(--lp-text-strong); margin: 0 0 8px;
  font-size: 18px;
}
.pdp-state-err p { margin: 0 0 16px; }
.pdp-cta-link {
  color: var(--lp-text);
  font-weight: 700; font-size: 12px; letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ─── Responsive ─── */
@media (max-width: 880px) {
  .pdp-nav-links { display: none; }
  .pdp-nav-inner { gap: 10px; padding: 12px 16px; }
  .pdp-nav-right .pdp-nav-ghost { display: none; }
  .pdp-brand-logo { height: 36px; }
  .pdp-crumbs-inner { padding: 12px 16px; }
  .pdp-wrap {
    grid-template-columns: 1fr;
    gap: 24px;
    padding: 18px 16px 40px;
  }
  .pdp-gallery { position: static; }
  .pdp-foot-inner { padding: 22px 16px; }
}
@media (max-width: 520px) {
  .pdp-h { font-size: 24px; }
  .pdp-price { font-size: 24px; }
}
`;
