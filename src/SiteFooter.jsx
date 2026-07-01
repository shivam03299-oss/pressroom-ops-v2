import React from "react";

// Shared site footer — mirrors the public landing footer, but fully
// self-contained (its own scoped styles + theme-aware vars keyed off the
// <html data-theme> attribute) so it drops cleanly into the client portal
// and the admin dashboard without depending on their CSS scopes.
export default function SiteFooter({ theme }) {
  const t =
    theme ||
    (typeof document !== "undefined" ? document.documentElement.dataset.theme : "dark") ||
    "dark";
  const logo = t === "light" ? "/aviva-wordmark-black.png" : "/aviva-wordmark-white.png";
  const year = new Date().getFullYear();

  return (
    <footer className="site-foot">
      <style>{SITE_FOOT_CSS}</style>
      <div className="site-foot-inner">
        <div>
          <div className="site-foot-brand">
            <img src={logo} alt="Aviva International" width="200" height="66" />
          </div>
          <div className="site-foot-meta">
            Print on demand for brands that mean business.<br />
            Shipping pan-India.
          </div>
        </div>
        <div className="site-foot-cols">
          <div>
            <div className="site-foot-h">Explore</div>
            <a href="/">Home</a>
            <a href="/catalog">Catalogue</a>
            <a href="/dtf">DTF printing</a>
            <a href="/embroidery">Embroidery</a>
            <a href="/bulk-orders">Bulk orders</a>
          </div>
          <div>
            <div className="site-foot-h">Company</div>
            <a href="/process">Process</a>
            <a href="/why">Why us</a>
            <a href="/compare">Compare</a>
            <a href="/contact-us">Contact us</a>
            <a href="/enquire">Enquire</a>
          </div>
          <div>
            <div className="site-foot-h">Reach us</div>
            <a href="https://wa.me/919217765507" target="_blank" rel="noopener noreferrer">WhatsApp · +91 92177 65507</a>
            <a href="mailto:avivainternational05@gmail.com">avivainternational05@gmail.com</a>
            <a href="/terms">Terms &amp; Conditions</a>
            <a href="/privacy">Privacy Policy</a>
          </div>
        </div>
      </div>
      <div className="site-foot-bar">
        <span>© {year} AVIVA INTERNATIONAL</span>
        <span>Print on demand · Shipping pan-India</span>
      </div>
    </footer>
  );
}

const SITE_FOOT_CSS = `
.site-foot {
  --sf-bg: #0b0b0b; --sf-border: #262626; --sf-text: #ffffff;
  --sf-dim: #9a9a9a; --sf-muted: #6f6f6f; --sf-accent: #efefef;
  background: var(--sf-bg); border-top: 1px solid var(--sf-border);
  padding: 46px 0 0; margin-top: 40px;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
:root[data-theme="light"] .site-foot {
  --sf-bg: #f3f3f3; --sf-border: #dcdcdc; --sf-text: #0a0a0a;
  --sf-dim: #555555; --sf-muted: #8a8a8a; --sf-accent: #0a0a0a;
}
.site-foot-inner {
  max-width: 1200px; margin: 0 auto; padding: 0 24px 30px;
  display: grid; grid-template-columns: 1.2fr 2.4fr; gap: 40px;
  border-bottom: 1px solid var(--sf-border);
}
.site-foot-brand img { height: 38px; width: auto; display: block; }
.site-foot-meta { font-size: 12.5px; color: var(--sf-dim); line-height: 1.7; margin-top: 12px; }
.site-foot-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
.site-foot-h {
  font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--sf-accent); font-weight: 800; margin-bottom: 12px; opacity: 0.85;
}
.site-foot-cols a {
  display: block; font-size: 12.5px; color: var(--sf-dim);
  padding: 4px 0; text-decoration: none; transition: color 0.15s;
}
.site-foot-cols a:hover { color: var(--sf-text); }
.site-foot-bar {
  max-width: 1100px; margin: 0 auto; padding: 18px 24px;
  font-size: 11.5px; color: var(--sf-muted);
  display: flex; justify-content: space-between; gap: 14px; flex-wrap: wrap;
}
@media (max-width: 680px) {
  .site-foot-inner { grid-template-columns: 1fr; gap: 26px; padding: 0 18px 26px; }
  .site-foot-bar { padding: 18px; }
}
@media (max-width: 480px) { .site-foot-cols { grid-template-columns: 1fr 1fr; } }
`;
