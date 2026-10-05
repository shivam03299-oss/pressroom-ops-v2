// Client for the Hashway Cash Command Center API.
//
// Auth runs against the DEDICATED finance Supabase project — not the
// pressroom one. Its URL + anon key are public-by-design build-time values:
//   VITE_CASH_SUPABASE_URL, VITE_CASH_SUPABASE_ANON_KEY
// Local dev (npm run cash:dev) sets VITE_CASH_DEV=1 and skips login.
import { createClient } from "@supabase/supabase-js";

export const DEV = import.meta.env.VITE_CASH_DEV === "1";
const URL = import.meta.env.VITE_CASH_SUPABASE_URL;
const KEY = import.meta.env.VITE_CASH_SUPABASE_ANON_KEY;
export const configured = DEV || (!!URL && !!KEY);

export const auth = !DEV && URL && KEY
  ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "hashway-cash-auth" } })
  : null;

const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
export const prefs = store;

export function getBook() { return store.get("cash.book", "live") === "demo" ? "demo" : "live"; }
export function setBook(b) { store.set("cash.book", b); }
export function getDevRole() { return store.get("cash.devRole", "admin"); }
export function setDevRole(r) { store.set("cash.devRole", r); }

export class ApiError extends Error {
  constructor(status, body) { super(body?.error || `Request failed (${status})`); this.status = status; this.body = body; }
}

export async function call(action, body = {}) {
  const headers = { "Content-Type": "application/json" };
  if (DEV) headers["x-cash-dev-role"] = getDevRole();
  else {
    const { data } = await auth.auth.getSession();
    if (!data.session) throw new ApiError(401, { error: "Sign in first." });
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch("/api/hashway-cash", { method: "POST", headers, body: JSON.stringify({ book: getBook(), ...body, action }) });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}
