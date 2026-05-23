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
//   /api/shopify?action=connect      -> _shopify-connect.js
//   /api/shopify?action=disconnect   -> _shopify-disconnect.js
//   /api/shopify?action=status       -> _shopify-status.js
//   /api/shopify?action=sync         -> _shopify-sync.js
//
// Legacy aliases (handled by vercel.json rewrites, no frontend change):
//   /api/shopify-connect             -> /api/shopify?action=connect
//   …same for the other three.

import connect from "./_shopify-connect.js";
import disconnect from "./_shopify-disconnect.js";
import status from "./_shopify-status.js";
import sync from "./_shopify-sync.js";

const HANDLERS = { connect, disconnect, status, sync };

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
