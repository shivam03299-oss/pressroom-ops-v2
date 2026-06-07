import React, { useEffect, useState } from "react";
import { submitEnquiry } from "./supabase.js";
import { useSmartHeader } from "./useSmartHeader.js";

// Public enquiry form mounted at /enquire. Submits straight into
// public.enquiries via the anon Supabase key — RLS lets anon insert,
// admin-only select. The admin dashboard surfaces the inbox at
// /admin → Enquiries.

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

const VOLUME_OPTIONS = [
  "Just exploring",
  "1–50 pieces / month",
  "50–200 pieces / month",
  "200–500 pieces / month",
  "500–2,000 pieces / month",
  "2,000+ pieces / month",
];

// Decoration / print methods we offer — also surfaced on the landing's
// bulk-orders band, which deep-links here via ?service=<id>.
const SERVICE_OPTIONS = [
  { id: "dtf",         label: "DTF" },
  { id: "dtg",         label: "DTG" },
  { id: "screen",      label: "Screen printing" },
  { id: "embroidery",  label: "Embroidery" },
  { id: "bulk",        label: "Bulk / wholesale" },
  { id: "notsure",     label: "Not sure yet" },
];

export default function PublicEnquire() {
  useForcedLightTheme();

  // Pull `source` query param if present, so we can attribute where
  // the enquiry came from (e.g. /enquire?source=pdp-black-boxy).
  const [source] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get("source") || null;
    } catch { return null; }
  });

  const [name,    setName]    = useState("");
  const [phone,   setPhone]   = useState("");
  const [email,   setEmail]   = useState("");
  const [brand,   setBrand]   = useState("");
  const [volume,  setVolume]  = useState("");
  const [message, setMessage] = useState("");
  // Pre-select a service if the landing deep-linked here (?service=embroidery).
  const [services, setServices] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const want = (new URL(window.location.href).searchParams.get("service") || "").toLowerCase();
      return SERVICE_OPTIONS.some(s => s.id === want) ? [want] : [];
    } catch { return []; }
  });
  const toggleService = (id) =>
    setServices(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const { hidden: navHidden } = useSmartHeader();
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState(null);
  const [done,    setDone]    = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = "Enquire · Aviva International";
  }, []);

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

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await submitEnquiry({
        name, phone, email,
        brand_name: brand,
        monthly_volume: volume,
        service_type: services.map(id => SERVICE_OPTIONS.find(s => s.id === id)?.label || id).join(", ") || null,
        message,
        source: source || "enquire-page",
      });
      setDone(true);
    } catch (ex) {
      setErr(ex.message || String(ex));
      setBusy(false);
    }
  };

  return (
    <div className="enq">
      <style>{ENQ_CSS}</style>

      <header className={`enq-nav${navHidden && !menuOpen ? " enq-nav--hidden" : ""}`}>
        <div className="enq-nav-inner">
          <button
            className="enq-burger"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span /><span /><span />
          </button>
          <a href="/" className="enq-brand" aria-label="Aviva International home">
            <img
              className="enq-brand-logo"
              src="/aviva-wordmark-black.png"
              alt="Aviva International"
              width="180" height="60"
            />
          </a>
          <nav className="enq-nav-links">
            <a href="/">Home</a>
            <a href="/catalog">Catalogue</a>
            <a href="/enquire" aria-current="page">Enquire</a>
          </nav>
          <div className="enq-nav-right">
            <a href="/portal" className="enq-nav-ghost">Client login</a>
            <a href="/portal/signup" className="enq-nav-filled">Get started →</a>
          </div>
        </div>
      </header>

      <div
        className={`enq-drawer-backdrop ${menuOpen ? "is-open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden={!menuOpen}
      />
      <aside className={`enq-drawer ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen}>
        <div className="enq-drawer-head">
          <span className="enq-drawer-eyebrow">MENU</span>
          <button className="enq-drawer-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <nav className="enq-drawer-links" onClick={() => setMenuOpen(false)}>
          <a href="/">Home</a>
          <a href="/catalog">Catalogue</a>
          <a href="/enquire">Enquire</a>
          <a href="/portal">Client login</a>
        </nav>
        <div className="enq-drawer-foot">
          <a href="/portal/signup" className="enq-drawer-cta" onClick={() => setMenuOpen(false)}>Get started →</a>
          <a href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer" className="enq-drawer-reach">
            WhatsApp · +91 92177 65507
          </a>
        </div>
      </aside>

      <main className="enq-wrap">
        <div className="enq-col">
          <div className="enq-eyebrow">TALK TO US</div>
          <h1 className="enq-h">Tell us what you're printing.</h1>
          <p className="enq-sub">
            Drop your details and a quick brief. We'll get back within one business
            day — usually within a few hours — with pricing, lead times and a
            sample on the way.
          </p>

          <ul className="enq-bullets">
            <li><span>✓</span> Zero MOQ — order 1 piece or 10,000</li>
            <li><span>✓</span> DTF printing in-house · soft hand-feel</li>
            <li><span>✓</span> Same-day dispatch on orders by 2 PM</li>
            <li><span>✓</span> GST-registered · audit-ready invoicing</li>
          </ul>

          <div className="enq-reach">
            <div className="enq-reach-l">Prefer to reach out directly?</div>
            <a className="enq-reach-link" href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer">
              WhatsApp · +91 92177 65507
            </a>
            <a className="enq-reach-link" href="mailto:avivainternational05@gmail.com">
              avivainternational05@gmail.com
            </a>
          </div>
        </div>

        <div className="enq-col">
          {done ? (
            <div className="enq-card enq-done">
              <div className="enq-done-mark">✓</div>
              <h2 className="enq-done-h">We got your enquiry.</h2>
              <p className="enq-done-p">
                Thanks {name.trim().split(" ")[0] || "—"}, our team will reach out
                on <b>{phone || "the number you shared"}</b> shortly. Keep an eye
                on WhatsApp.
              </p>
              <div className="enq-done-row">
                <a href="/catalog" className="enq-done-link">← Browse the catalogue while you wait</a>
              </div>
            </div>
          ) : (
            <form className="enq-card enq-form" onSubmit={onSubmit}>
              <h2 className="enq-form-h">Send us a brief</h2>

              <label className="enq-field">
                <span className="enq-label">Your name <em>*</em></span>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Aarav Sharma"
                  required
                  maxLength={120}
                />
              </label>

              <div className="enq-row">
                <label className="enq-field">
                  <span className="enq-label">Phone / WhatsApp <em>*</em></span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+91 98XXX XXXXX"
                    required
                    maxLength={32}
                  />
                </label>
                <label className="enq-field">
                  <span className="enq-label">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@brand.com"
                    maxLength={160}
                  />
                </label>
              </div>

              <label className="enq-field">
                <span className="enq-label">Brand / Company</span>
                <input
                  type="text"
                  value={brand}
                  onChange={e => setBrand(e.target.value)}
                  placeholder="What do you call your label?"
                  maxLength={160}
                />
              </label>

              <div className="enq-field">
                <span className="enq-label">What do you need? <em style={{ fontStyle: "normal", color: "var(--enq-muted, #888)" }}>· pick any</em></span>
                <div className="enq-chips">
                  {SERVICE_OPTIONS.map(s => (
                    <button
                      type="button"
                      key={s.id}
                      className={`enq-chip${services.includes(s.id) ? " on" : ""}`}
                      aria-pressed={services.includes(s.id)}
                      onClick={() => toggleService(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="enq-field">
                <span className="enq-label">Monthly volume</span>
                <select value={volume} onChange={e => setVolume(e.target.value)}>
                  <option value="">Select a range…</option>
                  {VOLUME_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>

              <label className="enq-field">
                <span className="enq-label">What are you printing?</span>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                  placeholder="e.g. oversized tees, 240 GSM, DTF logo on the chest + back, around 200 pcs to start"
                  maxLength={2000}
                />
              </label>

              {err && <div className="enq-error">{err}</div>}

              <button type="submit" className="enq-submit" disabled={busy}>
                {busy ? "Sending…" : "Send enquiry →"}
              </button>

              <div className="enq-fine">
                By submitting you agree we can contact you on the number/email
                above about your enquiry. We don't sell or share your data.
              </div>
            </form>
          )}
        </div>
      </main>

      <footer className="enq-foot">
        <div className="enq-foot-inner">
          <img
            className="enq-brand-logo enq-foot-logo"
            src="/aviva-wordmark-black.png"
            alt="Aviva International"
            width="200" height="68"
          />
          <div className="enq-foot-links">
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

const ENQ_CSS = `
:root {
  --lp-bg:           #efefef;
  --lp-bg-card:      #ffffff;
  --lp-bg-deepest:   #e6e6e6;
  --lp-border:       rgba(10,10,10,0.10);
  --lp-border-hover: rgba(10,10,10,0.22);
  --lp-text:         #1a1a1a;
  --lp-text-strong:  #0a0a0a;
  --lp-text-dim:     #555;
  --lp-text-muted:   #888;
  --lp-accent:       #0a0a0a;
  --lp-accent-ink:   #efefef;
  --lp-accent-soft:  rgba(10,10,10,0.06);
  --lp-accent-glow:  rgba(10,10,10,0.16);
  --lp-success:      #047857;
  --lp-error:        #b91c1c;
  color-scheme: light;
}
html, body { margin: 0; padding: 0; }
body { background: var(--lp-bg); color: var(--lp-text); }
.enq {
  min-height: 100vh;
  background: var(--lp-bg); color: var(--lp-text);
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.enq a { color: inherit; text-decoration: none; }

/* ── nav (matches catalog/PDP) ── */
.enq-nav {
  position: sticky; top: 0; z-index: 30;
  background: var(--lp-bg);
  border-bottom: 1px solid var(--lp-border);
  transition: transform 0.34s cubic-bezier(.4,0,.2,1);
  will-change: transform;
}
.enq-nav--hidden { transform: translateY(-100%); }
.enq-nav-inner {
  max-width: 1240px; margin: 0 auto;
  padding: 14px 28px;
  display: flex; align-items: center; gap: 28px;
}
.enq-brand { display: inline-flex; align-items: center; flex-shrink: 0; }
.enq-brand-logo { height: 44px; width: auto; display: block; object-fit: contain; }
.enq-nav-links {
  display: flex; gap: 26px; margin-left: auto;
}
.enq-nav-links a {
  font-size: 12px; letter-spacing: 0.06em; color: var(--lp-text-dim);
  transition: color 0.15s;
}
.enq-nav-links a:hover { color: var(--lp-text-strong); }
.enq-nav-right { display: flex; gap: 10px; align-items: center; }
.enq-nav-ghost, .enq-nav-filled {
  font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 700;
  padding: 9px 14px; border-radius: 999px;
  white-space: nowrap;
  transition: all 0.15s;
}
.enq-nav-ghost {
  border: 1px solid var(--lp-border); color: var(--lp-text);
  background: transparent;
}
.enq-nav-ghost:hover { border-color: var(--lp-accent); }
a.enq-nav-filled {
  background: var(--lp-accent); color: var(--lp-accent-ink);
  border: 1px solid var(--lp-accent);
  box-shadow: 0 6px 20px var(--lp-accent-glow);
}
a.enq-nav-filled:hover { transform: translateY(-1px); }

/* ── Hamburger (mobile only) ── */
.enq-burger {
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
.enq-burger span {
  display: block; width: 18px; height: 2px;
  background: var(--lp-text-strong);
  border-radius: 2px;
}
.enq-burger:hover { border-color: var(--lp-text-strong); }

/* ── Drawer ── */
.enq-drawer-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  opacity: 0; pointer-events: none;
  transition: opacity 0.22s ease-out;
  z-index: 90;
}
.enq-drawer-backdrop.is-open { opacity: 1; pointer-events: auto; }
.enq-drawer {
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
.enq-drawer.is-open { transform: translateX(0); }
.enq-drawer-head {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--lp-border);
}
.enq-drawer-eyebrow {
  font-size: 11px; letter-spacing: 0.16em; font-weight: 700;
  color: var(--lp-text-dim);
}
.enq-drawer-close {
  width: 36px; height: 36px; border-radius: 10px;
  border: 1px solid var(--lp-border);
  background: transparent;
  color: var(--lp-text-strong);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.enq-drawer-close:hover { border-color: var(--lp-text-strong); }
.enq-drawer-links {
  display: flex; flex-direction: column;
  padding: 14px 0 6px;
}
.enq-drawer-links a {
  font-size: 17px; font-weight: 700;
  color: var(--lp-text-strong);
  padding: 12px 0;
  border-bottom: 1px solid var(--lp-border);
  text-decoration: none;
}
.enq-drawer-links a:hover { color: var(--lp-text); }
.enq-drawer-foot {
  margin-top: auto;
  display: flex; flex-direction: column; gap: 10px;
  padding-top: 16px;
}
a.enq-drawer-cta {
  display: block;
  background: var(--lp-accent); color: var(--lp-accent-ink);
  text-align: center;
  font-size: 13px; font-weight: 800; letter-spacing: 0.10em;
  text-transform: uppercase;
  padding: 14px 18px; border-radius: 999px;
  text-decoration: none;
  box-shadow: 0 8px 22px var(--lp-accent-glow);
}
.enq-drawer-reach {
  text-align: center;
  font-size: 12.5px; font-weight: 700;
  color: var(--lp-text-dim);
  padding: 8px 0 4px;
  text-decoration: none;
}
.enq-drawer-reach:hover { color: var(--lp-text-strong); }

/* ── body grid ── */
.enq-wrap {
  max-width: 1240px; margin: 0 auto;
  padding: 56px 28px 80px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
  gap: 64px;
  align-items: start;
}
.enq-col { min-width: 0; }

.enq-eyebrow {
  font-size: 11px; letter-spacing: 0.18em; font-weight: 700;
  color: var(--lp-text-dim);
  margin-bottom: 10px;
}
.enq-h {
  font-size: 42px; line-height: 1.05; letter-spacing: -0.02em;
  font-weight: 800; color: var(--lp-text-strong);
  margin: 0 0 18px;
}
.enq-sub {
  font-size: 15.5px; line-height: 1.6; color: var(--lp-text);
  margin: 0 0 28px; max-width: 50ch;
}
.enq-bullets {
  list-style: none; padding: 0; margin: 0 0 32px;
  display: flex; flex-direction: column; gap: 10px;
}
.enq-bullets li {
  display: flex; align-items: center; gap: 12px;
  font-size: 14px; color: var(--lp-text);
}
.enq-bullets li span {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 999px;
  background: var(--lp-accent); color: var(--lp-accent-ink);
  font-size: 12px; font-weight: 800;
  flex-shrink: 0;
}
.enq-reach {
  background: var(--lp-bg-card);
  border: 1px solid var(--lp-border);
  border-radius: 14px;
  padding: 18px 20px;
  display: flex; flex-direction: column; gap: 8px;
}
.enq-reach-l {
  font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--lp-text-dim); font-weight: 700;
}
.enq-reach-link {
  font-size: 14px; font-weight: 700; color: var(--lp-text-strong);
  transition: color 0.15s;
}
.enq-reach-link:hover { color: var(--lp-text); text-decoration: underline; }

/* ── form card ── */
.enq-card {
  background: var(--lp-bg-card);
  border: 1px solid var(--lp-border);
  border-radius: 18px;
  padding: 32px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.04);
}
.enq-form-h {
  font-size: 22px; font-weight: 800; letter-spacing: -0.01em;
  color: var(--lp-text-strong);
  margin: 0 0 22px;
}
.enq-row {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
}
.enq-field {
  display: flex; flex-direction: column; gap: 6px;
  margin-bottom: 14px;
}
.enq-label {
  font-size: 12px; letter-spacing: 0.06em; font-weight: 700;
  color: var(--lp-text);
  text-transform: uppercase;
}
.enq-label em { color: var(--lp-error); font-style: normal; }
.enq-field input,
.enq-field select,
.enq-field textarea {
  width: 100%;
  font: inherit; font-size: 14.5px; color: var(--lp-text-strong);
  background: #fafafa;
  border: 1.5px solid var(--lp-border);
  border-radius: 10px;
  padding: 12px 14px;
  outline: none;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.enq-field textarea { resize: vertical; min-height: 96px; line-height: 1.5; }
.enq-field input:focus,
.enq-field select:focus,
.enq-field textarea:focus {
  border-color: var(--lp-accent);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(10,10,10,0.06);
}
.enq-field input::placeholder,
.enq-field textarea::placeholder { color: var(--lp-text-muted); }

.enq-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px; }
.enq-chip {
  appearance: none; cursor: pointer;
  padding: 9px 14px; border-radius: 999px;
  border: 1px solid var(--lp-border, #ddd);
  background: #fff; color: var(--lp-text, #222);
  font-size: 13px; font-weight: 600; font-family: inherit;
  transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.1s;
}
.enq-chip:hover { border-color: var(--lp-accent, #0a0a0a); }
.enq-chip:active { transform: scale(0.97); }
.enq-chip.on {
  background: var(--lp-accent, #0a0a0a); color: #fff;
  border-color: var(--lp-accent, #0a0a0a);
}

.enq-error {
  margin: 4px 0 14px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #fff1f1; border: 1px solid #fecaca;
  color: var(--lp-error); font-size: 13.5px; font-weight: 600;
}

.enq-submit {
  display: inline-flex; align-items: center; justify-content: center;
  width: 100%;
  background: var(--lp-accent); color: var(--lp-accent-ink);
  border: 1px solid var(--lp-accent);
  font: inherit; font-size: 14px; font-weight: 800;
  letter-spacing: 0.10em; text-transform: uppercase;
  padding: 16px 22px; border-radius: 999px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
  box-shadow: 0 8px 24px var(--lp-accent-glow);
}
.enq-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 14px 32px var(--lp-accent-glow);
}
.enq-submit:disabled { opacity: 0.55; cursor: not-allowed; }
.enq-fine {
  margin-top: 14px;
  font-size: 11.5px; line-height: 1.5;
  color: var(--lp-text-muted);
}

/* ── done state ── */
.enq-done { text-align: center; padding: 48px 32px; }
.enq-done-mark {
  width: 64px; height: 64px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--lp-accent); color: var(--lp-accent-ink);
  font-size: 32px; font-weight: 800;
  margin-bottom: 18px;
}
.enq-done-h {
  font-size: 26px; font-weight: 800; letter-spacing: -0.01em;
  color: var(--lp-text-strong);
  margin: 0 0 12px;
}
.enq-done-p {
  font-size: 15px; color: var(--lp-text); line-height: 1.55;
  margin: 0 0 22px;
}
.enq-done-p b { color: var(--lp-text-strong); }
.enq-done-row { margin-top: 16px; }
.enq-done-link {
  font-size: 13px; letter-spacing: 0.06em; font-weight: 700;
  color: var(--lp-text-strong);
}
.enq-done-link:hover { text-decoration: underline; }

/* ── footer (mirrors catalog/PDP) ── */
.enq-foot {
  border-top: 1px solid var(--lp-border);
  background: var(--lp-bg-deepest);
}
.enq-foot-inner {
  max-width: 1240px; margin: 0 auto;
  padding: 28px 28px 32px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 24px; flex-wrap: wrap;
}
.enq-foot-logo { height: 96px; }
.enq-foot-links {
  display: flex; gap: 26px; flex-wrap: wrap;
}
.enq-foot-links a {
  font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
  font-weight: 700; color: var(--lp-text-dim);
  transition: color 0.15s;
}
.enq-foot-links a:hover { color: var(--lp-text-strong); }

@media (max-width: 900px) {
  .enq-wrap {
    grid-template-columns: 1fr;
    gap: 36px;
    padding: 36px 20px 60px;
  }
  .enq-h { font-size: 32px; }
  .enq-row { grid-template-columns: 1fr; gap: 0; }
  .enq-card { padding: 22px; border-radius: 16px; }
  /* 3-col grid: [burger] [centred logo] [phantom right gap] */
  .enq-nav-inner {
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    gap: 8px;
    padding: 10px 14px;
    align-items: center;
  }
  .enq-burger { display: inline-flex; grid-column: 1; justify-self: start; }
  .enq-brand  { grid-column: 2; justify-self: center; }
  .enq-nav-links { display: none; }
  .enq-nav-right { display: none; }
  .enq-brand-logo { height: 52px; }
  .enq-foot-logo { height: 64px; }
}
`;
