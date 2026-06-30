import React, { useEffect, useState, useRef, useCallback } from "react";
import { getCatalogProduct, listCatalogProducts, CATALOG_FAMILIES } from "./supabase.js";
import { applySeo, setJsonLd, SITE_URL } from "./seo.js";

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

// Hover-zoom magnifier for the PDP hero image. Desktop: hover to zoom
// 2.3x, cursor position controls the transform-origin so the area under
// the pointer is what's magnified. Touch / no-hover devices: tap to
// toggle a centred zoom (because hover-follow doesn't translate to
// touch). prefers-reduced-motion: keeps the zoom but kills the spring.
function HeroZoom({ src, alt }) {
  const frameRef = useRef(null);
  const imgRef   = useRef(null);
  const [zoomed, setZoomed] = useState(false); // touch state only
  const isTouch = typeof window !== "undefined" &&
    window.matchMedia && window.matchMedia("(hover: none)").matches;

  // Apply the transform directly via DOM for buttery smoothness — going
  // through setState on every mousemove triggers a re-render and creates
  // visible jitter on lower-end machines.
  const applyTransform = useCallback((xPct, yPct, scale) => {
    if (!imgRef.current) return;
    imgRef.current.style.transformOrigin = `${xPct}% ${yPct}%`;
    imgRef.current.style.transform = `scale(${scale})`;
  }, []);

  const onMove = useCallback((e) => {
    if (isTouch || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    applyTransform(
      Math.max(0, Math.min(100, x)),
      Math.max(0, Math.min(100, y)),
      2.3
    );
  }, [applyTransform, isTouch]);

  const onLeave = useCallback(() => {
    if (isTouch) return;
    applyTransform(50, 50, 1);
  }, [applyTransform, isTouch]);

  const onTap = useCallback(() => {
    if (!isTouch) return;
    setZoomed(z => {
      const next = !z;
      applyTransform(50, 50, next ? 2.0 : 1);
      return next;
    });
  }, [applyTransform, isTouch]);

  // Reset zoom whenever the active image changes — feels weird to swap
  // images mid-zoom.
  useEffect(() => {
    applyTransform(50, 50, 1);
    setZoomed(false);
  }, [src, applyTransform]);

  return (
    <div
      ref={frameRef}
      className={`pdp-hero-frame pdp-hero-zoom ${zoomed ? "is-zoomed" : ""} ${isTouch ? "is-touch" : ""}`}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onTap}
    >
      <img
        ref={imgRef}
        key={src}
        className="pdp-hero-img"
        src={src}
        alt={alt}
      />
      <span className="pdp-zoom-hint" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <line x1="16.5" y1="16.5" x2="21" y2="21"/>
          <line x1="11" y1="8" x2="11" y2="14"/>
          <line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
        <span>{isTouch ? "Tap to zoom" : "Hover to zoom"}</span>
      </span>
    </div>
  );
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
  const [related,     setRelated]     = useState([]);
  const [menuOpen,    setMenuOpen]    = useState(false);

  // Mobile drawer: Escape to close, lock body scroll while open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

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

  // "You may also like" — pull all published products, drop the one
  // currently on screen, prefer items from the same family, then top
  // up with any others until we have 4. Runs independently of the
  // main product fetch so the section can fill in even on a slow PDP.
  useEffect(() => {
    if (!product) return;
    let alive = true;
    listCatalogProducts()
      .then(all => {
        if (!alive) return;
        const pool = all.filter(p => p.slug !== product.slug);
        const sameFamily = pool.filter(p => p.family === product.family);
        const others     = pool.filter(p => p.family !== product.family);
        setRelated([...sameFamily, ...others].slice(0, 4));
      })
      .catch(() => { /* non-fatal — section just stays empty */ });
    return () => { alive = false; };
  }, [product]);

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
    const title = `${product.name} — Premium Blank for DTF & Embroidery | Aviva International`;
    const desc = (product.description && product.description.trim())
      ? product.description.trim().slice(0, 158)
      : `${product.name} — a premium blank from Aviva International, ready for in-house DTF printing & embroidery. Zero MOQ, pan-India shipping${product.starting_price ? `. From ₹${product.starting_price}` : ""}.`;
    const imgs = [product.hero_image, ...(Array.isArray(product.images) ? product.images : [])].filter(Boolean);
    applySeo({ title, description: desc, path: `/catalog/${product.slug}`, image: imgs[0], type: "product" });
    setJsonLd("ld-product", {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      image: imgs,
      description: desc,
      brand: { "@type": "Brand", name: "Aviva International" },
      ...(product.starting_price ? {
        offers: {
          "@type": "Offer",
          priceCurrency: "INR",
          price: String(product.starting_price),
          availability: "https://schema.org/InStock",
          url: `${SITE_URL}/catalog/${product.slug}`,
        },
      } : {}),
    });
  }, [product]);

  const navHeader = (
    <>
    <header className="pdp-nav">
      <div className="pdp-nav-inner">
        <button
          className="pdp-burger"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <span /><span /><span />
        </button>
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
        </nav>
        <div className="pdp-nav-right">
          <a href="/enquire" className="pdp-nav-ghost">Enquire</a>
          <a href="/portal" className="pdp-nav-ghost">Client login</a>
          <a href={`/portal/signup?return=/catalog/${slug}`} className="pdp-nav-filled">Get started →</a>
        </div>
      </div>
    </header>
    <div
      className={`pdp-drawer-backdrop ${menuOpen ? "is-open" : ""}`}
      onClick={() => setMenuOpen(false)}
      aria-hidden={!menuOpen}
    />
    <aside className={`pdp-drawer ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen}>
      <div className="pdp-drawer-head">
        <span className="pdp-drawer-eyebrow">MENU</span>
        <button className="pdp-drawer-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>
      <nav className="pdp-drawer-links" onClick={() => setMenuOpen(false)}>
        <a href="/">Home</a>
        <a href="/catalog">Catalogue</a>
        <a href="/enquire">Enquire</a>
        <a href="/portal">Client login</a>
      </nav>
      <div className="pdp-drawer-foot">
        <a href={`/portal/signup?return=/catalog/${slug}`} className="pdp-drawer-cta" onClick={() => setMenuOpen(false)}>Get started →</a>
        <a href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer" className="pdp-drawer-reach">
          WhatsApp · +91 92177 65507
        </a>
      </div>
    </aside>
    </>
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
              <HeroZoom
                src={gallery[activeImage]}
                alt={`${product.name} — view ${activeImage + 1}`}
              />
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

      {related.length > 0 && (
        <section className="pdp-related" aria-labelledby="pdp-related-h">
          <div className="pdp-related-inner">
            <div className="pdp-related-head">
              <div className="pdp-related-eyebrow">YOU MAY ALSO LIKE</div>
              <h2 id="pdp-related-h" className="pdp-related-h">Customers also picked</h2>
            </div>
            <div className="pdp-related-grid">
              {related.map(p => (
                <a
                  key={p.slug}
                  href={`/catalog/${p.slug}`}
                  className="pdp-related-card"
                  aria-label={p.name}
                >
                  <div className="pdp-related-frame">
                    {p.hero_image ? (
                      <img
                        className="pdp-related-img"
                        src={p.hero_image}
                        alt={p.name}
                        loading="lazy"
                      />
                    ) : (
                      <PlaceholderHero family={p.family} />
                    )}
                  </div>
                  <div className="pdp-related-body">
                    <div className="pdp-related-meta">
                      <span className="pdp-related-family">{familyLabel(p.family).toUpperCase()}</span>
                      {p.gsm ? <span className="pdp-related-gsm"> · {p.gsm} GSM</span> : null}
                    </div>
                    <div className="pdp-related-name">{p.name}</div>
                    <div className="pdp-related-price">
                      {p.starting_price == null
                        ? "PRICING ON REQUEST"
                        : <>₹{Number(p.starting_price).toLocaleString("en-IN")}<span className="pdp-related-price-sub"> · starting</span></>}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

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
  --lp-bg:           #ffffff;
  --lp-bg-elev:      #ffffff;
  --lp-bg-card:      #ffffff;
  --lp-bg-deepest:   #eef0f5;
  --lp-text:         #3a4150;
  --lp-text-strong:  #0b0e16;
  --lp-text-dim:     #555d6c;
  --lp-text-muted:   #868d9c;
  --lp-border:       #e6e9f1;
  --lp-border-hover: #d2d8e6;
  --lp-accent:       #2c5cff;
  --lp-accent-ink:   #ffffff;
  --lp-accent-glow:  rgba(44, 92, 255, 0.30);
  --lp-accent-soft:  rgba(44, 92, 255, 0.08);
  --lp-err:          #E11D48;
  --lp-shadow:       0 14px 38px rgba(13, 22, 60, 0.10);
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

/* ── Hamburger (mobile only) ── */
.pdp-burger {
  display: none;
  width: 38px; height: 38px;
  border-radius: 10px;
  border: 1px solid var(--lp-border);
  background: transparent;
  cursor: pointer;
  align-items: center; justify-content: center;
  flex-direction: column; gap: 4px;
  padding: 0;
}
.pdp-burger span {
  display: block; width: 18px; height: 2px;
  background: var(--lp-text-strong);
  border-radius: 2px;
}
.pdp-burger:hover { border-color: var(--lp-text-strong); }

/* ── Drawer ── */
.pdp-drawer-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  opacity: 0; pointer-events: none;
  transition: opacity 0.22s ease-out;
  z-index: 90;
}
.pdp-drawer-backdrop.is-open { opacity: 1; pointer-events: auto; }
.pdp-drawer {
  position: fixed; top: 0; left: 0; bottom: 0;
  width: min(86vw, 360px);
  background: var(--lp-bg);
  border-right: 1px solid var(--lp-border);
  transform: translateX(-102%);
  transition: transform 0.26s cubic-bezier(.4,0,.2,1);
  z-index: 100;
  display: flex; flex-direction: column;
  padding: 18px 22px 22px;
  box-shadow: 18px 0 50px rgba(0,0,0,0.18);
}
.pdp-drawer.is-open { transform: translateX(0); }
.pdp-drawer-head {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--lp-border);
}
.pdp-drawer-eyebrow {
  font-size: 11px; letter-spacing: 0.16em; font-weight: 700;
  color: var(--lp-text-dim);
}
.pdp-drawer-close {
  width: 36px; height: 36px; border-radius: 10px;
  border: 1px solid var(--lp-border);
  background: transparent;
  color: var(--lp-text-strong);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.pdp-drawer-close:hover { border-color: var(--lp-text-strong); }
.pdp-drawer-links {
  display: flex; flex-direction: column;
  padding: 14px 0 6px;
}
.pdp-drawer-links a {
  font-size: 17px; font-weight: 700;
  color: var(--lp-text-strong);
  padding: 12px 0;
  border-bottom: 1px solid var(--lp-border);
  text-decoration: none;
}
.pdp-drawer-links a:hover { color: var(--lp-text); }
.pdp-drawer-foot {
  margin-top: auto;
  display: flex; flex-direction: column; gap: 10px;
  padding-top: 16px;
}
a.pdp-drawer-cta {
  display: block;
  background: var(--lp-accent); color: var(--lp-accent-ink);
  text-align: center;
  font-size: 13px; font-weight: 800; letter-spacing: 0.10em;
  text-transform: uppercase;
  padding: 14px 18px; border-radius: 999px;
  text-decoration: none;
  box-shadow: 0 8px 22px var(--lp-accent-glow);
}
.pdp-drawer-reach {
  text-align: center;
  font-size: 12.5px; font-weight: 700;
  color: var(--lp-text-dim);
  padding: 8px 0 4px;
  text-decoration: none;
}
.pdp-drawer-reach:hover { color: var(--lp-text-strong); }

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
  position: relative;
}
/* Magnifier wiring: the image scales up on hover and follows the cursor
   via inline transform-origin set by HeroZoom's onMouseMove. We override
   the fade-in keyframe transform for this variant so it doesn't fight
   the live scale, and crank cursor + transition. */
.pdp-hero-zoom {
  cursor: zoom-in;
}
.pdp-hero-zoom.is-zoomed,
.pdp-hero-zoom.is-touch { cursor: zoom-out; }
.pdp-hero-zoom .pdp-hero-img {
  /* No fade-in animation here — the scale transform is being driven
     live by the cursor handler and any keyframe would compete with it. */
  animation: none;
  transition: transform 240ms cubic-bezier(.2,.6,.2,1),
              transform-origin 0ms;
  will-change: transform;
}
/* Hovering: tighten the easing so the scale follows the cursor almost
   instantly, otherwise the zoom feels laggy. */
.pdp-hero-zoom:hover .pdp-hero-img,
.pdp-hero-zoom.is-zoomed .pdp-hero-img {
  transition: transform 90ms linear;
}

/* Small "zoom" hint chip in the top-right corner of the frame. Fades
   out once the user starts zooming so it doesn't sit on top of the
   product. */
.pdp-zoom-hint {
  position: absolute;
  top: 12px; right: 12px;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(10,10,10,0.78);
  color: #efefef;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase;
  pointer-events: none;
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  opacity: 1;
  transition: opacity 0.18s;
  z-index: 2;
}
.pdp-hero-zoom:hover .pdp-zoom-hint,
.pdp-hero-zoom.is-zoomed .pdp-zoom-hint { opacity: 0; }

.pdp-hero-img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
  /* fade in when the active thumb changes — only applies when not
     inside a .pdp-hero-zoom (the rule above kills the animation there) */
  animation: pdp-fade 220ms ease-out;
}
@keyframes pdp-fade {
  from { opacity: 0; transform: scale(1.01); }
  to   { opacity: 1; transform: scale(1);    }
}

/* Respect users with reduced-motion preference — skip the smooth
   easing on the zoom so motion is instant instead of animated. */
@media (prefers-reduced-motion: reduce) {
  .pdp-hero-zoom .pdp-hero-img,
  .pdp-hero-zoom:hover .pdp-hero-img,
  .pdp-hero-zoom.is-zoomed .pdp-hero-img {
    transition: none;
  }
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

/* ─── Customers also like ─── */
.pdp-related {
  border-top: 1px solid var(--lp-border);
  background: var(--lp-bg);
  padding: 56px 0 64px;
}
.pdp-related-inner {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 28px;
}
.pdp-related-head {
  margin-bottom: 28px;
}
.pdp-related-eyebrow {
  font-size: 11px; letter-spacing: 0.18em; font-weight: 700;
  color: var(--lp-text-dim);
  margin-bottom: 6px;
}
.pdp-related-h {
  font-size: 28px; font-weight: 800; letter-spacing: -0.01em;
  color: var(--lp-text-strong);
  margin: 0;
}
.pdp-related-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}
.pdp-related-card {
  display: flex; flex-direction: column;
  border-radius: 14px;
  background: var(--lp-bg-card);
  border: 1px solid var(--lp-border);
  overflow: hidden;
  transition: transform 0.18s ease-out, border-color 0.18s, box-shadow 0.18s;
  text-decoration: none;
  color: inherit;
}
.pdp-related-card:hover {
  transform: translateY(-2px);
  border-color: var(--lp-border-hover);
  box-shadow: 0 12px 28px rgba(0,0,0,0.08);
}
.pdp-related-frame {
  width: 100%; aspect-ratio: 1 / 1;
  background: var(--lp-bg-deepest);
  overflow: hidden;
}
.pdp-related-img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.4s ease;
}
.pdp-related-card:hover .pdp-related-img { transform: scale(1.03); }
.pdp-related-body {
  padding: 14px 14px 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.pdp-related-meta {
  font-size: 10.5px; letter-spacing: 0.14em; font-weight: 700;
  color: var(--lp-text-dim);
}
.pdp-related-gsm { color: var(--lp-text-dim); }
.pdp-related-name {
  font-size: 14px; font-weight: 700;
  color: var(--lp-text-strong);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.6em;
}
.pdp-related-price {
  margin-top: 4px;
  font-size: 15px; font-weight: 800;
  color: var(--lp-text-strong);
}
.pdp-related-price-sub {
  font-size: 10.5px; letter-spacing: 0.10em;
  color: var(--lp-text-dim);
  font-weight: 600;
}
@media (max-width: 880px) {
  .pdp-related-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .pdp-related { padding: 40px 0 48px; }
  .pdp-related-h { font-size: 22px; }
}
@media (max-width: 480px) {
  .pdp-related-inner { padding: 0 16px; }
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
.pdp-foot-logo { height: 96px; }
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
  /* 3-col grid: [burger] [centred logo] [phantom right gap] */
  .pdp-nav-inner {
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    gap: 8px;
    padding: 10px 14px;
    align-items: center;
  }
  .pdp-burger { display: inline-flex; grid-column: 1; justify-self: start; }
  .pdp-brand  { grid-column: 2; justify-self: center; }
  .pdp-nav-links { display: none; }
  .pdp-nav-right { display: none; }
  .pdp-brand-logo { height: 52px; }
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
