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
// This dashboard is dedicated to Hashway. If an admin hits the API
// without their profile being linked to a tenant, we resolve the
// Hashway tenant by its known Shopify domain so the dashboard "just
// works" for admin users.
const HASHWAY_SHOPIFY_DOMAIN = "cd042a-2.myshopify.com";

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

  // Resolve which tenant's Shopify creds to use:
  //  1) admin passed an explicit tenantId in the body → honor it
  //  2) caller's profile has tenant_id → use that (client-role Hashway user)
  //  3) admin without tenant linkage → fall back to the Hashway tenant by
  //     known Shopify domain (this dashboard is hard-scoped to Hashway)
  let tenant = null;
  if (profile.role === "admin" && req.body && req.body.tenantId) {
    const rows = await sb(`tenants?id=eq.${req.body.tenantId}&select=*`);
    tenant = rows?.[0];
  } else if (profile.tenant_id) {
    const rows = await sb(`tenants?id=eq.${profile.tenant_id}&select=*`);
    tenant = rows?.[0];
  } else if (profile.role === "admin") {
    const rows = await sb(
      `tenants?shopify_domain=eq.${encodeURIComponent(HASHWAY_SHOPIFY_DOMAIN)}&select=*`
    );
    tenant = rows?.[0];
    // Last-resort scan in case the domain string is stored slightly differently
    if (!tenant) {
      const all = await sb(`tenants?select=*`);
      tenant = (all || []).find(
        (t) =>
          (t.shopify_domain || "").toLowerCase().includes("cd042a-2") ||
          /hashway/i.test(t.name || "") ||
          /hashway/i.test(t.slug || "")
      );
    }
  }

  if (!tenant) throw new Error("no Hashway tenant found — check tenants table");
  if (!tenant.shopify_domain || !tenant.shopify_access_token)
    throw new Error(`tenant ${tenant.name || tenant.id} has no Shopify credentials`);
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
// search — Shopify products (the full Hashway catalog), with a flag
//          showing whether each one is already in the 2-hour
//          collection. Lenient prefix-wildcard search so "ARCHIVE"
//          matches "Archives" / "Archived" / etc.
// ───────────────────────────────────────────────────────────────────
async function actionSearch(tenant, query) {
  const q = (query || "").trim();
  if (!q) return { results: [] };

  // Tokenize + prefix-wildcard each token. Shopify search supports
  // trailing `*` but not leading. Space = implicit AND.
  const tokens = q.split(/\s+/).map((t) => t.replace(/[^a-zA-Z0-9]/g, "")).filter(Boolean);
  if (tokens.length === 0) return { results: [] };
  const queryStr = tokens.map((t) => `${t}*`).join(" ");

  const gql = `
    query($q: String!) {
      products(first: 40, query: $q, sortKey: TITLE) {
        edges { node {
          id legacyResourceId handle title status
          featuredImage { url }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
          options { name values }
          collections(first: 30) { edges { node { handle } } }
        } }
      }
    }`;
  const d = await shopifyGraphQL(tenant, gql, { q: queryStr });
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
      options: (p.options || []).map((o) => ({ name: o.name, values: o.values })),
      in_collection: inCollection,
    };
  });
  return { results, query_used: queryStr };
}

// ───────────────────────────────────────────────────────────────────
// detail — full variant list for one product with Delhi inventory.
//          Used by the "add with sizes" modal.
// ───────────────────────────────────────────────────────────────────
async function actionDetail(tenant, productGid) {
  if (!productGid) throw new Error("missing productId");
  const gql = `
    query($id: ID!, $loc: ID!) {
      product(id: $id) {
        id legacyResourceId handle title status
        featuredImage { url }
        priceRangeV2 { minVariantPrice { amount currencyCode } }
        options { name values position }
        collections(first: 30) { edges { node { handle } } }
        variants(first: 100) {
          edges { node {
            id legacyResourceId title sku availableForSale inventoryQuantity
            selectedOptions { name value }
            inventoryItem {
              id tracked
              inventoryLevel(locationId: $loc) {
                quantities(names: ["available"]) { name quantity }
              }
            }
          } }
        }
      }
    }`;
  const d = await shopifyGraphQL(tenant, gql, { id: productGid, loc: DELHI_LOCATION_GID });
  const p = d.product;
  if (!p) throw new Error("product not found");

  const variants = (p.variants.edges || []).map((e) => {
    const v = e.node;
    const lvl = v.inventoryItem?.inventoryLevel;
    const avail = lvl?.quantities?.find((q) => q.name === "available");
    // Pick a "size" label out of selectedOptions for the modal
    const sizeOpt = (v.selectedOptions || []).find((o) => /size/i.test(o.name));
    return {
      id: v.id,
      legacy_id: v.legacyResourceId,
      title: v.title,
      sku: v.sku,
      qty: avail?.quantity ?? v.inventoryQuantity ?? 0,
      available: v.availableForSale,
      tracked: !!v.inventoryItem?.tracked,
      inventory_item_id: v.inventoryItem?.id || null,
      size: sizeOpt?.value || v.title,
      options: v.selectedOptions || [],
    };
  });

  return {
    product: {
      id: p.id,
      legacy_id: p.legacyResourceId,
      handle: p.handle,
      title: p.title,
      status: p.status,
      image: p.featuredImage ? p.featuredImage.url : null,
      price: p.priceRangeV2?.minVariantPrice?.amount,
      currency: p.priceRangeV2?.minVariantPrice?.currencyCode || "INR",
      options: p.options || [],
      in_collection: (p.collections.edges || []).some(
        (c) => c.node.handle === COLLECTION_HANDLE
      ),
    },
    variants,
    location: { gid: DELHI_LOCATION_GID, name: "Delhi Warehouse" },
  };
}

