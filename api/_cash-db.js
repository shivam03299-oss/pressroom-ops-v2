// Database adapter for the Hashway Cash Command Center.
//
// The service only ever calls   db.query(text, params) → rows
//                          and  db.tx(async (t) => …)    (t has .query too)
// so production (postgres.js over the Supabase pooler) and tests (PGlite,
// in-process Postgres) share every line of SQL.
//
// Env: CASH_DATABASE_URL — the *dedicated* Hashway finance Supabase project's
// connection string. Use the transaction pooler (port 6543) on Vercel.

import postgres from "postgres";

let pooled = null;

export function prodDb() {
  if (pooled) return pooled;
  const url = process.env.CASH_DATABASE_URL;
  if (!url) throw new Error("CASH_DATABASE_URL is not configured");
  const sql = postgres(url, {
    prepare: false,           // required for the Supabase transaction pooler
    max: Number(process.env.CASH_DB_POOL_MAX) || 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    types: {
      // keep DATE as 'YYYY-MM-DD' strings and NUMERIC as JS numbers
      date: { to: 1082, from: [1082], serialize: (x) => x, parse: (x) => x },
      numeric: { to: 0, from: [1700], serialize: (x) => String(x), parse: (x) => Number(x) },
      int8: { to: 0, from: [20], serialize: (x) => String(x), parse: (x) => Number(x) },
    },
  });
  const wrap = (s) => ({ query: (text, params = []) => s.unsafe(text, params) });
  pooled = { ...wrap(sql), tx: (fn) => sql.begin((s) => fn(wrap(s))), end: () => sql.end() };
  return pooled;
}

/** Wrap a PGlite instance in the same interface (used by tests + local dev). */
export function pgliteDb(pg) {
  const wrap = (c) => ({ query: async (text, params = []) => (await c.query(text, params)).rows });
  return { ...wrap(pg), tx: (fn) => pg.transaction((t) => fn(wrap(t))) };
}
export const PGLITE_PARSERS = { 1082: (x) => x, 1700: (x) => Number(x), 20: (x) => Number(x) };

// ─── tiny SQL helpers ────────────────────────────────────────────────────
const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (s) => { if (!IDENT.test(s)) throw new Error(`bad identifier: ${s}`); return s; };

/** INSERT one or many rows; returns inserted rows. Column set = union of keys. */
export async function insert(q, table, rows, { returning = "*", onConflict = "" } = {}) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (!list.length) return [];
  const cols = [...new Set(list.flatMap((r) => Object.keys(r)))].map(ident);
  const params = [];
  const values = list.map((r) => "(" + cols.map((c) => {
    if (!(c in r) || r[c] === undefined) return "default";
    const v = r[c];
    params.push(v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);
    return `$${params.length}`;
  }).join(",") + ")");
  const text = `insert into ${ident(table)} (${cols.join(",")}) values ${values.join(",")} ${onConflict} ${returning ? "returning " + returning : ""}`;
  return q.query(text, params);
}

/** Chunked bulk insert for big batches (demo data, imports). */
export async function insertMany(q, table, rows, opts = {}, chunk = 400) {
  const out = [];
  for (let i = 0; i < rows.length; i += chunk) out.push(...(await insert(q, table, rows.slice(i, i + chunk), opts)));
  return out;
}

/** UPDATE by id (and book). Only whitelisted columns from `patch`. */
export async function updateById(q, table, id, book, patch) {
  const cols = Object.keys(patch).filter((k) => patch[k] !== undefined).map(ident);
  if (!cols.length) return null;
  const params = cols.map((c) => { const v = patch[c]; return v !== null && typeof v === "object" ? JSON.stringify(v) : v; });
  params.push(id, book);
  const set = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
  const rows = await q.query(`update ${ident(table)} set ${set} where id = $${cols.length + 1} and book = $${cols.length + 2} returning *`, params);
  if (!rows.length) throw new Error(`${table} row not found`);
  return rows[0];
}

/** Set who/why for the audit + guard triggers. Must run inside a tx. */
export async function setActor(q, actor, reason) {
  await q.query("select set_config('cf.actor', $1, true), set_config('cf.reason', $2, true)", [actor || "system", reason || ""]);
}
