// Vercel serverless function — kicks off Shopify OAuth for a client.
//
// Replaces the legacy "paste your shpat_ token" flow, which Shopify killed
// for new custom apps on 2026-01-01. Now any client connects via an
// Aviva-owned Public/Custom-distribution app registered in Shopify
// Partners. The merchant clicks "Connect Shopify" in the portal, we mint
// a state nonce, then redirect them to Shopify's authorize URL. After
// they approve, Shopify bounces them to /api/shopify-oauth-callback.
//
// POST /api/shopify-oauth-install      (also: ?action=oauth-install)
//   headers: Authorization: Bearer <supabase access token>
//   body:    { shop: "icdpg4-mp.myshopify.com" }
//   returns: { url }     // frontend does window.location.href = url

import { randomBytes } from "crypto";

const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

// Aviva's Shopify Partners app credentials. SET THESE IN VERCEL ENV.
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
// Comma-separated scopes. Defaults match what the dashboard actually reads.
const SHOPIFY_OAUTH_SCOPES =
  process.env.SHOPIFY_OAUTH_SCOPES ||
  "read_products,write_products,read_publications,write_publications,read_files,write_files,read_inventory,write_inventory,read_locations,read_orders,write_orders,read_draft_orders,write_draft_orders,read_fulfillments,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,read_assigned_fulfillment_orders,write_assigned_fulfillment_orders,read_returns,write_returns,read_customers";
// Where Shopify sends the merchant after they approve.
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

async function authedUser(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign-in required");
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) throw new Error("Session expired — sign in again");
  const user = await userRes.json();
  let rows = await sb(`profiles?id=eq.${user.id}&select=id,role,tenant_id,name`);
  let profile = rows?.[0];
  if (!profile) {
    const inserted = await sb("profiles", {
      method: "POST",
      body: JSON.stringify({
        id: user.id,
        name: user.user_metadata?.full_name || user.email || "Client",
        role: "client",
        tenant_id: null,
      }),
    });
    profile = (Array.isArray(inserted) ? inserted[0] : inserted) || {
      id: user.id, role: "client", tenant_id: null, name: user.email,
    };
  }
  return { user, profile };
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28) || "brand";
}

function cleanDomain(d) {
  return String(d || "").trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

// App-Store / direct install entry point.
//
// Shopify opens the app's App URL as a GET with ?shop=...&hmac=...&host=...
// the moment a merchant clicks Install (and the automated review checks this).
// There's no logged-in Aviva user yet, so we can't use the authed POST flow.
// Instead we find-or-provision a tenant for the shop, mint a state nonce, and
// 302 immediately to Shopify's OAuth authorize URL — satisfying the
// "immediately authenticates after install" requirement.
async function handleGetInstall(req, res) {
  const shop = cleanDomain((req.query && req.query.shop) || "");
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
    return res.status(400).send("Missing or invalid ?shop — expected your-store.myshopify.com");
  }
  if (!SHOPIFY_API_KEY) return res.status(500).send("Shopify app not configured.");

  // Reuse an existing tenant for this shop, else provision one so the
  // callback has somewhere to stash the token.
  let tenantId;
  const existing = await sb(
    `tenants?shopify_domain=eq.${encodeURIComponent(shop)}&select=id,shopify_access_token`,
  ).catch(() => null);
  if (existing && existing[0]) {
    tenantId = existing[0].id;
    // Already connected → send straight to the app UI (no need to re-auth).
    if (existing[0].shopify_access_token) {
      res.writeHead(302, { Location: "https://avivainternational.co/portal?shopify_connected=1" });
      return res.end();
    }
  } else {
    const sub = shop.replace(/\.myshopify\.com$/, "");
    let candidate = `t-${slugify(sub)}`;
    let inserted = null, attempt = 0;
    while (attempt < 5 && !inserted) {
      try {
        inserted = await sb("tenants", {
          method: "POST",
          body: JSON.stringify({ id: candidate, name: sub, slug: candidate.slice(2) }),
        });
      } catch {
        attempt += 1;
        candidate = `t-${slugify(sub)}-${Math.random().toString(36).slice(2, 5)}`;
      }
    }
    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    tenantId = row && row.id;
    if (!tenantId) return res.status(500).send("Could not provision store.");
  }

  const state = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await sb(`tenants?id=eq.${encodeURIComponent(tenantId)}`, {
    method: "PATCH",
    prefer: "return=minimal",
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
  res.writeHead(302, { Location: url });
  return res.end();
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    try { return await handleGetInstall(req, res); }
    catch (e) { console.error("[shopify-oauth-install GET]", e); return res.status(500).send("Install error"); }
  }
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    if (!SHOPIFY_API_KEY) {
      return res.status(500).json({
        error: "SHOPIFY_API_KEY not configured. Create the Aviva app in Shopify Partners and set SHOPIFY_API_KEY + SHOPIFY_API_SECRET in Vercel env.",
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const shop = cleanDomain(body.shop);
    if (!shop) return res.status(400).json({ error: "shop is required" });
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      return res.status(400).json({
        error: "Use your store's .myshopify.com URL (e.g. icdpg4-mp.myshopify.com).",
      });
    }

    const { user, profile } = await authedUser(req);

    // Ensure a tenant row exists — same logic as the legacy connect path,
    // because OAuth needs a place to stash the state nonce.
    let tenantId = profile.tenant_id;
    if (!tenantId) {
      const brandName = user.user_metadata?.brand_name || profile.name || "Brand";
      const slug = slugify(brandName);
      let candidate = `t-${slug}`;
      let attempt = 0;
      let inserted = null;
      while (attempt < 5 && !inserted) {
        try {
          inserted = await sb("tenants", {
            method: "POST",
            body: JSON.stringify({
              id: candidate,
              name: brandName,
              slug: candidate.slice(2),
            }),
          });
        } catch {
          attempt += 1;
          candidate = `t-${slug}-${Math.random().toString(36).slice(2, 5)}`;
        }
      }
      const tenantRow = Array.isArray(inserted) ? inserted[0] : inserted;
      if (!tenantRow) throw new Error("Couldn't create your brand. Try again.");
      tenantId = tenantRow.id;
      await sb(`profiles?id=eq.${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tenant_id: tenantId }),
      });
    }

    // Mint a 32-byte CSRF state nonce. 10-minute expiry so a stale install
    // link can't be hijacked.
    const state = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await sb(`tenants?id=eq.${encodeURIComponent(tenantId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        shopify_install_state: state,
        shopify_install_state_expires_at: expiresAt,
        // Pre-stash the shop so the callback can sanity-check that the
        // merchant who returns is installing the shop they started with.
        shopify_domain: shop,
      }),
      prefer: "return=minimal",
    });

    // Build the Shopify authorize URL. Per docs:
    //   https://{shop}/admin/oauth/authorize?
    //     client_id={api_key}
    //     &scope={comma-separated scopes}
    //     &redirect_uri={our callback}
    //     &state={nonce}
    //     &grant_options[]=  (omit for offline/permanent tokens)
    const url =
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${encodeURIComponent(SHOPIFY_API_KEY)}` +
      `&scope=${encodeURIComponent(SHOPIFY_OAUTH_SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URL)}` +
      `&state=${encodeURIComponent(state)}`;

    return res.status(200).json({ url, tenant_id: tenantId, shop });
  } catch (e) {
    console.error("[shopify-oauth-install]", e);
    return res.status(400).json({ error: e.message || String(e) });
  }
}
