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
    });
  } catch (e) {
    console.error("[shopify-connect]", e);
    return res.status(400).json({ error: e.message || String(e) });
  }
}
