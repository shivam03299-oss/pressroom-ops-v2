import React, { useEffect, useState } from "react";

// Shared public site header — the same menu as the homepage, dropped onto the
// catalogue, product and enquiry pages so navigation is consistent everywhere
// (dashboards excluded). Self-contained: its own scoped styles + the handful
// of CSS vars the public pages don't already define, so it renders correctly
// wherever it's used. Public pages are light-locked, so no theme toggle.
function WhatsAppGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.004c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01zM12.04 20.15h-.004a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.25 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01a.92.92 0 0 0-.67.31c-.23.25-.88.86-.88 2.1 0 1.23.9 2.42 1.03 2.59.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/>
    </svg>
  );
}

export default function SiteNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [menuOpen]);

  return (
    <div className="aviva-nav">
      <style>{NAV_CSS}</style>
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <button className="lp-burger" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <span /><span /><span />
          </button>
          <a href="/" className="lp-brand" aria-label="Aviva International home">
            <img className="lp-brand-logo" src="/aviva-wordmark-black.png" alt="Aviva International" width="180" height="60" />
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
            <a href="/fulfillment">Fulfilment</a>
            <a href="/bulk-orders">Bulk orders</a>
            <a href="/process">Process</a>
            <a href="/why">Why us</a>
            <a href="/compare">Compare</a>
          </nav>
          <div className="lp-nav-right">
            <a href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer" className="lp-nav-cta lp-nav-cta-wa" title="Chat with us on WhatsApp">
              <WhatsAppGlyph /> WhatsApp us
            </a>
            <a href="/enquire" className="lp-nav-cta lp-nav-cta-ghost" title="Send us a brief">Enquire</a>
            <a href="/portal" className="lp-nav-cta lp-nav-cta-ghost" title="For existing brand partners">Client login</a>
            <a href="/portal/signup" className="lp-nav-cta lp-nav-cta-filled" title="Onboard your brand">Get started →</a>
          </div>
        </div>
      </header>

      <div className={`lp-drawer-backdrop ${menuOpen ? "is-open" : ""}`} onClick={() => setMenuOpen(false)} aria-hidden={!menuOpen} />
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
          <a href="/fulfillment">Fulfilment</a>
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
    </div>
  );
}

// Nav styles — mirrors the homepage header. Vars the public pages don't
// already define (--lp-ink / --lp-accent-2 / --lp-shadow-sm) are set on the
// wrapper so they cascade to the header + fixed drawer.
const NAV_CSS = `
.aviva-nav { --lp-ink: #0b0e16; --lp-accent-2: #1c43d8; --lp-shadow-sm: 0 8px 24px rgba(13,22,60,0.10); }
.aviva-nav a { text-decoration: none; }
.lp-nav {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--lp-bg) 80%, transparent);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--lp-border);
}
.lp-nav-inner { max-width: 1440px; margin: 0 auto; padding: 12px 28px; display: flex; align-items: center; gap: 18px; }
.lp-brand { display: inline-flex; align-items: center; gap: 10px; color: var(--lp-ink); flex-shrink: 0; transition: transform 0.18s; }
.lp-brand:hover { transform: translateY(-1px); }
.lp-brand-logo { height: 40px; width: auto; display: block; object-fit: contain; }
.lp-links { display: flex; gap: 18px; margin-left: auto; }
.lp-links a { font-size: 13.5px; letter-spacing: 0.02em; color: var(--lp-text-dim); font-weight: 600; transition: color 0.15s; text-transform: uppercase; white-space: nowrap; }
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
.lp-nav-cta { font-size: 13px; letter-spacing: 0.02em; text-transform: uppercase; font-weight: 700; padding: 9px 13px; border-radius: 999px; transition: all 0.16s; white-space: nowrap; }
.lp-nav-cta-ghost { border: 1px solid var(--lp-border); color: var(--lp-ink); background: var(--lp-bg-elev); }
.lp-nav-cta-ghost:hover { border-color: var(--lp-accent); color: var(--lp-accent-2); }
a.lp-nav-cta-wa { display: inline-flex; align-items: center; gap: 7px; border: 1px solid rgba(37, 211, 102, 0.5); color: #1aa654; background: var(--lp-bg-elev); }
a.lp-nav-cta-wa:hover { background: #25d366; border-color: #25d366; color: #fff; transform: translateY(-1px); }
a.lp-nav-cta-filled { background: var(--lp-accent); color: var(--lp-accent-ink); border: 1px solid var(--lp-accent); box-shadow: 0 8px 20px var(--lp-accent-glow); }
a.lp-nav-cta-filled:hover { transform: translateY(-1px); box-shadow: 0 12px 28px var(--lp-accent-glow); background: var(--lp-accent-2); border-color: var(--lp-accent-2); }
.lp-burger { display: none; width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--lp-border); background: var(--lp-bg-elev); cursor: pointer; align-items: center; justify-content: center; flex-direction: column; gap: 4px; padding: 0; }
.lp-burger span { display: block; width: 18px; height: 2px; background: var(--lp-ink); border-radius: 2px; }
.lp-burger:hover { border-color: var(--lp-border-hover); }
.lp-drawer-backdrop { position: fixed; inset: 0; background: rgba(10, 18, 8, 0.45); opacity: 0; pointer-events: none; transition: opacity 0.22s; z-index: 90; backdrop-filter: blur(2px); }
.lp-drawer-backdrop.is-open { opacity: 1; pointer-events: auto; }
.lp-drawer { position: fixed; top: 0; left: 0; bottom: 0; width: min(86vw, 360px); background: var(--lp-bg); border-right: 1px solid var(--lp-border); transform: translateX(-102%); transition: transform 0.26s cubic-bezier(.4,0,.2,1); z-index: 100; display: flex; flex-direction: column; padding: 18px 22px 22px; box-shadow: 18px 0 60px rgba(0,0,0,0.18); }
.lp-drawer.is-open { transform: translateX(0); }
.lp-drawer-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: 1px solid var(--lp-border); }
.lp-drawer-eyebrow { font-size: 11px; letter-spacing: 0.16em; font-weight: 800; color: var(--lp-text-muted); }
.lp-drawer-close { width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--lp-border); background: var(--lp-bg-elev); color: var(--lp-ink); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.lp-drawer-close:hover { border-color: var(--lp-border-hover); }
.lp-drawer-links { display: flex; flex-direction: column; padding: 14px 0 6px; }
.lp-drawer-links a { font-size: 18px; font-weight: 700; color: var(--lp-ink); padding: 13px 0; border-bottom: 1px solid var(--lp-border); }
.lp-drawer-links a:hover { color: var(--lp-accent-2); }
.lp-drawer-foot { margin-top: auto; display: flex; flex-direction: column; gap: 10px; padding-top: 16px; }
a.lp-drawer-cta { display: block; background: var(--lp-accent); color: var(--lp-accent-ink); text-align: center; font-size: 14px; font-weight: 800; padding: 15px 18px; border-radius: 999px; box-shadow: 0 8px 22px var(--lp-accent-glow); }
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
`;
