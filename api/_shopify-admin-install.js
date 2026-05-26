// Admin-side Shopify install link generator.
//
// The merchant-self path (/api/shopify?action=oauth-install) requires
// the client to be logged into /portal. That's friction during
// onboarding — Aviva wants to send each new client a one-tap install
// link via WhatsApp/email.
//
// This endpoint lets an admin (profile.role === 'admin') mint that
// link for any tenant + .myshopify.com domain, without involving the
// merchant at all until they click the link.
//
// POST /api/shopify?action=admin-install
//   headers: Authorization: Bearer <supabase access token>  (admin only)
//   body:    { tenant_id, shop }
//   returns: { url, expires_at, shop, tenant_id }

import { randomBytes } from "crypto";

const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_OAUTH_SCOPES =
  process.env.SHOPIFY_OAUTH_SCOPES ||
  "read_orders,read_customers,read_products,read_fulfillments";
const OAUTH_REDIRECT_URL =
  process.env.SHOPIFY_OAUTH_REDIRECT_URL ||
  "https://avivainternational.co/api/shopify-oauth-callback";

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function authedAdmin(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign-in required");
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) throw new Error("Session expired — sign in again");
  const user = await userRes.json();
  const rows = await sb(`profiles?id=eq.${user.id}&select=id,role,name`);
  const profile = rows?.[0];
  if (!profile || profile.role !== "admin") throw new Error("admin only");
  return { user, profile };
}

function cleanDomain(d) {
  return String(d || "").trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    await authedAdmin(req);

    if (!SHOPIFY_API_KEY) {
      return res.status(500).json({
        error: "SHOPIFY_API_KEY not set in Vercel env. See SHOPIFY_PARTNER_SETUP.md.",
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const tenant_id = String(body.tenant_id || "").trim();
    const shop      = cleanDomain(body.shop);
    if (!tenant_id) return res.status(400).json({ error: "tenant_id is required" });
    if (!shop)      return res.status(400).json({ error: "shop is required" });
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      return res.status(400).json({
        error: "Use the .myshopify.com URL (e.g. balleti-clothing.myshopify.com).",
      });
    }

    // Verify tenant exists
    const tenants = await sb(`tenants?id=eq.${encodeURIComponent(tenant_id)}&select=id,name,shopify_domain,shopify_access_token`);
    const tenant = tenants?.[0];
    if (!tenant) return res.status(404).json({ error: "tenant not found" });

    // Generate state nonce (10-min expiry)
    const state = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await sb(`tenants?id=eq.${encodeURIComponent(tenant_id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        shopify_install_state: state,
        shopify_install_state_expires_at: expiresAt,
        shopify_domain: shop,
      }),
    });

    const url =
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${encodeURIComponent(SHOPIFY_API_KEY)}` +
      `&scope=${encodeURIComponent(SHOPIFY_OAUTH_SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URL)}` +
      `&state=${encodeURIComponent(state)}`;

    return res.status(200).json({
      url, expires_at: expiresAt, shop, tenant_id, tenant_name: tenant.name,
    });
  } catch (e) {
    console.error("[shopify-admin-install]", e);
    const status = /admin only|missing bearer|invalid token|sign-in required/i.test(e.message || "") ? 401 : 400;
    return res.status(status).json({ error: e.message || String(e) });
  }
}
