import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Landing from "./Landing.jsx";
import Portal from "./Portal.jsx";
import PublicCatalog from "./PublicCatalog.jsx";
import PublicPDP from "./PublicPDP.jsx";
import PublicEnquire from "./PublicEnquire.jsx";
import { applySeo, ROUTE_SEO, loadMetaPixel } from "./seo.js";

// Stale-chunk recovery. This app ships as a PWA (vite-plugin-pwa,
// autoUpdate + skipWaiting + cleanupOutdatedCaches). When a new deploy
// lands while a tab is open, the incoming service worker activates and
// prunes the old precache, so the still-loaded page references hashed
// chunks that no longer exist on the server. The next lazy import (e.g.
// the html2pdf invoice builder — a rarely-loaded chunk) then throws
// "Failed to fetch dynamically imported module". Vite dispatches
// `vite:preloadError` for exactly this; reload once to pick up the fresh
// index + chunk names. Throttled to 10s so a genuinely-missing chunk
// can't spin into a reload loop.
window.addEventListener("vite:preloadError", (e) => {
  const last = Number(sessionStorage.getItem("chunkReloadedAt") || 0);
  if (Date.now() - last < 10000) return;
  sessionStorage.setItem("chunkReloadedAt", String(Date.now()));
  e.preventDefault?.();
  // A stuck service worker can keep serving the stale index (which points
  // at chunk hashes the server has since pruned), so a plain reload loops
  // on the same missing chunk. Purge the SW + caches first, then reload to
  // the live index. Best-effort — reload regardless.
  (async () => {
    try {
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch { /* best effort */ }
    window.location.reload();
  })();
});

// Routing is a single pathname gate — buckets:
//   /admin/*        → staff/admin dashboard SPA (App.jsx)
//   /portal/*       → client portal SPA (Portal.jsx) — catalog, designs, Shopify publish
//   /catalog        → public catalog index (PublicCatalog.jsx)
//   /catalog/<slug> → public PDP          (PublicPDP.jsx)
//   /enquire        → public enquiry form (PublicEnquire.jsx)
//   /bulk-orders    → Landing in focus="methods" mode
//   /process        → Landing in focus="process" mode
//   /why            → Landing in focus="why"     mode
//   /compare        → Landing in focus="compare" mode
//   anything else   → public marketing landing (Landing.jsx)
// Vercel rewrites send each non-/api/* path back to index.html so deep
// links and refreshes keep working without a router lib.
const path = window.location.pathname.replace(/\/+$/, "") || "/";
const isAdmin       = path.startsWith("/admin");
const isPortal      = path.startsWith("/portal");
const isCatalogIdx  = path === "/catalog";
const isCatalogPDP  = path.startsWith("/catalog/") && !isCatalogIdx;
const isEnquire     = path === "/enquire";
const pdpSlug       = isCatalogPDP
  ? decodeURIComponent(path.slice("/catalog/".length).replace(/\/+$/, ""))
  : null;

// Landing sub-routes: each one renders Landing.jsx with a specific
// `focus` so only the matching section shows.
const SUBPAGE_FOCUS = {
  "/bulk-orders": "methods",
  "/dtf":         "dtf",
  "/embroidery":  "embroidery",
  "/fulfillment": "fulfillment",
  "/fulfilment":  "fulfillment",
  "/process":     "process",
  "/why":         "why",
  "/compare":     "compare",
  "/terms":       "terms",
  "/privacy":     "privacy",
  "/contact-us":  "contactus",
};
const landingFocus = SUBPAGE_FOCUS[path] || null;

// Per-route SEO (title, description, canonical, OG/Twitter, robots). The
// admin + portal apps are private → noindex. The PDP sets its own product
// SEO once the product loads (PublicPDP); we set a catalogue default now so
// there's never a blank/stale tag mid-load.
// Meta Pixel loads on the public Aviva website only — never the admin
// dashboard or client portal (same index.html serves all three).
if (!isAdmin && !isPortal) loadMetaPixel("1491206408922536");

if (isAdmin) {
  applySeo({ title: "AVIVA'S OPS ROOM", path, noindex: true });
} else if (isPortal) {
  applySeo({ title: "Aviva · Client Portal", path, noindex: true });
} else if (isCatalogPDP) {
  applySeo({ ...ROUTE_SEO.catalog, path });
} else if (isCatalogIdx) {
  applySeo(ROUTE_SEO.catalog);
} else if (isEnquire) {
  applySeo(ROUTE_SEO.enquire);
} else if (landingFocus && ROUTE_SEO[landingFocus]) {
  applySeo(ROUTE_SEO[landingFocus]);
} else {
  applySeo(ROUTE_SEO.home);
}

const root = isAdmin
  ? <App />
  : isPortal
    ? <Portal />
    : isCatalogPDP
      ? <PublicPDP slug={pdpSlug} />
      : isCatalogIdx
        ? <PublicCatalog />
        : isEnquire
          ? <PublicEnquire />
          : <Landing focus={landingFocus} />;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>{root}</React.StrictMode>
);
