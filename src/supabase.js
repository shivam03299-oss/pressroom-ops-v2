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
  const table = TABLES[key];
  if (!table) return null;
  const channel = supabase
    .channel(`rt:${table}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, () => callback())
    .subscribe();
  return () => supabase.removeChannel(channel);
}

function rowToApp(key) {
  return (row) => {
    if (!row) return row;
    if (key === "workers") return { id: row.id, name: row.name, role: row.role, monthlySalary: Number(row.monthly_salary) || 0, active: row.active };
    if (key === "attendance") return { id: row.id, workerId: row.worker_id, date: row.date, punchIn: row.punch_in?.slice(0,5) || null, punchOut: row.punch_out?.slice(0,5) || null, inLoc: row.in_loc, outLoc: row.out_loc };
    if (key === "production") return { id: row.id, date: row.date, product: row.product, client: row.client, sizes: row.sizes || {}, total: row.total, workerId: row.worker_id };
    if (key === "dispatches") return { id: row.id, date: row.date, time: row.time?.slice(0,5) || null, orderId: row.order_id, product: row.product, sizes: row.sizes || {}, total: row.total, warehouse: row.warehouse, workerId: row.worker_id, note: row.note };
    if (key === "orders") return { id: row.id, client: row.client, date: row.date, title: row.title || "", items: row.items || [], status: row.status };
    if (key === "warehouse") return { id: row.id, client: row.client, product: row.product, sizes: row.sizes || {}, kind: row.kind || "apparel" };
    if (key === "expenses") return { id: row.id, date: row.date, category: row.category, label: row.label, amount: Number(row.amount) || 0, note: row.note };
    if (key === "revenue") return { id: row.id, date: row.date, client: row.client, label: row.label, amount: Number(row.amount) || 0, note: row.note };
    if (key === "founderDraws") return { id: row.id, founderKey: row.founder_key, date: row.date, amount: Number(row.amount) || 0, note: row.note };
    if (key === "invoices") return { id: row.id, invoiceNumber: row.invoice_number || "", issueDate: row.issue_date, dueDate: row.due_date || null, client: row.client, label: row.label || "", subtotal: Number(row.subtotal) || 0, tax: Number(row.tax) || 0, total: Number(row.total) || 0, paid: Number(row.paid) || 0, note: row.note, meta: row.meta || {} };
    return row;
  };
}

function appToRow(key, row, isPatch = false) {
  if (key === "workers") return compact({ id: row.id, name: row.name, role: row.role, monthly_salary: row.monthlySalary, active: row.active }, isPatch);
  if (key === "attendance") return compact({ id: row.id, worker_id: row.workerId, date: row.date, punch_in: row.punchIn, punch_out: row.punchOut, in_loc: row.inLoc, out_loc: row.outLoc }, isPatch);
  if (key === "production") return compact({ id: row.id, date: row.date, product: row.product, client: row.client, sizes: row.sizes, total: row.total, worker_id: row.workerId }, isPatch);
  if (key === "dispatches") return compact({ id: row.id, date: row.date, time: row.time, order_id: row.orderId, product: row.product, sizes: row.sizes, total: row.total, warehouse: row.warehouse, worker_id: row.workerId, note: row.note }, isPatch);
  if (key === "orders") return compact({ id: row.id, client: row.client, date: row.date, title: row.title, items: row.items, status: row.status }, isPatch);
  if (key === "warehouse") return compact({ id: row.id, client: row.client, product: row.product, sizes: row.sizes, kind: row.kind }, isPatch);
  if (key === "expenses") return compact({ id: row.id, date: row.date, category: row.category, label: row.label, amount: row.amount, note: row.note }, isPatch);
  if (key === "revenue") return compact({ id: row.id, date: row.date, client: row.client, label: row.label, amount: row.amount, note: row.note }, isPatch);
  if (key === "founderDraws") return compact({ id: row.id, founder_key: row.founderKey, date: row.date, amount: row.amount, note: row.note }, isPatch);
  if (key === "invoices") return compact({ id: row.id, invoice_number: row.invoiceNumber, issue_date: row.issueDate, due_date: row.dueDate, client: row.client, label: row.label, subtotal: row.subtotal, tax: row.tax, total: row.total, paid: row.paid, note: row.note, meta: row.meta }, isPatch);
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
  };
}

function settingsToRow(s) {
  return {
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
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
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

export async function fetchShopifyOrders(tenantId) {
  let q = supabase.from("shopify_orders").select("*").order("shopify_created_at", { ascending: false });
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
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
