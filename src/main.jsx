import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Landing from "./Landing.jsx";
import Portal from "./Portal.jsx";
import PublicCatalog from "./PublicCatalog.jsx";
import PublicPDP from "./PublicPDP.jsx";
import PublicEnquire from "./PublicEnquire.jsx";
import { applySeo, ROUTE_SEO, loadMetaPixel } from "./seo.js";

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
