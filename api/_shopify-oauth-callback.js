// Vercel serverless function — finalises the Shopify OAuth handshake.
//
// Shopify redirects the merchant here after they approve our app. We:
//   1. Verify the hmac on the query string (proves Shopify sent this)
//   2. Verify the state nonce matches what _shopify-oauth-install stashed
//   3. POST code→access_token at /admin/oauth/access_token
//   4. Save the permanent shpat_ token onto the tenant
//   5. Backfill the last 200 orders so the dashboard isn't empty
//   6. Redirect the merchant back to /portal with a success flag
//
// GET /api/shopify-oauth-callback?code=...&shop=...&state=...&hmac=...&timestamp=...

import { createHmac, timingSafeEqual } from "crypto";

const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

const SHOPIFY_API_VERSION = "2024-01";
const SHOPIFY_API_KEY    = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const PORTAL_RETURN_URL =
  process.env.SHOPIFY_OAUTH_PORTAL_RETURN_URL ||
  "https://avivainternational.co/portal?shopify_connected=1";

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

// Per Shopify OAuth docs: sort all query params except `hmac` and the
// legacy `signature`, join them as key=value&key=value using the raw
// (already URL-encoded) values from the request line, HMAC-SHA256 with
// the app's client secret, hex-encode, then constant-time compare to the
// hmac param.
function verifyShopifyHmac(req, secret) {
  const rawQuery = (req.url || "").split("?")[1] || "";
  const pairs = rawQuery.split("&").filter(Boolean);
  let providedHmac = "";
  const rest = [];
  for (const p of pairs) {
    if (p.startsWith("hmac=")) providedHmac = p.slice("hmac=".length);
    else if (p.startsWith("signature=")) continue;
    else rest.push(p);
  }
  if (!providedHmac) return false;
  rest.sort();
  const msg = rest.join("&");
  const computed = createHmac("sha256", secret).update(msg).digest("hex");
  if (computed.length !== providedHmac.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(computed, "utf8"),
      Buffer.from(providedHmac, "utf8"),
    );
  } catch {
    return false;
  }
}

function isValidShopDomain(shop) {
  return typeof shop === "string" && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}

function customerName(o) {
  if (!o.customer) return null;
  const a = (o.customer.first_name || "").trim();
  const b = (o.customer.last_name  || "").trim();
  return [a, b].filter(Boolean).join(" ") || null;
}

function toRow(tenantId, o) {
  return {
    id: `${tenantId}-${o.id}`,
    tenant_id: tenantId,
    shopify_order_id: String(o.id),
    shopify_order_number: o.order_number != null ? String(o.order_number) : null,
    shopify_order_name: o.name,
    customer_name:  customerName(o),
    customer_email: o.email || o.customer?.email || null,
    customer_phone: o.phone || o.customer?.phone || o.shipping_address?.phone || null,
    shipping_address: o.shipping_address || null,
    line_items: o.line_items || [],
    total_price: Number(o.total_price) || 0,
    currency: o.currency || "INR",
    financial_status: o.financial_status || null,
    fulfillment_status: o.fulfillment_status || null,
    shopify_tags: o.tags || null,
    shopify_note: o.note || null,
    shopify_created_at: o.created_at || null,
    synced_at: new Date().toISOString(),
  };
}

