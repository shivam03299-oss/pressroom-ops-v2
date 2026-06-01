// Unified dispatcher for Velocity Shipping endpoints (live AWB tracking
// for tenants on Velocity, currently only Balleti).
//
// Route map:
//   /api/velocity?action=track  -> _velocity-track.js
//
// Legacy alias via vercel.json rewrite (no frontend change required):
//   /api/velocity-track         -> /api/velocity?action=track

import track from "./_velocity-track.js";

const HANDLERS = { track };

export default async function handler(req, res) {
  const action =
    (req.query && req.query.action) ||
    (req.body && req.body.action) ||
    "";
  const fn = HANDLERS[String(action).toLowerCase()];
  if (!fn) {
    return res.status(400).json({
      error: `unknown velocity action: ${action || "(none)"}`,
      valid: Object.keys(HANDLERS),
    });
  }
  return fn(req, res);
}
