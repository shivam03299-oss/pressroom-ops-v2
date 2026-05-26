// Single-function dispatcher for /api/hashway-wa-* endpoints.
// Same shape as hashway-ops.js — see that file for rationale.

import send    from "./_hashway-wa-send.js";
import webhook from "./_hashway-wa-webhook.js";

const ROUTES = {
  "send":    send,
  "webhook": webhook,
};

export default async function handler(req, res) {
  let endpoint = (req.query?.endpoint || "").toString();
  if (!endpoint) {
    const m = (req.url || "").match(/\/api\/hashway-wa-([\w-]+)(?:[?#]|$)/);
    if (m) endpoint = m[1];
  }
  const route = ROUTES[endpoint];
  if (!route) {
    return res.status(400).json({
      error: `unknown endpoint: ${endpoint || "(none)"}. Valid: ${Object.keys(ROUTES).join(", ")}`,
    });
  }
  return route(req, res);
}
