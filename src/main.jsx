import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Landing from "./Landing.jsx";
import Portal from "./Portal.jsx";

// Routing is a single pathname gate — three buckets:
//   /admin/*   → staff/admin dashboard SPA (App.jsx)
//   /portal/*  → client portal SPA (Portal.jsx) — catalog, designs, Shopify publish
//   anything else → public marketing landing (Landing.jsx)
// Vercel rewrites send /admin/* and /portal/* back to index.html so deep
// links and refreshes keep working without a router library.
const path = window.location.pathname;
const isAdmin  = path.startsWith("/admin");
const isPortal = path.startsWith("/portal");

document.title = isAdmin
  ? "PRESSROOM.OPS"
  : isPortal
    ? "AVIVA · Client Portal"
    : "AVIVA INTERNATIONAL";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isAdmin ? <App /> : isPortal ? <Portal /> : <Landing />}
  </React.StrictMode>
);
