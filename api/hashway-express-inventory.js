// Vercel serverless function for the Hashway Express Inventory dashboard.
//
// All operations are scoped to:
//   - Shopify collection: handle = "2-hour-delivery"
//   - Inventory location: Delhi warehouse (Sector-15 Rohini, legacy id 95683445056)
//
// It does NOT touch products outside this collection, does NOT touch orders,
// and does NOT mirror anything to a separate database — Shopify is the
// single source of truth.
//
// POST /api/hashway-express-inventory
//   headers: Authorization: Bearer <supabase access token>
//   body:    { action: "list" | "search" | "add" | "remove" | "set_inventory",
//              ...action-specific fields }

const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjYxNDc5MCwiZXhwIjoyMDkyMTkwNzkwfQ.nvyggrIqa6ntNgptNFFXy5wIFiuSv0AG1bGFjT7CDZ8";

const SHOPIFY_API_VERSION = "2025-01";
const COLLECTION_HANDLE = "2-hour-delivery";
const DELHI_LOCATION_GID = "gid://shopify/Location/95683445056";
const DELHI_LOCATION_LEGACY = "95683445056";
const LOW_STOCK_THRESHOLD = 5;

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

async function authedTenant(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("missing bearer token");
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) throw new Error("invalid token");
  const user = await userRes.json();
  const profileRows = await sb(`profiles?id=eq.${user.id}&select=id,role,tenant_id,name`);
  const profile = profileRows?.[0];
  if (!profile) throw new Error("no profile");
  let tenantId = profile.tenant_id;
  if (profile.role === "admin" && req.body && req.body.tenantId) tenantId = req.body.tenantId;
  if (!tenantId) throw new Error("no tenant for this user");
  const tenantRows = await sb(`tenants?id=eq.${tenantId}&select=*`);
  const tenant = tenantRows?.[0];
  if (!tenant) throw new Error("tenant not found");
  if (!tenant.shopify_domain || !tenant.shopify_access_token)
    throw new Error("tenant has no Shopify credentials");
  return { profile, tenant };
}