// ───────────────────────────────────────────────────────────────────
// add_with_inventory — atomic-ish: drop product into the 2-hour
//   collection AND set Delhi inventory for the picked variants in one
//   round-trip from the user's POV. Strictly scoped to this collection
//   — any variant outside the product is ignored.
//   body: { productId, quantities: [{ variantId, qty }, ...] }
// ───────────────────────────────────────────────────────────────────
async function actionAddWithInventory(tenant, { productId, quantities }) {
  if (!productId) throw new Error("missing productId");
  if (!Array.isArray(quantities)) throw new Error("quantities array required");

  // 1) collection id
  const ch = await shopifyGraphQL(
    tenant,
    `query($h: String!) { collectionByHandle(handle: $h) { id } }`,
    { handle: COLLECTION_HANDLE }
  );
  const colId = ch.collectionByHandle?.id;
  if (!colId) throw new Error(`collection /${COLLECTION_HANDLE} not found`);

  // 2) verify product exists and collect its inventory_item_ids
  const pd = await shopifyGraphQL(
    tenant,
    `query($id: ID!) {
       product(id: $id) {
         id title
         variants(first: 100) { edges { node { id inventoryItem { id } } } }
       }
     }`,
    { id: productId }
  );
  if (!pd.product) throw new Error("product not found");
  const variantMap = new Map();
  (pd.product.variants.edges || []).forEach((e) => {
    if (e.node.inventoryItem?.id) variantMap.set(e.node.id, e.node.inventoryItem.id);
  });

  // 3) add to collection (tolerate "already in collection")
  const addR = (await shopifyGraphQL(
    tenant,
    `mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
       collectionAddProducts(id: $id, productIds: $productIds) {
         collection { id }
         userErrors { field message }
       }
     }`,
    { id: colId, productIds: [productId] }
  )).collectionAddProducts;
  if (addR.userErrors && addR.userErrors.length) {
    const onlyAlready = addR.userErrors.every((u) => /already/i.test(u.message || ""));
    if (!onlyAlready) throw new Error(JSON.stringify(addR.userErrors));
  }

  // 4) set inventory for the picked variants
  const inventoryQuantities = quantities
    .map(({ variantId, qty }) => {
      const itemId = variantMap.get(variantId);
      if (!itemId) return null;
      const n = parseInt(qty, 10);
      if (Number.isNaN(n) || n < 0) return null;
      return { inventoryItemId: itemId, locationId: DELHI_LOCATION_GID, quantity: n };
    })
    .filter(Boolean);

  let inventoryWrites = 0;
  if (inventoryQuantities.length > 0) {
    const input = {
      name: "available",
      reason: "correction",
      referenceDocumentUri: "logistics://pressroom/express-inventory",
      ignoreCompareQuantity: true,
      quantities: inventoryQuantities,
    };
    const setR = (await shopifyGraphQL(
      tenant,
      `mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
         inventorySetQuantities(input: $input) {
           inventoryAdjustmentGroup { reason createdAt }
           userErrors { field message code }
         }
       }`,
      { input }
    )).inventorySetQuantities;
    if (setR.userErrors && setR.userErrors.length)
      throw new Error(JSON.stringify(setR.userErrors));
    inventoryWrites = inventoryQuantities.length;
  }

  return { ok: true, added: true, inventory_writes: inventoryWrites };
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
      case "detail":
        out = await actionDetail(tenant, req.body.productId);
        break;
      case "add":
        out = await actionAdd(tenant, req.body.productId);
        break;
      case "add_with_inventory":
        out = await actionAddWithInventory(tenant, req.body);
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
