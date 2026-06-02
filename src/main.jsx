import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Landing from "./Landing.jsx";
import Portal from "./Portal.jsx";
import PublicCatalog from "./PublicCatalog.jsx";
import PublicPDP from "./PublicPDP.jsx";
import PublicEnquire from "./PublicEnquire.jsx";

// Routing is a single pathname gate — buckets:
//   /admin/*       → staff/admin dashboard SPA (App.jsx)
//   /portal/*      → client portal SPA (Portal.jsx) — catalog, designs, Shopify publish
//   /catalog       → public catalog index (PublicCatalog.jsx)
//   /catalog/<slug> → public PDP        (PublicPDP.jsx)
//   /enquire        → public enquiry form (PublicEnquire.jsx)
//   anything else  → public marketing landing (Landing.jsx)
// Vercel rewrites send each /admin/* /portal/* /catalog/* /enquire path
// back to index.html so deep links and refreshes keep working without a
// router lib.
const path = window.location.pathname;
const isAdmin       = path.startsWith("/admin");
const isPortal      = path.startsWith("/portal");
const isCatalogIdx  = path === "/catalog" || path === "/catalog/";
const isCatalogPDP  = path.startsWith("/catalog/") && !isCatalogIdx;
const isEnquire     = path === "/enquire" || path === "/enquire/";
const pdpSlug       = isCatalogPDP
  ? decodeURIComponent(path.slice("/catalog/".length).replace(/\/+$/, ""))
  : null;

document.title = isAdmin
  ? "AVIVA'S OPS ROOM"
  : isPortal
    ? "AVIVA · Client Portal"
    : (isCatalogIdx || isCatalogPDP)
      ? "AVIVA · Catalogue"
      : isEnquire
        ? "AVIVA · Enquire"
        : "AVIVA INTERNATIONAL";

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
          : <Landing />;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>{root}</React.StrictMode>
);
