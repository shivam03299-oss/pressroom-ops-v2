import { createClient } from "@supabase/supabase-js";

// These values are PUBLIC by design. Row-Level Security on Supabase protects the data.
const SUPABASE_URL = "https://tacczufzvslzpkeyzuzq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhY2N6dWZ6dnNsenBrZXl6dXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTQ3OTAsImV4cCI6MjA5MjE5MDc5MH0.UkY5SYchBFFrkWJq6PXgcpmJjKtX2ZS826IBdVGgHwU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

const TABLES = {
  workers: "workers",
  attendance: "attendance",
  production: "production",
  orders: "orders",
  dispatches: "dispatches",
  warehouse: "warehouse",
  expenses: "expenses",
  revenue: "revenue",
  founderDraws: "founder_draws",
  invoices: "invoices",
  bankTxns: "bank_transactions",
};

export async function fetchAll(key) {
  if (key === "settings") {
    const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
    if (error && error.code !== "PGRST116") throw error;
    return data ? rowToSettings(data) : { warehouseLat: null, warehouseLng: null, warehouseLabel: "", geofenceRadius: 100, geofenceEnabled: false, founder1Name: "Founder 1", founder2Name: "Founder 2", founder1Share: 50, founder2Share: 50 };
  }
  const table = TABLES[key];
  if (!table) throw new Error(`Unknown table: ${key}`);
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToApp(key));
}

export async function insertRow(key, row) {
  if (key === "settings") {
    const payload = settingsToRow(row);
    const { data, error } = await supabase.from("settings").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", 1).select().single();
    if (error) throw error;
    return rowToSettings(data);
  }
  const table = TABLES[key];
  if (!table) throw new Error(`Unknown table: ${key}`);
  const payload = appToRow(key, row);
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw error;
  return rowToApp(key)(data);
}

export async function updateRow(key, id, patch) {
  const table = TABLES[key];
  if (!table) throw new Error(`Unknown table: ${key}`);
  const payload = appToRow(key, patch, true);
  const { data, error } = await supabase.from(table).update(payload).eq("id", id).select().single();
  if (error) throw error;
  return rowToApp(key)(data);
}

export async function deleteRow(key, id) {
  const table = TABLES[key];
  if (!table) throw new Error(`Unknown table: ${key}`);
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

export function subscribe(key, callback) {
  if (key === "settings") return null;
  // App keys map through TABLES; callers may also pass a literal table name
  // (e.g. "shopify_orders", "client_products", "label_batches").
  const table = TABLES[key] || key;
  if (!table) return null;
  // Unique channel name per subscriber — supabase-js refuses to add another
  // listener to a channel that's already been subscribe()'d, so multiple
  // components watching the same table need their own channels.
  const tag = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const channel = supabase
    .channel(`rt:${table}:${tag}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, () => callback())
    .subscribe();
  return () => supabase.removeChannel(channel);
}

function rowToApp(key) {
  return (row) => {
    if (!row) return row;
    if (key === "workers") return { id: row.id, name: row.name, role: row.role, monthlySalary: Number(row.monthly_salary) || 0, active: row.active, joinedOn: row.joined_on || null };
    if (key === "attendance") return { id: row.id, workerId: row.worker_id, date: row.date, punchIn: row.punch_in?.slice(0,5) || null, punchOut: row.punch_out?.slice(0,5) || null, inLoc: row.in_loc, outLoc: row.out_loc };
    if (key === "production") return { id: row.id, date: row.date, product: row.product, client: row.client, sizes: row.sizes || {}, total: row.total, workerId: row.worker_id };
    if (key === "dispatches") return { id: row.id, date: row.date, time: row.time?.slice(0,5) || null, orderId: row.order_id, product: row.product, sizes: row.sizes || {}, total: row.total, warehouse: row.warehouse, workerId: row.worker_id, note: row.note };
    if (key === "orders") return { id: row.id, client: row.client, date: row.date, title: row.title || "", items: row.items || [], status: row.status };
    if (key === "warehouse") return { id: row.id, client: row.client, product: row.product, sizes: row.sizes || {}, kind: row.kind || "apparel" };
    if (key === "expenses") return { id: row.id, date: row.date, category: row.category, label: row.label, amount: Number(row.amount) || 0, note: row.note };
    if (key === "revenue") return { id: row.id, date: row.date, client: row.client, label: row.label, amount: Number(row.amount) || 0, note: row.note };
    if (key === "founderDraws") return { id: row.id, founderKey: row.founder_key, date: row.date, amount: Number(row.amount) || 0, note: row.note };
    if (key === "invoices") return { id: row.id, invoiceNumber: row.invoice_number || "", issueDate: row.issue_date, dueDate: row.due_date || null, client: row.client, label: row.label || "", subtotal: Number(row.subtotal) || 0, tax: Number(row.tax) || 0, total: Number(row.total) || 0, paid: Number(row.paid) || 0, note: row.note, meta: row.meta || {} };
    if (key === "bankTxns") return { id: row.id, date: row.date, direction: row.direction, amount: Number(row.amount) || 0, category: row.category || "", label: row.label || "", note: row.note || "", sourceRef: row.source_ref || null };
    return row;
  };
}

function appToRow(key, row, isPatch = false) {
  if (key === "workers") return compact({ id: row.id, name: row.name, role: row.role, monthly_salary: row.monthlySalary, active: row.active, joined_on: row.joinedOn }, isPatch);
  if (key === "attendance") return compact({ id: row.id, worker_id: row.workerId, date: row.date, punch_in: row.punchIn, punch_out: row.punchOut, in_loc: row.inLoc, out_loc: row.outLoc }, isPatch);
  if (key === "production") return compact({ id: row.id, date: row.date, product: row.product, client: row.client, sizes: row.sizes, total: row.total, worker_id: row.workerId }, isPatch);
  if (key === "dispatches") return compact({ id: row.id, date: row.date, time: row.time, order_id: row.orderId, product: row.product, sizes: row.sizes, total: row.total, warehouse: row.warehouse, worker_id: row.workerId, note: row.note }, isPatch);
  if (key === "orders") {
    const base = { id: row.id, client: row.client, date: row.date, items: row.items, status: row.status };
    if (row.title) base.title = row.title;
    return compact(base, isPatch);
  }
  if (key === "warehouse") return compact({ id: row.id, client: row.client, product: row.product, sizes: row.sizes, kind: row.kind }, isPatch);
  if (key === "expenses") return compact({ id: row.id, date: row.date, category: row.category, label: row.label, amount: row.amount, note: row.note }, isPatch);
  if (key === "revenue") return compact({ id: row.id, date: row.date, client: row.client, label: row.label, amount: row.amount, note: row.note }, isPatch);
  if (key === "founderDraws") return compact({ id: row.id, founder_key: row.founderKey, date: row.date, amount: row.amount, note: row.note }, isPatch);
  if (key === "invoices") return compact({ id: row.id, invoice_number: row.invoiceNumber, issue_date: row.issueDate, due_date: row.dueDate, client: row.client, label: row.label, subtotal: row.subtotal, tax: row.tax, total: row.total, paid: row.paid, note: row.note, meta: row.meta }, isPatch);
  if (key === "bankTxns") return compact({ id: row.id, date: row.date, direction: row.direction, amount: row.amount, category: row.category, label: row.label, note: row.note, source_ref: row.sourceRef }, isPatch);
  return row;
}

function compact(obj, isPatch) {
  if (!isPatch) return obj;
  const r = {};
  for (const k in obj) if (obj[k] !== undefined) r[k] = obj[k];
  return r;
}

function rowToSettings(row) {
  return {
    warehouseLat: row.warehouse_lat != null ? Number(row.warehouse_lat) : null,
    warehouseLng: row.warehouse_lng != null ? Number(row.warehouse_lng) : null,
    warehouseLabel: row.warehouse_label || "",
    geofenceRadius: row.geofence_radius || 100,
    geofenceEnabled: !!row.geofence_enabled,
    founder1Name: row.founder1_name || "Founder 1",
    founder2Name: row.founder2_name || "Founder 2",
    founder1Share: row.founder1_share != null ? Number(row.founder1_share) : 50,
    founder2Share: row.founder2_share != null ? Number(row.founder2_share) : 50,
    yesBankLabel: row.yes_bank_label || "Yes Bank",
    yesBankOpeningBalance: row.yes_bank_opening_balance != null ? Number(row.yes_bank_opening_balance) : 0,
    yesBankOpeningDate: row.yes_bank_opening_date || "",
  };
}

function settingsToRow(s) {
  const r = {
    warehouse_lat: s.warehouseLat,
    warehouse_lng: s.warehouseLng,
    warehouse_label: s.warehouseLabel,
    geofence_radius: s.geofenceRadius,
    geofence_enabled: s.geofenceEnabled,
    founder1_name: s.founder1Name,
    founder2_name: s.founder2Name,
    founder1_share: s.founder1Share,
    founder2_share: s.founder2Share,
  };
  // Only emit Yes Bank fields if the caller provided them; lets the app keep
  // saving founder/warehouse settings before the bank columns migration runs.
  if (s.yesBankLabel !== undefined)          r.yes_bank_label = s.yesBankLabel;
  if (s.yesBankOpeningBalance !== undefined) r.yes_bank_opening_balance = s.yesBankOpeningBalance;
  if (s.yesBankOpeningDate !== undefined)    r.yes_bank_opening_date = s.yesBankOpeningDate;
  return r;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  // Notify admins when a worker logs in (fire-and-forget — never block login).
  (async () => {
    try {
      const prof = await getProfile(data.user.id);
      if (prof?.role === "worker") {
        await logNotification("worker_login", `${prof.name || email} logged in`, null, { role: "worker" });
      }
    } catch {}
  })();
  return data;
}

export async function signOut() {
  // Log the logout while we're still authenticated (the RPC needs a session).
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const prof = await getProfile(user.id).catch(() => null);
      if (prof?.role === "worker") {
        await logNotification("worker_logout", `${prof.name || user.email} logged out`, null, { role: "worker" });
      }
    }
  } catch {}
  await supabase.auth.signOut();
}

// Record an activity event for the admin notifications feed. Actor identity
// is derived server-side from the caller's profile. Best-effort: failures are
// swallowed so they never break the action that triggered them.
export async function logNotification(type, title, body = null, meta = {}) {
  try {
    await supabase.rpc("log_notification", { p_type: type, p_title: title, p_body: body, p_meta: meta });
  } catch (e) {
    console.error("logNotification", e);
  }
}

// Admin-only feed (RLS restricts SELECT to admins).
export async function listNotifications(limit = 50) {
  const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms — check your connection`)), ms)),
  ]);
}

