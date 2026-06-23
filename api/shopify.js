// Unified dispatcher for Shopify-related endpoints.
//
// We had four /api/shopify-{connect,disconnect,status,sync} files; Vercel
// Hobby caps deployments at 12 Serverless Functions, and pressroom-ops
// grew past that ceiling, blocking every prod deploy. This dispatcher
// keeps each handler file under an `_` prefix (private, not counted)
// and routes to them based on `?action=` (or the legacy path, via the
// rewrites in vercel.json).
//
// Route map:
//   /api/shopify?action=connect          -> _shopify-connect.js          (legacy shpat_ paste flow)
//   /api/shopify?action=disconnect       -> _shopify-disconnect.js
//   /api/shopify?action=status           -> _shopify-status.js
//   /api/shopify?action=sync             -> _shopify-sync.js
//   /api/shopify?action=oauth-install    -> _shopify-oauth-install.js    (new: starts OAuth)
//   /api/shopify?action=oauth-callback   -> _shopify-oauth-callback.js   (new: Shopify redirects here)
//
// Legacy aliases (handled by vercel.json rewrites, no frontend change):
//   /api/shopify-connect                 -> /api/shopify?action=connect
//   /api/shopify-oauth-install           -> /api/shopify?action=oauth-install
//   /api/shopify-oauth-callback          -> /api/shopify?action=oauth-callback

import connect from "./_shopify-connect.js";
import disconnect from "./_shopify-disconnect.js";
import status from "./_shopify-status.js";
import sync from "./_shopify-sync.js";
import oauthInstall from "./_shopify-oauth-install.js";
import oauthCallback from "./_shopify-oauth-callback.js";
import adminInstall from "./_shopify-admin-install.js";
import autosync from "./_shopify-autosync.js";
import hashwayOrders from "./_hashway-orders.js";

const HANDLERS = {
  connect,
  disconnect,
  status,
  sync,
  "oauth-install": oauthInstall,
  "oauth-callback": oauthCallback,
  "admin-install": adminInstall,
  // Folded in to stay under Vercel Hobby's 12-function cap (see vercel.json
  // rewrites that keep the original /api/shopify-autosync + /api/hashway-orders paths).
  autosync,
  "hashway-orders": hashwayOrders,
};

export default async function handler(req, res) {
  const action =
    (req.query && req.query.action) ||
    (req.body && req.body.action) ||
    "";
  const fn = HANDLERS[String(action).toLowerCase()];
  if (!fn) {
    return res.status(400).json({
      error: `unknown shopify action: ${action || "(none)"}`,
      valid: Object.keys(HANDLERS),
    });
  }
  return fn(req, res);
}