async function shopifyGraphQL(tenant, query, variables = {}) {
  const res = await fetch(
    `https://${tenant.shopify_domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": tenant.shopify_access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  const json = await res.json();
  if (!res.ok || json.errors)
    throw new Error(`Shopify GQL: ${JSON.stringify(json.errors || res.statusText)}`);
  return json.data;
}

// ───────────────────────────────────────────────────────────────────
// list — every product in the 2-hour-delivery collection,
//        with per-variant inventory at the Delhi warehouse.
// ───────────────────────────────────────────────────────────────────
async function actionList(tenant) {
  const collectionQuery = `
    query($handle: String!) {
      collectionByHandle(handle: $handle) {
        id title handle
        products(first: 100) {
          edges { node {
            id legacyResourceId handle title status onlineStoreUrl
            featuredImage { url }
            priceRangeV2 { minVariantPrice { amount currencyCode } }
            variants(first: 30) {
              edges { node {
                id legacyResourceId title sku availableForSale inventoryQuantity
                inventoryItem { id tracked }
              } }
            }
          } }
        }
      }
    }`;
  const d = await shopifyGraphQL(tenant, collectionQuery, { handle: COLLECTION_HANDLE });
  const c = d.collectionByHandle;
  if (!c) return { collection: null, products: [] };
  const products = (c.products.edges || []).map((e) => {
    const p = e.node;
    const variants = (p.variants.edges || []).map((ve) => {
      const v = ve.node;
      return {
        id: v.id,
        legacy_id: v.legacyResourceId,
        title: v.title,
        sku: v.sku,
        price: null,
        qty: v.inventoryQuantity || 0,
        available: !!v.availableForSale,
        tracked: !!(v.inventoryItem && v.inventoryItem.tracked),
        inventory_item_id: v.inventoryItem ? v.inventoryItem.id : null,
      };
    });
    const total = variants.reduce((s, v) => s + (v.qty || 0), 0);
    const flag =
      total <= 0 ? "out" :
      total < LOW_STOCK_THRESHOLD ? "low" : "ok";
    return {
      id: p.id,
      legacy_id: p.legacyResourceId,
      handle: p.handle,
      title: p.title,
      status: p.status,
      image: p.featuredImage ? p.featuredImage.url : null,
      price: p.priceRangeV2?.minVariantPrice?.amount,
      currency: p.priceRangeV2?.minVariantPrice?.currencyCode || "INR",
      url: p.onlineStoreUrl,
      variants,
      total_qty: total,
      flag,
    };
  });
  return {
    collection: { id: c.id, title: c.title, handle: c.handle },
    location: { gid: DELHI_LOCATION_GID, name: "Delhi Warehouse" },
    products,
    stats: {
      live_products: products.length,
      total_units: products.reduce((s, p) => s + p.total_qty, 0),
      low_count: products.filter((p) => p.flag === "low").length,
      out_count: products.filter((p) => p.flag === "out").length,
    },
    threshold: LOW_STOCK_THRESHOLD,
  };
}

// ───────────────────────────────────────────────────────────────────
// search — active Shopify products NOT in the 2-hour collection
//          (so admin can pick which ones to add).
// ───────────────────────────────────────────────────────────────────
async function actionSearch(tenant, query) {
  const q = (query || "").trim();
  if (!q) return { results: [] };
  const gql = `
    query($q: String!) {
      products(first: 25, query: $q) {
        edges { node {
          id legacyResourceId handle title status
          featuredImage { url }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
          collections(first: 30) { edges { node { handle } } }
        } }
      }
    }`;
  const d = await shopifyGraphQL(tenant, gql, { q: `${q} AND status:active` });
  const results = (d.products.edges || []).map((e) => {
    const p = e.node;
    const inCollection = (p.collections.edges || []).some(
      (c) => c.node.handle === COLLECTION_HANDLE
    );
    return {
      id: p.id,
      legacy_id: p.legacyResourceId,
      handle: p.handle,
      title: p.title,
      status: p.status,
      image: p.featuredImage ? p.featuredImage.url : null,
      price: p.priceRangeV2?.minVariantPrice?.amount,
      currency: p.priceRangeV2?.minVariantPrice?.currencyCode || "INR",
      in_collection: inCollection,
    };
  });
  return { results };
}

// ───────────────────────────────────────────────────────────────────
// add — drop a product into the 2-hour-delivery collection.
//       Doesn't touch any other collection, doesn't touch inventory.
// ───────────────────────────────────────────────────────────────────
async function actionAdd(tenant, productGid) {
  if (!productGid) throw new Error("missing productId");
  // Resolve collection id first
  const ch = await shopifyGraphQL(
    tenant,
    `query($h: String!) { collectionByHandle(handle: $h) { id } }`,
    { handle: COLLECTION_HANDLE }
  );
  const colId = ch.collectionByHandle?.id;
  if (!colId) throw new Error(`collection /${COLLECTION_HANDLE} not found`);

  const m = `
    mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        collection { id productsCount { count } }
        userErrors { field message }
      }
    }`;
  const d = await shopifyGraphQL(tenant, m, { id: colId, productIds: [productGid] });
  const r = d.collectionAddProducts;
  if (r.userErrors && r.userErrors.length) throw new Error(JSON.stringify(r.userErrors));
  return { ok: true, productsCount: r.collection?.productsCount?.count ?? null };
}

// ───────────────────────────────────────────────────────────────────
// remove — pull a product out of the 2-hour-delivery collection.
// ───────────────────────────────────────────────────────────────────
async function actionRemove(tenant, productGid) {
  if (!productGid) throw new Error("missing productId");
  const ch = await shopifyGraphQL(
    tenant,
    `query($h: String!) { collectionByHandle(handle: $h) { id } }`,
    { handle: COLLECTION_HANDLE }
  );
  const colId = ch.collectionByHandle?.id;
  if (!colId) throw new Error(`collection /${COLLECTION_HANDLE} not found`);

  const m = `
    mutation collectionRemoveProducts($id: ID!, $productIds: [ID!]!) {
      collectionRemoveProducts(id: $id, productIds: $productIds) {
        job { id done }
        userErrors { field message }
      }
    }`;
  const d = await shopifyGraphQL(tenant, m, { id: colId, productIds: [productGid] });
  const r = d.collectionRemoveProducts;
  if (r.userErrors && r.userErrors.length) throw new Error(JSON.stringify(r.userErrors));
  return { ok: true, job: r.job?.id || null };
}

// ───────────────────────────────────────────────────────────────────
// set_inventory — write a new on-hand qty for ONE variant at Delhi.
//   Guard: only allowed if the variant's product is currently in the
//   2-hour-delivery collection. Otherwise refuse — protects unrelated
//   products from accidental edits.
// ───────────────────────────────────────────────────────────────────
async function actionSetInventory(tenant, { variantGid, quantity }) {
  if (!variantGid) throw new Error("missing variantId");
  const qty = parseInt(quantity, 10);
  if (Number.isNaN(qty) || qty < 0) throw new Error("quantity must be a non-negative integer");

  // 1) Resolve variant → product → check it's in 2hr collection
  const check = `
    query($id: ID!) {
      productVariant(id: $id) {
        id title inventoryQuantity inventoryItem { id }
        product {
          id handle title
          collections(first: 30) { edges { node { handle } } }
        }
      }
    }`;
  const d = await shopifyGraphQL(tenant, check, { id: variantGid });
  const v = d.productVariant;
  if (!v) throw new Error("variant not found");
  const inCol = (v.product.collections.edges || []).some(
    (c) => c.node.handle === COLLECTION_HANDLE
  );
  if (!inCol) {
    throw new Error(
      `refused: product /${v.product.handle} is not in /collections/${COLLECTION_HANDLE} — inventory writes only allowed for express products`
    );
  }

  // 2) Set absolute on-hand via inventorySetQuantities (replace, not delta)
  const m = `
    mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup { reason createdAt }
        userErrors { field message code }
      }
    }`;
  const input = {
    name: "available",
    reason: "correction",
    referenceDocumentUri: "logistics://pressroom/express-inventory",
    ignoreCompareQuantity: true,
    quantities: [
      { inventoryItemId: v.inventoryItem.id, locationId: DELHI_LOCATION_GID, quantity: qty },
    ],
  };
  const r = (await shopifyGraphQL(tenant, m, { input })).inventorySetQuantities;
  if (r.userErrors && r.userErrors.length) throw new Error(JSON.stringify(r.userErrors));
  return { ok: true, variantId: variantGid, newQuantity: qty };
}

// ───────────────────────────────────────────────────────────────────
// Handler
// ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { tenant } = await authedTenant(req);
    const action = (req.body && req.body.action) || "list";
    let out;
    switch (action) {
      case "list":
        out = await actionList(tenant);
        break;
      case "search":
        out = await actionSearch(tenant, req.body.query);
        break;
      case "add":
        out = await actionAdd(tenant, req.body.productId);
        break;
      case "remove":
        out = await actionRemove(tenant, req.body.productId);
        break;
      case "set_inventory":
        out = await actionSetInventory(tenant, req.body);
        break;
      default:
        return res.status(400).json({ error: `unknown action: ${action}` });
    }
    return res.status(200).json(out);
  } catch (e) {
    console.error("express-inventory error", e);
    const code = /token|invalid/i.test(e.message || "") ? 401 : 500;
    return res.status(code).json({ error: e.message || String(e) });
  }
}
