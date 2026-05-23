// Vercel serverless function — connects a client's Shopify store to
// their Aviva tenant.
//
// Flow:
//   1. Authenticate the caller via their Supabase access token
//   2. Validate the admin API token by hitting Shopify's /shop.json
//   3. If the caller doesn't have a tenant yet, mint one (id derived
//      from their brand_name + a short suffix; profile.tenant_id set)
//   4. Save shopify_domain + shopify_access_token onto the tenant
//
// POST /api/shopify-connect
//   headers: Authorization: Bearer <supabase access token>
//   body:    { domain: "yourstore.myshopify.com", accessToken: "shpat_..." }
//   returns: { ok, shop: {name,domain,currency,country,plan}, tenant: {id,name,slug} }

const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

const SHOPIFY_API_VERSION = "2024-01";

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
    // First connect by a fresh signup whose profile didn't exist — auto-create.
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

async function shopifyShopInfo(domain, accessToken) {
  const r = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  if (r.status === 401 || r.status === 403) {
    throw new Error("Shopify rejected the access token. Make sure you copied the Admin API access token (starts with shpat_) and not the API secret.");
  }
  if (r.status === 404) {
    throw new Error("Couldn't reach that .myshopify.com domain. Double-check the spelling.");
  }
  if (!r.ok) throw new Error(`Shopify error (${r.status}). Try again or contact support.`);
  const body = await r.json();
  return body.shop;
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

// Pull up to `cap` most-recent orders (default 200) and upsert into
// shopify_orders. Called on first connect so the client sees their
// history immediately instead of waiting for the next sync tick.
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

  // Split insert vs update so pod_status survives subsequent syncs.
  const ids = rows.map(r => `"${r.shopify_order_id}"`).join(",");
  const existing = await sb(
    `shopify_orders?tenant_id=eq.${encodeURIComponent(tenantId)}&shopify_order_id=in.(${ids})&select=shopify_order_id`,
    { prefer: "" }
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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { domain: rawDomain, accessToken } = req.body || {};
    if (!rawDomain || !accessToken) return res.status(400).json({ error: "Both store domain and access token are required" });

    const domain = cleanDomain(rawDomain);
    if (!/\.myshopify\.com$/.test(domain)) {
      return res.status(400).json({ error: "Use your store's .myshopify.com URL (e.g. hashway.myshopify.com)" });
    }
    if (!/^shpat_[a-f0-9]+$/i.test(accessToken.trim())) {
      return res.status(400).json({ error: "Access token should start with 'shpat_'. Copy it from your Shopify Custom App's Admin API access token." });
    }

    const { user, profile } = await authedUser(req);

    // Validate the creds before we save anything.
    const shop = await shopifyShopInfo(domain, accessToken.trim());

    // Ensure a tenant exists.
    let tenantId = profile.tenant_id;
    let tenantRow;
    if (!tenantId) {
      const brandName = user.user_metadata?.brand_name || profile.name || "Brand";
      const slug = slugify(brandName);
      // Try a unique id; if collision, suffix with random.
      let candidate = `t-${slug}`;
      let attempt = 0;
      while (attempt < 5) {
        try {
          const inserted = await sb("tenants", {
            method: "POST",
            body: JSON.stringify({
              id: candidate,
              name: brandName,
              slug: candidate.slice(2),     // drop the "t-" prefix
              shopify_domain: domain,
              shopify_access_token: accessToken.trim(),
            }),
          });
          tenantRow = Array.isArray(inserted) ? inserted[0] : inserted;
          break;
        } catch (e) {
          // collision on PK → suffix and retry
          attempt += 1;
          candidate = `t-${slug}-${Math.random().toString(36).slice(2, 5)}`;
        }
      }
      if (!tenantRow) throw new Error("Couldn't create your brand. Try again, or WhatsApp support.");
      tenantId = tenantRow.id;
      await sb(`profiles?id=eq.${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tenant_id: tenantId }),
      });
    } else {
      const updated = await sb(`tenants?id=eq.${encodeURIComponent(tenantId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          shopify_domain: domain,
          shopify_access_token: accessToken.trim(),
        }),
      });
      tenantRow = Array.isArray(updated) ? updated[0] : updated;
    }

    // Backfill the last 200 orders so the client has history right away.
    // Failures here shouldn't block the connect — they'll just retry on
    // the next /api/shopify-sync tick. Log but keep going.
    let backfill = { fetched: 0, inserted: 0, updated: 0 };
    try {
      backfill = await backfillRecentOrders(tenantId, domain, accessToken.trim(), 200);
    } catch (backfillErr) {
      console.error("[shopify-connect] backfill failed (non-fatal)", backfillErr);
    }

    return res.status(200).json({
      ok: true,
      shop: {
        name: shop.name,
        domain: shop.myshopify_domain || domain,
        currency: shop.currency,
        country: shop.country_name,
        plan: shop.plan_display_name,
      },
      tenant: { id: tenantRow.id, name: tenantRow.name, slug: tenantRow.slug },
      backfill,                                        // { fetched, inserted, updated }
    });
  } catch (e) {
    console.error("[shopify-connect]", e);
    return res.status(400).json({ error: e.message || String(e) });
  }
}