export async function getProfile(userId) {
  const query = supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const { data, error } = await withTimeout(query, 12000, "Profile fetch");
  if (error) throw error;
  if (!data) throw new Error(`No profile found for user ${userId}. Ask admin to add a row in the profiles table.`);
  return data;
}

// ─── Tenant + Shopify orders ──────────────────────────────────────────
export async function fetchTenant(tenantId) {
  const { data, error } = await supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle();
  if (error) throw error;
  return data;
}

// Client-side billing-details editor. Calls a SECURITY DEFINER RPC so
// the client can write ONLY to bill_to_* on their own tenant — not
// velocity_*, shopify_*, name, slug, etc. The RPC resolves tenant_id
// from auth.uid(), so we don't accept (and the client can't spoof) a
// tenant_id argument.
export async function updateTenantBilling({ legalName, gstin, address, stateCode, stateName, pan } = {}) {
  const { data, error } = await supabase.rpc("update_tenant_billing", {
    p_legal_name: legalName ?? null,
    p_gstin:      gstin     ?? null,
    p_address:    address   ?? null,
    p_state_code: stateCode ?? null,
    p_state_name: stateName ?? null,
    p_pan:        pan       ?? null,
  });
  if (error) throw error;
  return data;
}

export async function fetchShopifyOrders(tenantId) {
  let q = supabase.from("shopify_orders").select("*").order("shopify_created_at", { ascending: false });
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Reads the cached Shopify product catalog for one tenant. RLS scopes
// the rows to the caller's own tenant — admins/founders see any tenant
// when they pass an explicit tenantId. New rows arrive via
// /api/shopify?action=sync and /api/shopify?action=oauth-callback (the
// post-install backfill).
export async function listShopifyProducts(tenantId) {
  let q = supabase.from("shopify_products")
    .select("id, title, handle, image_url, status, vendor, product_type, total_inventory, variants, shopify_created_at, shopify_updated_at, synced_at")
    .order("shopify_updated_at", { ascending: false, nullsFirst: false });
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function shopifyProductsCount(tenantId) {
  let q = supabase.from("shopify_products").select("id", { count: "exact", head: true });
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

// Calls the Vercel serverless /api/shopify-sync — returns { fetched, inserted, updated }
export async function syncShopifyOrders(tenantId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const res = await fetch("/api/shopify-sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(tenantId ? { tenantId } : {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `sync failed (${res.status})`);
  return body;
}

// Returns { connected, shop?, tenant? } for the caller's tenant
export async function getShopifyStatus() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const res = await fetch("/api/shopify-status", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `status check failed (${res.status})`);
  return body;
}

// Legacy paste-an-shpat-token connect flow. Kept for clients (e.g.
// hashway) who set up before Shopify deprecated custom-app self-creation
// on 2026-01-01. The Portal UI no longer surfaces this; reach it via the
// console if needed for support.
export async function connectShopify({ domain, accessToken }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const res = await fetch("/api/shopify-connect", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ domain, accessToken }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `connect failed (${res.status})`);
  return body;
}

// Modern flow: ask our server to mint a Shopify OAuth authorize URL for
// the given .myshopify.com domain. The caller redirects the browser to
// the returned URL; Shopify bounces back to /api/shopify-oauth-callback
// once the merchant approves. Returns { url, tenant_id, shop }.
export async function startShopifyOAuth({ shop }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const res = await fetch("/api/shopify-oauth-install", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ shop }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `couldn't start install (${res.status})`);
  if (!body.url) throw new Error("Server didn't return an install URL");
  return body;
}

// ═══════════════════════════════════════════════════════════════════
// CLIENT PRODUCTS  ·  designs go to Supabase Storage, metadata to DB
// ═══════════════════════════════════════════════════════════════════

// Upload one design file (PNG / JPEG) to the client-designs bucket.
// Returns { url, path, name, contentType, sizeBytes } — caller stores
// this on the client_products.designs JSONB column.
export async function uploadDesignFile(file) {
  if (!file) throw new Error("No file provided");
  if (!/^image\/(png|jpe?g)$/.test(file.type)) {
    throw new Error("Only PNG or JPEG files are allowed");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Design file too large (max 10 MB)");
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const ext = file.name.match(/\.(png|jpe?g)$/i)?.[1] || (file.type === "image/png" ? "png" : "jpg");
  const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const cleanName = file.name.replace(/[^\w.\-]+/g, "_").slice(-60);
  // First folder = auth.uid() so the DELETE storage policy can scope
  // ownership cleanly.
  const path = `${user.id}/${rand}-${cleanName}`;

  const { error } = await supabase.storage.from("client-designs").upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;

  const { data: pub } = supabase.storage.from("client-designs").getPublicUrl(path);
  return {
    url: pub.publicUrl,
    path,
    name: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  };
}

// Insert one or more client_products rows. Each product carries an
// already-uploaded `designs` array — call uploadDesignFile() for each
// file first, then assemble the rows here.
export async function saveClientProducts(products) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // Resolve tenant_id from the profile so admin views can group nicely.
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  const rows = products.map(p => ({
    id: p.id || `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tenant_id: profile?.tenant_id || null,
    user_id: user.id,
    blank_id: p.blankId || null,
    name: p.name,
    selling_price: p.sellingPrice ? Number(p.sellingPrice) : null,
    sizes: p.sizes || [],
    shopify_link: p.shopifyLink || null,
    designs: p.designs || [],
    status: p.shopifyLink ? "live" : "draft",
    notes: p.notes || null,
  }));

  const { data, error } = await supabase
    .from("client_products")
    .insert(rows)
    .select();
  if (error) throw error;
  return data;
}

// List products visible to the current user (own rows + tenant rows + all rows if admin).
export async function listMyClientProducts() {
  const { data, error } = await supabase
    .from("client_products")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deleteClientProduct(id) {
  const { error } = await supabase.from("client_products").delete().eq("id", id);
  if (error) throw error;
}

// Clears the connection — keeps historical orders.
export async function disconnectShopify() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const res = await fetch("/api/shopify-disconnect", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `disconnect failed (${res.status})`);
  return body;
}

export async function updatePodStatus(orderId, podStatus) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const res = await fetch("/api/shopify-status", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, podStatus }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `status update failed (${res.status})`);
  return body;
}

// ═══════════════════════════════════════════════════════════════════
// SHIPPING-LABEL PRINT JOBS
// Clients upload courier shipping labels (PDF). We text-extract each
// label, read off product / size / qty, roll up into a production
// summary, store the raw PDFs, and the DTG vendor prints + dispatches.
// Replaces the Shopify-sync order path for Aviva clients.
// ═══════════════════════════════════════════════════════════════════

export const LABEL_STATUS = {
  uploaded:          "UPLOADED",
  in_production:     "UNDER PRODUCTION",
  // "ready_to_dispatch" stays as the enum value (no migration needed),
  // but the display label is now "COMPLETED BY AVIVA" — clearer to
  // clients that production is done from our side, awaiting courier.
  ready_to_dispatch: "COMPLETED BY AVIVA",
  dispatched:        "DISPATCHED",
  delivered:         "DELIVERED",
  // Return to Origin states — both land under the RTO Inventory tab.
  //   rto_in_transit → courier flagged it returning, parcel not back yet
  //   rto            → physically received back at our floor
  rto_in_transit:    "RTO IN TRANSIT",
  rto:               "RTO",
  cancelled:         "CANCELLED",
};
// Forward flow only — rto is a side-branch off `dispatched` (or rarely
// `delivered` for damaged-on-delivery returns) and gets its own
// dedicated tab, not a step in the linear progression.
export const LABEL_STATUS_FLOW = ["uploaded", "in_production", "ready_to_dispatch", "dispatched", "delivered"];

// Map an (AWB, courier) to the courier's own tracking page. Falls back to
// a Google search for unknown couriers or when no courier was detected on
// the label (e.g. a Velocity-internal AWB like "VELC..."). Note: some
// couriers (Delhivery in particular) now gate consumer tracking behind an
// OTP — the link still lands on the correct page with the AWB pre-filled.
export function trackingUrl(courier, awb) {
  if (!awb) return null;
  const c = (courier || "").toLowerCase();
  const a = encodeURIComponent(awb);
  if (c.includes("delhivery"))                       return `https://www.delhivery.com/track-v2/package/${a}`;
  if (c.includes("blue dart") || c.includes("bluedart")) return `https://www.bluedart.com/tracking?trackFor=0&trackNo=${a}`;
  if (c.includes("dtdc"))                            return `https://www.dtdc.com/tracking?strCnno=${a}`;
  if (c.includes("xpressbees"))                      return `https://www.xpressbees.com/shipment/tracking?awbNo=${a}`;
  if (c.includes("ekart"))                           return `https://ekartlogistics.com/shipmenttrack/${a}`;
  if (c.includes("shadowfax"))                       return `https://tracker.shadowfax.in/#/tracking/${a}`;
  if (c.includes("ecom"))                            return `https://ecomexpress.in/tracking/?awb_field=${a}`;
  if (c.includes("india post"))                      return `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?id=${a}`;
  if (c.includes("amazon"))                          return `https://track.amazon.in/tracking/${a}`;
  if (c.includes("shiprocket"))                      return `https://shiprocket.co/tracking/${a}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${courier || "courier"} tracking ${awb}`)}`;
}

const COURIERS = [
  ["delhivery", "Delhivery"], ["blue dart", "Blue Dart"], ["bluedart", "Blue Dart"],
  ["xpressbees", "Xpressbees"], ["ekart", "Ekart"], ["dtdc", "DTDC"],
  ["shadowfax", "Shadowfax"], ["ecom express", "Ecom Express"], ["ecomexpress", "Ecom Express"],
  ["india post", "India Post"], ["amazon", "Amazon Shipping"], ["shiprocket", "Shiprocket"],
  ["velocity", "Velocity"],
];
function detectCourier(text) {
  const t = (text || "").toLowerCase();
  for (const [kw, name] of COURIERS) if (t.includes(kw)) return name;
  return null;
}

function normProductKey(name) {
  return (name || "").toLowerCase().replace(/\s+/g, " ").trim();
}
// Canonicalise sizes to the set the rest of the app uses.
function normSize(sz) {
  const s = (sz || "").toUpperCase().replace(/\s+/g, " ").trim();
  if (s === "2XL") return "XXL";
  if (s === "3XL") return "XXXL";
  if (s === "FREE SIZE" || s === "ONE SIZE" || s === "FS") return "FREE";
  return s;
}
// Pull a trailing size token (and any "(variant)" suffix) off a product
// name. Returns { base, size }. Longest size tokens are matched first so
// "XXL" wins over "XL"/"L". On a Velocity/Delhivery label the product
// reads e.g. "CR7 Acid Wash Oversized Tee - S ()".
const SIZE_RE = /[\s\-–—]+(XXXL|XXL|3XL|2XL|XS|XL|FREE\s?SIZE|ONE\s?SIZE|FS|S|M|L)\s*$/i;
function splitNameAndSize(rawName) {
  let name = (rawName || "").replace(/\s+/g, " ").trim();
  // Drop a trailing "(...)" variant blob (often empty: "()").
  name = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const m = name.match(SIZE_RE);
  if (m) {
    return { base: name.slice(0, m.index).trim(), size: normSize(m[1]) };
  }
  return { base: name, size: "" };
}

// Money cell on a label: ₹, "INR 1299.00", "Rs. 1299", or any number
// with two decimal places. Kept strict so it doesn't trip on the "rs" in
// words like "Ove[rs]ized".
const MONEY_RE = /(₹|\bINR\b|\bRs\.?\s*\d|\d+[.,]\d{2})/i;

// Read a single label PDF into an array of pages; each page is an array
// of lines (top→bottom), each line an array of {x,str} cells (left→right).
async function labelPdfToPages(file) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrlMod = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrlMod.default;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const linesByY = new Map();
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      if (!linesByY.has(y)) linesByY.set(y, []);
      linesByY.get(y).push({ x: it.transform[4], str: it.str.trim() });
    }
    const lines = [...linesByY.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, cells]) => cells.sort((a, b) => a.x - b.x));
    pages.push(lines);
  }
  return pages;
}

// Parse one product row's cells → { name, qty } or null.
// Strategy: strip the money cells (price + total), then the last bare
// integer is the qty and everything before it is the product name.
function parseProductRow(cells) {
  const texts = cells.map(c => c.str).filter(Boolean);
  if (!texts.length) return null;
  const nonMoney = texts.filter(t => !MONEY_RE.test(t));
  // Find the last pure-integer cell → quantity.
  let qtyIdx = -1;
  for (let i = nonMoney.length - 1; i >= 0; i--) {
    if (/^\d{1,4}$/.test(nonMoney[i])) { qtyIdx = i; break; }
  }
  if (qtyIdx < 0) return null;
  const qty = parseInt(nonMoney[qtyIdx], 10);
  const name = nonMoney.slice(0, qtyIdx).join(" ").replace(/\s+/g, " ").trim();
  if (!name) return null;
  return { name, qty: qty > 0 ? qty : 1 };
}

// Amazon Shipping labels embed the qty inside the item description string
// instead of giving it its own column:
//   "1  CR7 Acid Wash Oversized Tee — XL Qty — 1"
//   "2  Hamilton Apex Acidwash Oversized Tee — XL Qty — 1"
// "Qty" is the anchor; what's before it is "<name> — <size>", what's after
// is the count. The leading row-number ("1", "2") is optional. Made the
// dash class generous (-, –, —, :) and the spacing forgiving.
const AMAZON_ROW_RE = /^(?:\d+\s+)?(.+?)\s*Qty\s*[-–—:]?\s*(\d+)\s*$/i;

// Parse a single page of a label into one shipment.
function parseLabelPage(lines) {
  const flat = lines.map(cells => cells.map(c => c.str).join(" "));
  // AWB + order ref + courier
  let awb = null, orderRef = null;
  for (const t of flat) {
    if (!awb) { const m = t.match(/AWB#?\s*([A-Za-z0-9]{8,})/i); if (m) awb = m[1]; }
    if (!orderRef) {
      // Velocity/Delhivery: standalone "#ABC-123" line
      let m = t.match(/^#\s*([A-Za-z0-9][A-Za-z0-9_\-\/]*)$/);
      if (m) { orderRef = "#" + m[1]; continue; }
      // Amazon Shipping: "Order ID: SHI9UCMHGKLHS" — letter+digit blobs of
      // 6+ chars. Prefer this over Amazon's "Invoice ID" since Order ID is
      // the customer-facing reference on track.amazon.in.
      m = t.match(/order\s*id\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9_\-\/]{5,})/i);
      if (m) { orderRef = "#" + m[1]; continue; }
      // Amazon's invoice id is usually "INVOICE ID: #1697" — only used if
      // no order id was found.
      m = t.match(/invoice\s*id\s*[:\-]?\s*#?([A-Za-z0-9][A-Za-z0-9_\-\/]{2,})/i);
      if (m) orderRef = "#" + m[1];
    }
  }
  const courier = detectCourier(flat.join(" "));
  // Product table: rows after the "Product Name … Qty" header, until the
  // "Return Address" / page footer.
  const headerIdx = lines.findIndex(cells => {
    const t = cells.map(c => c.str).join(" ").toLowerCase();
    return t.includes("product name") && /qty/.test(t);
  });
  const items = [];
  if (headerIdx >= 0) {
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const joined = lines[i].map(c => c.str).join(" ");
      if (/return address|^\s*-\s*\d{5,6}\s*$/i.test(joined)) break;
      const row = parseProductRow(lines[i]);
      if (row) {
        const { base, size } = splitNameAndSize(row.name);
        items.push({ productName: base, size, qty: row.qty });
      } else if (items.length && joined.trim() && !MONEY_RE.test(joined)) {
        // Wrapped product name — append to the previous item's base name.
        const prev = items[items.length - 1];
        const merged = splitNameAndSize(`${prev.productName} ${joined.trim()}`);
        prev.productName = merged.base;
        if (!prev.size && merged.size) prev.size = merged.size;
      }
    }
  }

  // ── Amazon Shipping fallback ───────────────────────────────────────
  // No Velocity/Delhivery-shaped table found, but maybe an "Item description"
  // header. Accumulate continuation lines into a buffer and match the
  // "<name> — <size> Qty — <n>" pattern; that way labels where the qty
  // wraps onto the next visual line still parse.
  if (!items.length) {
    const amHeaderIdx = lines.findIndex(cells => {
      const t = cells.map(c => c.str).join(" ").toLowerCase();
      return t.includes("item description");
    });
    if (amHeaderIdx >= 0) {
      let buffer = "";
      for (let i = amHeaderIdx + 1; i < lines.length; i++) {
        const joined = lines[i].map(c => c.str).join(" ").trim();
        if (!joined) continue;
        // Stop at the Amazon sort barcode block / footer. Those lines are
        // 4-letter all-caps codes (NZMO MDEA SBCZ COKE TRVL) followed by
        // short alphanumerics, and finally "amazon shipping".
        if (/^(amazon\s*shipping)\b/i.test(joined)) break;
        if (/^(?:[A-Z]{3,5}\s+){2,}[A-Z]{3,5}$/.test(joined)) break;     // "NZMO MDEA SBCZ COKE TRVL"
        if (/^(?:\d+\s+[A-Z0-9]+\s+){2,}/.test(joined)) break;            // "1 0AX 3 K23 1 C44 A 528"

        buffer = (buffer ? buffer + " " : "") + joined;
        const m = buffer.match(AMAZON_ROW_RE);
        if (m) {
          const desc = m[1].trim();
          const qty = parseInt(m[2], 10) || 1;
          const { base, size } = splitNameAndSize(desc);
          if (base) items.push({ productName: base, size, qty });
          buffer = "";
        }
      }
    }
  }
  return { awb, orderRef, courier, items };
}

// Parse one or more label PDFs → flat list of shipments.
// Returns { shipments, pageCount, fileErrors }.
export async function parseLabelFiles(files) {
  const shipments = [];
  const fileErrors = [];
  let pageCount = 0;
  for (const file of files) {
    try {
      const pages = await labelPdfToPages(file);
      for (const lines of pages) {
        pageCount++;
        const s = parseLabelPage(lines);
        s.file = file.name;
        if (s.items.length) shipments.push(s);
        else fileErrors.push(`${file.name}: a label page had no readable product line`);
      }
    } catch (e) {
      fileErrors.push(`${file.name}: ${e.message || e}`);
    }
  }
  return { shipments, pageCount, fileErrors };
}

// Resolve a design link for a product name against the client's saved
// products (client_products rows, each with a `designs` JSONB array).
export function matchDesignLink(productName, products) {
  if (!productName || !products?.length) return null;
  const key = normProductKey(productName);
  const stripped = key.replace(/[^a-z0-9]/g, "");
  const hit = products.find(p => {
    const pk = normProductKey(p.name);
    return pk === key || pk.replace(/[^a-z0-9]/g, "") === stripped;
  });
  const designs = hit?.designs || [];
  return designs[0]?.url || null;
}

// Roll shipments up into production lines, one per (product × size).
// `products` = the client's client_products rows, for design matching.
export function rollupLabelLines(shipments, products = []) {
  const map = new Map();
  for (const s of shipments) {
    for (const it of s.items) {
      const productKey = normProductKey(it.productName);
      const k = `${productKey}|${it.size}`;
      if (!map.has(k)) {
        map.set(k, {
          product_name: it.productName,
          product_key: productKey,
          size: it.size || "",
          qty: 0,
          design_link: matchDesignLink(it.productName, products),
          order_refs: new Set(),
        });
      }
      const agg = map.get(k);
      agg.qty += it.qty;
      if (s.orderRef) agg.order_refs.add(s.orderRef);
    }
  }
  return [...map.values()]
    .map(l => ({ ...l, order_refs: [...l.order_refs] }))
    .sort((a, b) => a.product_name.localeCompare(b.product_name) || a.size.localeCompare(b.size));
}

export async function myTenantId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
  if (!profile?.tenant_id) throw new Error("Your account isn't linked to a brand yet — contact Aviva support.");
  return { userId: user.id, tenantId: profile.tenant_id };
}

// Upload one raw label PDF into the private client-labels bucket under
// <tenant_id>/<batch_id>/. Returns { path, name, sizeBytes }.
async function uploadLabelFile(file, tenantId, batchId) {
  const clean = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${tenantId}/${batchId}/${rand}-${clean}`;
  const { error } = await supabase.storage.from("client-labels").upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw error;
  return { path, name: file.name, sizeBytes: file.size };
}

// Add uploaded labels into the client's OPEN order for that day, creating
// it if none exists. Same-day uploads accumulate into one order until it's
// sent for production (status leaves 'uploaded'). Dedups by AWB so the same
// label uploaded twice doesn't double-count. Returns the batch row.
// Per-piece price including 5% GST. Single source of truth so the
// admin debit, the Portal upload-time warning, and the saveLabelBatch
// balance enforcement all agree. If pricing ever becomes per-tenant,
// only this function needs to change.
export function pieceCostInclGst(line) {
  const name = (line?.product_name || "").toLowerCase();
  const base = /acid\s*wash/.test(name) ? 545 : 445;
  return Math.round(base * 1.05 * 100) / 100;
}

// Sum of pieceCostInclGst × qty across an array of rolled-up label lines.
export function estimateLabelBatchCost(lines) {
  return (lines || []).reduce(
    (s, l) => s + pieceCostInclGst(l) * (Number(l.qty) || 0),
    0,
  );
}

// Tagged error so the UI can distinguish a wallet-block from other save
// failures (e.g. network, RLS, duplicate AWB).
export class InsufficientWalletBalanceError extends Error {
  constructor({ balance, cost, shortfall }) {
    super(`Wallet balance ₹${balance.toFixed(2)} is short by ₹${shortfall.toFixed(2)} for this batch (₹${cost.toFixed(2)}). Recharge to upload.`);
    this.name = "InsufficientWalletBalanceError";
    this.code = "wallet_insufficient";
    this.balance = balance;
    this.cost = cost;
    this.shortfall = shortfall;
  }
}

export async function saveLabelBatch({ batchDate, files, shipments, products = [], notes }) {
  const { userId, tenantId } = await myTenantId();
  const date = batchDate || new Date().toISOString().slice(0, 10);

  const { data: open } = await supabase.from("label_batches")
    .select("*")
    .eq("tenant_id", tenantId).eq("batch_date", date).eq("status", "uploaded")
    .order("created_at", { ascending: true }).limit(1).maybeSingle();

  const seen = new Set((open?.shipments || []).map(s => s.awb).filter(Boolean));
  const newShips = shipments.filter(s => !s.awb || !seen.has(s.awb));
  const deltaLines = rollupLabelLines(newShips, products);
  const addUnits = deltaLines.reduce((s, l) => s + l.qty, 0);

  // ─── Wallet enforcement ─────────────────────────────────────────────
  // Production is charged at UPLOAD time: a DB trigger debits the wallet
  // the moment each label_line is inserted (or its qty changes). So the
  // confirmed balance (paid recharges − wallet debits) already accounts
  // for every previously-uploaded piece — block this upload only if it
  // can't cover its own delta cost.
  //
  //   available = paid recharges − wallet debits
  if (deltaLines.length > 0) {
    const deltaCost = estimateLabelBatchCost(deltaLines);
    if (deltaCost > 0) {
      // Live confirmed balance — same as before.
      let confirmed = 0;
      try {
        const { data, error } = await supabase.rpc("tenant_wallet_balance", { p_tenant: tenantId });
        if (error) throw error;
        confirmed = Number(data) || 0;
      } catch {
        // Fallback if the RPC is unavailable: sum tables directly.
        const [{ data: cr }, { data: dr }] = await Promise.all([
          supabase.from("client_recharges").select("amount, status").eq("tenant_id", tenantId),
          supabase.from("wallet_debits").select("amount").eq("tenant_id", tenantId),
        ]);
        const credits = (cr || []).filter(r => r.status === "paid").reduce((s, r) => s + Number(r.amount || 0), 0);
        const debits  = (dr || []).reduce((s, r) => s + Number(r.amount || 0), 0);
        confirmed = credits - debits;
      }

      // Charge-on-upload: every label_line is debited the instant it's
      // uploaded (DB trigger trg_debit_label_line_on_insert), so the
      // confirmed balance already reflects all prior uploads. No separate
      // in-flight reservation to subtract — available IS the balance.
      const available = confirmed;
      if (deltaCost > available) {
        throw new InsufficientWalletBalanceError({
          balance:   available,
          confirmed,
          inflight:  0,
          cost:      deltaCost,
          shortfall: deltaCost - available,
        });
      }
    }
  }

  const shipMeta = newShips.map(s => ({ awb: s.awb || null, courier: s.courier || null, order_ref: s.orderRef || null, file: s.file || null }));

  const batchId = open?.id || `lb-${tenantId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // Always store the uploaded PDFs — the floor needs every label to dispatch.
  const fileMeta = [];
  for (const f of files) fileMeta.push(await uploadLabelFile(f, tenantId, batchId));

  const mkLine = (l) => ({
    id: `ll-${batchId}-${crypto.randomUUID()}`, batch_id: batchId, tenant_id: tenantId,
    product_name: l.product_name, product_key: l.product_key, size: l.size || null,
    qty: l.qty, design_link: l.design_link || null, order_refs: l.order_refs || [],
  });

  if (open) {
    const { data: existingLines } = await supabase.from("label_lines").select("*").eq("batch_id", batchId);
    const byKey = new Map((existingLines || []).map(l => [`${l.product_key}|${l.size || ""}`, l]));
    const inserts = [];
    for (const l of deltaLines) {
      const ex = byKey.get(`${l.product_key}|${l.size || ""}`);
      if (ex) {
        const refs = [...new Set([...(ex.order_refs || []), ...(l.order_refs || [])])];
        await supabase.from("label_lines").update({
          qty: ex.qty + l.qty, order_refs: refs, design_link: ex.design_link || l.design_link || null,
        }).eq("id", ex.id);
      } else {
        inserts.push(mkLine(l));
      }
    }
    if (inserts.length) await supabase.from("label_lines").insert(inserts);

    const { data: batch, error } = await supabase.from("label_batches").update({
      files: [...(open.files || []), ...fileMeta],
      shipments: [...(open.shipments || []), ...shipMeta],
      label_count: (open.label_count || 0) + newShips.length,
      unit_count: (open.unit_count || 0) + addUnits,
      updated_at: new Date().toISOString(),
    }).eq("id", batchId).select().single();
    if (error) throw error;
    if (newShips.length > 0) {
      logNotification("order_upload", `Labels added to ${open.order_code || "an order"}`,
        `+${newShips.length} label${newShips.length === 1 ? "" : "s"} · +${addUnits} piece${addUnits === 1 ? "" : "s"}`,
        { order_code: open.order_code, batch_id: batchId, labels: newShips.length, units: addUnits });
    }
    return batch;
  }

  // Assign the next per-client order number (e.g. Balleti001, Balleti002).
  const { data: tRow } = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const prefix = ((tRow?.name || tenantId).replace(/[^A-Za-z0-9]/g, "")) || "ORD";
  const { data: lastSeq } = await supabase.from("label_batches")
    .select("order_seq").eq("tenant_id", tenantId).not("order_seq", "is", null)
    .order("order_seq", { ascending: false }).limit(1).maybeSingle();
  const seq = (lastSeq?.order_seq || 0) + 1;
  const orderCode = `${prefix}${String(seq).padStart(3, "0")}`;

  const { data: batch, error: bErr } = await supabase.from("label_batches").insert({
    id: batchId, tenant_id: tenantId, created_by: userId, batch_date: date, status: "uploaded",
    order_seq: seq, order_code: orderCode,
    label_count: newShips.length, unit_count: addUnits, files: fileMeta, shipments: shipMeta, notes: notes || null,
  }).select().single();
  if (bErr) throw bErr;

  const lineRows = deltaLines.map(mkLine);
  if (lineRows.length) {
    const { error: lErr } = await supabase.from("label_lines").insert(lineRows);
    if (lErr) throw lErr;
  }
  logNotification("order_upload", `New order ${orderCode}`,
    `${newShips.length} label${newShips.length === 1 ? "" : "s"} · ${addUnits} piece${addUnits === 1 ? "" : "s"}`,
    { order_code: orderCode, batch_id: batchId, labels: newShips.length, units: addUnits });
  return batch;
}

// List batches. RLS scopes clients to their own tenant; admins see all.
// When tenantId is omitted, resolve it from the caller's profile and
// scope the query to it. This prevents a cross-tenant leak when an
// admin/founder happens to call this from the client portal: RLS lets
// admins read every tenant's batches (correct for /admin), but the
// portal MUST be scoped to a single tenant. If the caller has no
// tenant_id (= staff role), we return [] rather than every row.
//
// Admin contexts that legitimately want every tenant's batches must
// call listAllLabelBatchesAdmin() instead — the explicit name is the
// only marker that cross-tenant data is being read.
export async function listLabelBatches(tenantId) {
  let resolvedTenant = tenantId;
  if (!resolvedTenant) {
    try {
      const { tenantId: t } = await myTenantId();
      resolvedTenant = t;
    } catch {
      // Staff users have no tenant_id — return empty instead of leaking.
      return [];
    }
  }
  const { data, error } = await supabase
    .from("label_batches")
    .select("*")
    .eq("tenant_id", resolvedTenant)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Admin-only: every tenant's batches in one shot. Caller must already
// be in the admin dashboard — RLS still enforces the admin-bypass
// policy server-side, so a non-admin invoking this just sees their
// own tenant's rows (no privilege escalation).
export async function listAllLabelBatchesAdmin() {
  const { data, error } = await supabase
    .from("label_batches")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listLabelLines(batchId) {
  const { data, error } = await supabase.from("label_lines").select("*").eq("batch_id", batchId);
  if (error) throw error;
  return data || [];
}

// RTO-reuse consumption for a single batch.
//
// When a client uploads a new batch that contains products already in
// their RTO inventory, the DB allocator (allocate_batch_from_rto SQL
// function, fired on status-flip from "uploaded") drops one row per
// allocated order_ref into rto_inventory with kind='fulfill_out' and
// consumed_order_ref pointing at the new order_ref.
//
// This helper pulls those rows back so the batch-detail UI can show
// "FROM RTO" badges + skip the production-charge column for refs that
// got fulfilled from existing stock. Returned as an array of objects:
//   [{ order_ref, product_name, size, consumed_at }, ...]
export async function listRtoConsumedRefs(batchId) {
  if (!batchId) return [];
  const { data, error } = await supabase
    .from("rto_inventory")
    .select("consumed_order_ref, product_name, size, created_at")
    .eq("consumed_batch_id", batchId)
    .eq("kind", "fulfill_out")
    .not("consumed_order_ref", "is", null);
  if (error) { console.warn("[listRtoConsumedRefs]", error); return []; }
  return (data || []).map(r => ({
    order_ref:    r.consumed_order_ref,
    product_name: r.product_name,
    size:         r.size,
    consumed_at:  r.created_at,
  }));
}

// Production charge for one line: acid-wash garments 545/pc, else 445/pc, × qty,
// PLUS 5% GST (the amount actually debited from the wallet).
// MUST stay in sync with the price rule inside pack_label_line()/pack_batch() in SQL.
export const PROD_PRICE = { acidWash: 545, regular: 445 };
export const GST_RATE = 0.05;
export function productionLineBase(line) {
  const acid = /acid\s*wash/i.test(line?.product_name || "");
  return (acid ? PROD_PRICE.acidWash : PROD_PRICE.regular) * (line?.qty || 0);
}
export function productionLinePrice(line) {
  return Math.round(productionLineBase(line) * (1 + GST_RATE) * 100) / 100; // incl GST
}

// Pack a line: server-side computes price, checks wallet balance, records the
// debit, marks the line packed, and rolls the batch up to ready_to_dispatch
// once every line is packed. Throws a tagged error when funds are short.
export async function packLabelLine(lineId) {
  const { data, error } = await supabase.rpc("pack_label_line", { p_line_id: lineId });
  if (error) {
    const m = (error.message || "").match(/INSUFFICIENT_BALANCE\|([\d.]+)\|([\d.]+)/);
    if (m) {
      const e = new Error("INSUFFICIENT_BALANCE");
      e.code = "INSUFFICIENT_BALANCE";
      e.balance = Number(m[1]);
      e.price = Number(m[2]);
      throw e;
    }
    throw error;
  }
  return data;
}

// Pack a single order_ref inside a multi-ref label_line. The wallet
// debit only fires when the LAST unpacked ref on the line is packed —
// same money, same single debit row, just deferred until the line is
// fully cleared. INSUFFICIENT_BALANCE only surfaces on that final pack.
export async function packLabelLineRef(lineId, ref) {
  const { data, error } = await supabase.rpc("pack_label_line_ref", {
    p_line_id: lineId,
    p_ref:     ref,
  });
  if (error) {
    const m = (error.message || "").match(/INSUFFICIENT_BALANCE\|([\d.]+)\|([\d.]+)/);
    if (m) {
      const e = new Error("INSUFFICIENT_BALANCE");
      e.code = "INSUFFICIENT_BALANCE";
      e.balance = Number(m[1]);
      e.price = Number(m[2]);
      throw e;
    }
    throw error;
  }
  return data;
}

// Charge + pack every unpacked line of a batch at once, then advance to
// ready_to_dispatch. Used by the order-level controls so progressing an
// order can never skip the wallet charge. Throws tagged INSUFFICIENT_BALANCE.
export async function packBatch(batchId) {
  const { data, error } = await supabase.rpc("pack_batch", { p_batch_id: batchId });
  if (error) {
    const m = (error.message || "").match(/INSUFFICIENT_BALANCE\|([\d.]+)\|([\d.]+)/);
    if (m) {
      const e = new Error("INSUFFICIENT_BALANCE");
      e.code = "INSUFFICIENT_BALANCE";
      e.balance = Number(m[1]);
      e.price = Number(m[2]);
      throw e;
    }
    throw error;
  }
  return data;
}

// Wallet balance (paid credits − production debits) for a tenant.
// Usable by staff or the owning client (enforced server-side).
export async function getWalletBalance(tenantId) {
  const { data, error } = await supabase.rpc("tenant_wallet_balance", { p_tenant: tenantId });
  if (error) throw error;
  return Number(data) || 0;
}

// Unified wallet transaction feed for the client portal: top-ups + debits.
// When tenantId is omitted, resolve from the caller's profile and scope
// to it — never fall through to an unfiltered query, because RLS lets
// admins read every tenant's wallet (intentional for /admin) and the
// Portal MUST be single-tenant. Staff users (no tenant_id) get {[], 0}.
export async function listWalletTxns(tenantId) {
  let resolvedTenant = tenantId;
  if (!resolvedTenant) {
    try {
      const { tenantId: t } = await myTenantId();
      resolvedTenant = t;
    } catch {
      return { txns: [], balance: 0 };
    }
  }
  const cq = supabase.from("client_recharges").select("id, amount, note, payment_method, status, paid_at, created_at").eq("tenant_id", resolvedTenant);
  const dq = supabase.from("wallet_debits").select("id, amount, note, created_at").eq("tenant_id", resolvedTenant);
  const [credits, debits] = await Promise.all([cq, dq]);
  if (credits.error) throw credits.error;
  if (debits.error) throw debits.error;
  const cr = (credits.data || [])
    .filter(r => r.status === "paid")
    .map(r => ({
      id: r.id, type: "topup",
      amount: Number(r.amount) || 0,
      note: r.note || `Top-up${r.payment_method ? " · " + r.payment_method : ""}`,
      ts: r.paid_at || r.created_at,
      // Carry the raw recharge fields the invoice helper needs. Client
      // portal calls the same downloadRechargeInvoice() helper as admin,
      // and it expects a recharge row with status / paid_at / etc.
      raw: r,
    }));
  const db = (debits.data || [])
    .map(r => ({ id: r.id, type: "debit", amount: Number(r.amount) || 0, note: r.note || "Production charge", ts: r.created_at }));
  const txns = [...cr, ...db].sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const balance = cr.reduce((s, t) => s + t.amount, 0) - db.reduce((s, t) => s + t.amount, 0);
  return { txns, balance };
}

export async function updateLabelBatchStatus(batchId, status) {
  const { data, error } = await supabase.from("label_batches")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", batchId).select().single();
  if (error) throw error;
  return data;
}

// Signed URL for downloading a private label PDF (10 min).
export async function signLabelFileUrl(path) {
  const { data, error } = await supabase.storage.from("client-labels").createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

// Tenant id → display name, for the admin print-jobs view.
export async function listTenantsMap() {
  const { data, error } = await supabase.from("tenants").select("id, name");
  if (error) return {};
  return Object.fromEntries((data || []).map(t => [t.id, t.name]));
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC CATALOG  ·  /catalog index + /catalog/[slug] PDPs
// ═══════════════════════════════════════════════════════════════════
// Read-only access using the anon key — RLS policy on catalog_products
// allows unauthenticated SELECT for rows where is_published = true.

// Display labels per garment family. Drives the filter chips on the
// catalog index. Order here = order in the chip row.
export const CATALOG_FAMILIES = [
  { id: "tee",    label: "T-Shirts" },
  { id: "hoody",  label: "Hoodies" },
  { id: "sweat",  label: "Sweatshirts" },
  { id: "jogger", label: "Joggers" },
  { id: "shorts", label: "Shorts" },
  { id: "polo",   label: "Polos" },
  { id: "shirt",  label: "Shirts" },
];

export async function listCatalogProducts({ family } = {}) {
  let q = supabase
    .from("catalog_products")
    .select("slug,name,family,fit,gsm,fabric,colors,sizes,starting_price,hero_image,display_order")
    .order("display_order", { ascending: true });
  if (family) q = q.eq("family", family);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getCatalogProduct(slug) {
  const { data, error } = await supabase
    .from("catalog_products")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ═══════════════════════════════════════════════════════════════════
// CATALOG ADMIN  ·  upload product images + save/publish/delete SKUs
// ═══════════════════════════════════════════════════════════════════
// All writes require an authenticated admin (RLS on catalog_products
// plus the storage policies on the catalog-public bucket enforce this
// server-side). The client-side admin Catalog page is the only call
// site today.

// Turn an arbitrary product name into a URL-safe slug. Spaces → -, all
// non-alphanumerics dropped, collapsed to single dashes, trimmed.
export function slugifyProductName(name) {
  return (name || "")
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")  // drop diacritics
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "product";
}

// If `slug` is taken, suffix with -2, -3, … until we find a free one.
// Lets the admin name multiple products the same thing without
// throwing on the unique PK constraint.
async function nextAvailableSlug(baseSlug) {
  const { data: existing } = await supabase
    .from("catalog_products")
    .select("slug")
    .ilike("slug", `${baseSlug}%`);
  const taken = new Set((existing || []).map(r => r.slug));
  if (!taken.has(baseSlug)) return baseSlug;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${baseSlug}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Wildly improbable but bail safely.
  return `${baseSlug}-${Date.now().toString(36)}`;
}

// Upload one product image (front / back / lifestyle / etc) into the
// public catalog-public bucket and return its public URL. Path layout:
//   <slug>/<kind>-<timestamp>.<ext>
// so re-uploads don't overwrite the previous shot.
export async function uploadCatalogImage(file, slug, kind = "shot") {
  if (!file) throw new Error("No file provided");
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    throw new Error("Only PNG, JPEG, or WebP images are allowed");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image too large (max 8 MB). Compress or resize and try again.");
  }
  const ext = (file.name.match(/\.(png|jpe?g|webp)$/i)?.[1] || "jpg").toLowerCase();
  const path = `${slug}/${kind}-${Date.now().toString(36)}.${ext}`;
  const { error } = await supabase.storage
    .from("catalog-public")
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) throw error;
  const { data } = supabase.storage.from("catalog-public").getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// Insert or update a catalog product. `product.slug` is optional —
// if missing, we derive one from the name (and disambiguate against
// existing rows). Returns the saved row including its final slug.
export async function saveCatalogProduct(product) {
  const isUpdate = Boolean(product.slug);
  let slug = product.slug;
  if (!isUpdate) {
    slug = await nextAvailableSlug(slugifyProductName(product.name));
  }
  const row = {
    slug,
    name: product.name,
    family: product.family,
    fit: product.fit ?? null,
    gsm: product.gsm != null && product.gsm !== "" ? Number(product.gsm) : null,
    fabric: product.fabric ?? null,
    description: product.description ?? null,
    colors: Array.isArray(product.colors) ? product.colors : [],
    sizes: product.sizes && product.sizes.length
      ? product.sizes
      : ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
    starting_price: product.starting_price != null && product.starting_price !== ""
      ? Number(product.starting_price) : null,
    hero_image: product.hero_image ?? null,
    images: Array.isArray(product.images) ? product.images : [],
    is_published: product.is_published !== false,
    display_order: product.display_order != null ? Number(product.display_order) : 100,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("catalog_products")
    .upsert(row, { onConflict: "slug" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setCatalogProductPublished(slug, isPublished) {
  const { data, error } = await supabase
    .from("catalog_products")
    .update({ is_published: !!isPublished, updated_at: new Date().toISOString() })
    .eq("slug", slug)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCatalogProduct(slug) {
  const { error } = await supabase
    .from("catalog_products")
    .delete()
    .eq("slug", slug);
  if (error) throw error;
}

// Admin variant of listCatalogProducts — returns drafts too. (The public
// listCatalogProducts only sees published rows because RLS filters them.)
export async function listAllCatalogProductsAdmin() {
  const { data, error } = await supabase
    .from("catalog_products")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// ═══════════════════════════════════════════════════════════════════
// ENQUIRIES  ·  marketing-site "talk to us" inbox
// ═══════════════════════════════════════════════════════════════════
// Public anon visitors POST into public.enquiries via the form at
// /enquire. RLS policies allow `insert` from `anon`, but only profiles
// with role in ('admin','founder') can read/update — admins triage the
// inbox from the dashboard, mark contacted, jot notes.

export async function submitEnquiry(payload) {
  const trim = (v) => (typeof v === "string" ? v.trim() : v);
  const row = {
    name:            trim(payload.name) || "",
    phone:           trim(payload.phone) || "",
    email:           trim(payload.email) || null,
    brand_name:      trim(payload.brand_name) || null,
    monthly_volume:  trim(payload.monthly_volume) || null,
    service_type:    trim(payload.service_type) || null,
    message:         trim(payload.message) || null,
    source:          trim(payload.source) || null,
  };
  if (!row.name)  throw new Error("Please enter your name.");
  if (!row.phone) throw new Error("Please enter a phone number we can reach you on.");
  if (row.email && !/^\S+@\S+\.\S+$/.test(row.email)) {
    throw new Error("That email doesn't look quite right.");
  }
  const { data, error } = await supabase
    .from("enquiries")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Admin: latest enquiries first.
export async function listEnquiries() {
  const { data, error } = await supabase
    .from("enquiries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Admin-only: create a Cashfree payment link for `tenantId` for the
// given pre-tax amount + GST %. Hits the serverless function which:
//   1. Calls Cashfree's Payment Links API
//   2. Triggers Cashfree to SMS + email the link to the client on file
//   3. Logs a `pending` row in public.client_recharges so it shows in
//      the wallet history
// Returns { link_url, link_amount, link_amount_base, link_gst, sent_to,
//           recharge_id }. Throws on auth / Cashfree errors.
export async function createCashfreePaymentLink({
  tenantId,
  amountBase,
  gstRate = 5,
  purpose,
  sendSms = true,
  sendEmail = true,
  overridePhone,
  overrideEmail,
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in expired — please refresh.");
  const r = await fetch("/api/cashfree-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      amount_base: Number(amountBase),
      gst_rate: Number(gstRate),
      purpose: purpose || undefined,
      send_sms: sendSms,
      send_email: sendEmail,
      override_phone: overridePhone || undefined,
      override_email: overrideEmail || undefined,
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `cashfree-link ${r.status}`);
  return body;
}

// Admin: mark contacted / closed, add notes. patch is e.g.
// { status: "contacted", notes: "called, voicemail left" }
export async function updateEnquiry(id, patch) {
  const next = { ...patch };
  if (patch.status === "contacted" && !patch.contacted_at) {
    next.contacted_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from("enquiries")
    .update(next)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