async function backfillRecentOrders(tenantId, domain, accessToken, cap = 200) {
  const out = [];
  let url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=250&order=created_at+desc`;
  while (url && out.length < cap) {
    const r = await fetch(url, { headers: { "X-Shopify-Access-Token": accessToken } });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`Shopify ${r.status}: ${t.slice(0, 180)}`);
    }
    const body = await r.json();
    out.push(...(body.orders || []));
    const link = r.headers.get("link") || r.headers.get("Link") || "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  const trimmed = out.slice(0, cap);
  if (trimmed.length === 0) return { fetched: 0, inserted: 0, updated: 0 };

  const rows = trimmed.map(o => toRow(tenantId, o));
  const ids = rows.map(r => `"${r.shopify_order_id}"`).join(",");
  const existing = await sb(
    `shopify_orders?tenant_id=eq.${encodeURIComponent(tenantId)}&shopify_order_id=in.(${ids})&select=shopify_order_id`,
    { prefer: "" },
  );
  const existingIds = new Set((existing || []).map(e => e.shopify_order_id));

  const toInsert = rows
    .filter(r => !existingIds.has(r.shopify_order_id))
    .map(r => ({ ...r, pod_status: "new" }));
  const toUpdate = rows.filter(r => existingIds.has(r.shopify_order_id));

  if (toInsert.length) {
    await sb("shopify_orders", {
      method: "POST",
      body: JSON.stringify(toInsert),
      prefer: "return=minimal",
    });
  }
  for (const r of toUpdate) {
    const { pod_status, ...rest } = r;
    await sb(`shopify_orders?id=eq.${encodeURIComponent(r.id)}`, {
      method: "PATCH",
      body: JSON.stringify(rest),
      prefer: "return=minimal",
    });
  }
  return { fetched: rows.length, inserted: toInsert.length, updated: toUpdate.length };
}

// Tiny HTML reply for error/success states. Inline so we don't need a
// template engine — this page is shown once per install and styled like
// the rest of the site.
function htmlPage({ title, heading, body, link, linkLabel }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;background:#0a0f1a;color:#e7ecf3;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
       min-height:100vh;display:grid;place-items:center;padding:24px}
  .card{max-width:480px;background:#121826;border:1px solid #243049;border-radius:14px;padding:28px}
  h1{margin:0 0 10px;font-size:20px}
  p{color:#a0aec0;margin:0 0 18px}
  a{display:inline-block;background:#5b6cff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600}
</style></head><body>
<div class="card">
  <h1>${heading}</h1>
  <p>${body}</p>
  ${link ? `<a href="${link}">${linkLabel || "Continue"}</a>` : ""}
</div></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(500).send(htmlPage({
        title: "Shopify connection failed",
        heading: "Aviva isn't configured for Shopify yet",
        body: "The Aviva team needs to set SHOPIFY_API_KEY and SHOPIFY_API_SECRET in Vercel before this flow works. Please ping support.",
      }));
    }

    const { shop, code, state } = req.query || {};

    // 1) Verify the hmac before we trust ANY other param.
    if (!verifyShopifyHmac(req, SHOPIFY_API_SECRET)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(401).send(htmlPage({
        title: "Shopify connection failed",
        heading: "We couldn't verify Shopify's signature",
        body: "This usually means the install link was tampered with, or the SHOPIFY_API_SECRET on Vercel doesn't match the one in Shopify Partners.",
      }));
    }

    if (!isValidShopDomain(shop) || !code || !state) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(400).send(htmlPage({
        title: "Shopify connection failed",
        heading: "Missing OAuth parameters",
        body: "Shop, code, or state was missing from the callback. Try the install link again from your client portal.",
      }));
    }

    // 2) Look up the tenant by the state nonce — proves the install was
    //    initiated by an authenticated user on our side (CSRF).
    const tenantRows = await sb(
      `tenants?shopify_install_state=eq.${encodeURIComponent(state)}&select=id,name,slug,shopify_domain,shopify_install_state_expires_at`,
    );
    const tenant = tenantRows?.[0];
    if (!tenant) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(401).send(htmlPage({
        title: "Shopify connection failed",
        heading: "We didn't recognise this install",
        body: "Either the install was started from someone else's browser, or the link expired. Start over from your portal's Stores page.",
      }));
    }
    if (tenant.shopify_install_state_expires_at && new Date(tenant.shopify_install_state_expires_at) < new Date()) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(401).send(htmlPage({
        title: "Shopify connection failed",
        heading: "The install link expired",
        body: "Install links are good for 10 minutes. Go back to your portal and click Connect Shopify again.",
      }));
    }
    if (tenant.shopify_domain && tenant.shopify_domain !== shop) {
      // The merchant returned approving a different store than they
      // started installing on. Suspicious — refuse.
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(401).send(htmlPage({
        title: "Shopify connection failed",
        heading: "Shop mismatch",
        body: `You started installing for ${tenant.shopify_domain} but returned approving ${shop}. Start over.`,
      }));
    }

    // 3) Exchange the temporary code for a permanent Admin API access token.
    const tokRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    });
    if (!tokRes.ok) {
      const errText = await tokRes.text().catch(() => "");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(502).send(htmlPage({
        title: "Shopify connection failed",
        heading: "Shopify refused the token exchange",
        body: `Shopify returned ${tokRes.status}. ${errText.slice(0, 240)}`,
      }));
    }
    const tokJson = await tokRes.json();
    const accessToken = tokJson.access_token;
    const grantedScopes = tokJson.scope || null;
    if (!accessToken || !accessToken.startsWith("shpat_")) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(502).send(htmlPage({
        title: "Shopify connection failed",
        heading: "Shopify returned an unexpected token",
        body: "We received a response from Shopify but it didn't include a usable access token.",
      }));
    }

    // 4) Save the token, clear the in-flight state.
    await sb(`tenants?id=eq.${encodeURIComponent(tenant.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        shopify_domain: shop,
        shopify_access_token: accessToken,
        shopify_install_state: null,
        shopify_install_state_expires_at: null,
      }),
      prefer: "return=minimal",
    });

    // 5) Backfill recent orders. Failure here doesn't block the connect —
    //    the next sync tick or a manual sync will pick up what we missed.
    let backfill = { fetched: 0, inserted: 0, updated: 0 };
    try {
      backfill = await backfillRecentOrders(tenant.id, shop, accessToken, 200);
    } catch (e) {
      console.error("[shopify-oauth-callback] backfill failed (non-fatal)", e);
    }

    // 6) Redirect the merchant back into the portal. Append a few flags
    //    so the UI can show a "Connected · synced N orders" toast.
    const returnUrl = new URL(PORTAL_RETURN_URL);
    returnUrl.searchParams.set("shop", shop);
    returnUrl.searchParams.set("synced", String(backfill.fetched || 0));
    if (grantedScopes) returnUrl.searchParams.set("scopes", grantedScopes);
    res.setHeader("Location", returnUrl.toString());
    return res.status(302).end();
  } catch (e) {
    console.error("[shopify-oauth-callback]", e);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(htmlPage({
      title: "Shopify connection failed",
      heading: "Something broke while finishing the install",
      body: String(e.message || e).slice(0, 240),
    }));
  }
}
