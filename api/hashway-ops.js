// Single-function dispatcher for /api/hashway-ops-* endpoints.
//
// Vercel Hobby caps at 12 Serverless Functions. Each previously-
// standalone endpoint is now an underscore-prefixed module
// (_hashway-ops-*.js) — Vercel ignores those, and this file imports
// and dispatches to them based on ?endpoint= in the URL.
//
// Front-end keeps calling /api/hashway-ops-<name> — vercel.json
// rewrites those URLs to /api/hashway-ops?endpoint=<name>.

import agents          from "./_hashway-ops-agents.js";
import tasks           from "./_hashway-ops-tasks.js";
import execute         from "./_hashway-ops-execute.js";
import runAgent        from "./_hashway-ops-run-agent.js";
import dailyBrief      from "./_hashway-ops-daily-brief.js";
import testConnection  from "./_hashway-ops-test-connection.js";
import renderImage     from "./_hashway-ops-render-image.js";

const ROUTES = {
  "agents":          agents,
  "tasks":           tasks,
  "execute":         execute,
  "run-agent":       runAgent,
  "daily-brief":     dailyBrief,
  "test-connection": testConnection,
  "render-image":    renderImage,
};

export default async function handler(req, res) {
  // Endpoint comes from the rewrite query string, OR (fallback) from
  // a path suffix if invoked directly.
  let endpoint = (req.query?.endpoint || "").toString();
  if (!endpoint) {
    // e.g. /api/hashway-ops-tasks → derive "tasks" from URL
    const m = (req.url || "").match(/\/api\/hashway-ops-([\w-]+)(?:[?#]|$)/);
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
