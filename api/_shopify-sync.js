// Vercel serverless function — pulls orders from a tenant's
// connected Shopify store and upserts them into shopify_orders.
//
// Called manually by the "Sync now" button, and on an interval by the
// portal Orders page while it's open. Production-grade real-time would
// be Shopify webhooks → /api/shopify-webhook → upsert, but polling +
// Supabase realtime subscription on shopify_orders gives ~10s latency
// without the webhook plumbing.
//
// POST /api/shopify-sync
//   headers: Authorization: Bearer <supabase access token>
//   body:    { tenantId? }  // optional — admins can sync any tenant
//   returns: { fetched, inserted, updated }

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
  if (!userRes.ok) throw new Error("Session expired");
  const user = await userRes.json();
  const rows = await sb(`profiles?id=eq.${user.id}&select=id,role,tenant_id,name`);
  const profile = rows?.[0];
  if (!profile) throw new Error("No profile linked to this account");
  return { user, profile };
}

function customerName(o) {
  if (!o.customer) return null;
  const a = (o.customer.first_name || "").trim();
  const b = (o.customer.last_name  || "").trim();
  return [a, b].filter(Boolean).join(" ") || null;
}

function toRow(tenantId, o) {
  return {
    id: `${tenantId}-${o.id}`,                          // composite, stable
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

async function fetchOrdersAll(domain, accessToken) {
  // Pull up to 500 most-recent orders (2 pages of 250). Enough for a
  // first-time sync; subsequent polls only carry the deltas via
  // updated_at_min, but for simplicity we re-pull each time.
  const out = [];
  let url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=250&order=updated_at+desc`;
  for (let page = 0; page < 2 && url; page++) {
    const r = await fetch(url, { headers: { "X-Shopify-Access-Token": accessToken } });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`Shopify ${r.status}: ${t.slice(0, 180)}`);
    }
    const body = await r.json();
    out.push(...(body.orders || []));
    // Shopify paginates via Link header — extract `rel="next"` if present.
    const link = r.headers.get("link") || r.headers.get("Link") || "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  return out;
}

// Pulls all products from the store. Stops at 500 (2 pages of 250) like
// orders — a typical client's catalog fits comfortably; the next sync
// tick picks up anything newer than updated_at.
async function fetchProductsAll(domain, accessToken) {
  const out = [];
  let url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`;
  for (let page = 0; page < 4 && url; page++) {
    const r = await fetch(url, { headers: { "X-Shopify-Access-Token": accessToken } });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`Shopify products ${r.status}: ${t.slice(0, 180)}`);
    }
    const body = await r.json();
    out.push(...(body.products || []));
    const link = r.headers.get("link") || r.headers.get("Link") || "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  return out;
}

function productToRow(tenantId, p) {
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const totalInv = variants.reduce(
    (s, v) => s + (Number.isFinite(Number(v.inventory_quantity)) ? Number(v.inventory_quantity) : 0),
    0,
  );
  const featured =
    p.image?.src
    || (Array.isArray(p.images) && p.images[0]?.src)
    || null;
  return {
    id: `${tenantId}-${p.id}`,
    tenant_id: tenantId,
    shopify_product_id: String(p.id),
    title:           p.title || null,
    handle:          p.handle || null,
    vendor:          p.vendor || null,
    product_type:    p.product_type || null,
    status:          p.status || null,
    tags:            p.tags || null,
    description_html: p.body_html || null,
    options:         p.options || null,
    variants:        p.variants || [],
    images:          p.images || [],
    image_url:       featured,
    total_inventory: totalInv,
    shopify_created_at: p.created_at || null,
    shopify_updated_at: p.updated_at || null,
    synced_at: new Date().toISOString(),
  };
}

// Upserts products for a tenant in the same insert/update split style we
// use for orders — keeps the request payloads small.
async function syncProductsForTenant(tenantId, domain, accessToken) {
  const products = await fetchProductsAll(domain, accessToken);
  const rows = products.map(p => productToRow(tenantId, p));
  if (rows.length === 0) return { fetched: 0, inserted: 0, updated: 0 };

  const ids = rows.map(r => `"${r.shopify_product_id}"`).join(",");
  const existing = await sb(
    `shopify_products?tenant_id=eq.${encodeURIComponent(tenantId)}&shopify_product_id=in.(${ids})&select=shopify_product_id`,
  );
  const existingIds = new Set((existing || []).map(e => e.shopify_product_id));
  const toInsert = rows.filter(r => !existingIds.has(r.shopify_product_id));
  const toUpdate = rows.filter(r =>  existingIds.has(r.shopify_product_id));

  if (toInsert.length) {
    await sb("shopify_products", {
      method: "POST",
      body: JSON.stringify(toInsert),
      prefer: "return=minimal",
    });
  }
  for (const r of toUpdate) {
    await sb(`shopify_products?id=eq.${encodeURIComponent(r.id)}`, {
      method: "PATCH",
      body: JSON.stringify(r),
      prefer: "return=minimal",
    });
  }
  return { fetched: rows.length, inserted: toInsert.length, updated: toUpdate.length };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { user, profile } = await authedUser(req);
    const tenantId = req.body?.tenantId || profile.tenant_id;
    if (!tenantId) return res.status(400).json({ error: "No store connected to this account yet" });
    if (profile.role !== "admin" && profile.tenant_id !== tenantId) {
      return res.status(403).json({ error: "Not allowed to sync this tenant" });
    }

    const tenants = await sb(`tenants?id=eq.${encodeURIComponent(tenantId)}&select=id,shopify_domain,shopify_access_token`);
    const tenant = tenants?.[0];
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    if (!tenant.shopify_domain || !tenant.shopify_access_token) {
      return res.status(400).json({ error: "Shopify isn't connected. Connect a store first." });
    }

    const orders = await fetchOrdersAll(tenant.shopify_domain, tenant.shopify_access_token);
    const rows = orders.map(o => toRow(tenant.id, o));
    if (rows.length === 0) return res.status(200).json({ fetched: 0, inserted: 0, updated: 0 });

    // Split into insert / update so we don't overwrite pod_status
    // (which the floor edits after the order lands).
    const ids = rows.map(r => `"${r.shopify_order_id}"`).join(",");
    const existing = await sb(`shopify_orders?tenant_id=eq.${encodeURIComponent(tenant.id)}&shopify_order_id=in.(${ids})&select=shopify_order_id`);
    const existingIds = new Set((existing || []).map(e => e.shopify_order_id));

    const toInsert = rows
      .filter(r => !existingIds.has(r.shopify_order_id))
      .map(r => ({ ...r, pod_status: "new" }));        // brand-new orders default to "new"
    const toUpdate = rows.filter(r => existingIds.has(r.shopify_order_id));

    if (toInsert.length) {
      await sb("shopify_orders", { method: "POST", body: JSON.stringify(toInsert) });
    }
    for (const r of toUpdate) {
      // Skip pod_status on update so floor edits survive.
      const { pod_status, ...rest } = r;
      await sb(`shopify_orders?id=eq.${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        body: JSON.stringify(rest),
      });
    }

    // Also pull products. Non-fatal — orders are the critical surface
    // for fulfilment; if Shopify is rate-limiting or scopes are
    // misconfigured for products, we still return the orders count.
    let products = { fetched: 0, inserted: 0, updated: 0, error: null };
    try {
      products = await syncProductsForTenant(tenant.id, tenant.shopify_domain, tenant.shopify_access_token);
    } catch (e) {
      console.error("[shopify-sync] product sync failed (non-fatal)", e);
      products.error = String(e.message || e).slice(0, 200);
    }

    return res.status(200).json({
      fetched: rows.length,
      inserted: toInsert.length,
      updated: toUpdate.length,
      products,
    });
  } catch (e) {
    console.error("[shopify-sync]", e);
    return res.status(400).json({ error: e.message || String(e) });
  }
}
