import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Landing from "./Landing.jsx";

// Routing is a single pathname gate — the dashboard SPA lives under /admin,
// everything else (currently just "/") gets the placeholder landing page.
// Vercel rewrites send /admin/* back to index.html so deep links and refreshes
// keep working without a router library.
const isAdmin = window.location.pathname.startsWith("/admin");
document.title = isAdmin ? "PRESSROOM.OPS" : "AVIVA INTERNATIONAL";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isAdmin ? <App /> : <Landing />}
  </React.StrictMode>
);
