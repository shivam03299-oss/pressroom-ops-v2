// Shared UI kit for the Cash Command Center.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { call } from "./api.js";
import { formatINR } from "../../api/_cash-engine.js";

// ─── formatting ──────────────────────────────────────────────────────────
export const inr = (n, o) => formatINR(n, o);
export const inrC = (n) => formatINR(n, { compact: true });
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fdate(d, { year = true } = {}) {
  if (!d) return "—";
  const [y, m, dd] = String(d).slice(0, 10).split("-");
  return `${Number(dd)} ${MON[Number(m) - 1]}${year ? " " + y : ""}`;
}
export const fmonth = (m) => { const [y, mm] = m.split("-"); return `${MON[Number(mm) - 1]} ${y}`; };
export function fdatetime(t) {
  if (!t) return "—";
  const d = new Date(t);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
export const pct = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `${Number(n).toFixed(d)}%`);

export function Money({ v, compact, signed, className = "", strong }) {
  const n = Number(v) || 0;
  const cls = signed ? (n < 0 ? "neg" : n > 0 ? "pos" : "") : n < 0 ? "neg" : "";
  const s = compact ? inrC(n) : inr(n);
  return <span className={`num ${cls} ${className}`} style={strong ? { fontWeight: 650 } : undefined}>{signed && n > 0 ? "+" : ""}{s}</span>;
}

// ─── data hook ───────────────────────────────────────────────────────────
export function useApi(action, body = {}, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const key = JSON.stringify(body);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await call(action, body);
      if (n === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (n === seq.current) setState({ data: null, error, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, key, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// ─── navigation (tiny pushState router) ──────────────────────────────────
export function go(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}
export function Link({ to, children, ...rest }) {
  return <a href={to} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go(to); }} {...rest}>{children}</a>;
}

// ─── toasts ──────────────────────────────────────────────────────────────
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, kind = "ok") => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === "bad" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="cf-toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`cf-toast ${t.kind}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ─── role context ────────────────────────────────────────────────────────
export const AppCtx = createContext({ me: null, boot: null, can: () => false, reloadBoot: () => {} });
export const useApp = () => useContext(AppCtx);
export const ROLE_CAN = {
  write: ["admin", "finance", "operations"],
  finance: ["admin", "finance"],
  admin: ["admin"],
};

// ─── primitives ──────────────────────────────────────────────────────────
export function Card({ title, sub, actions, children, className = "", bodyClass = "", id }) {
  return (
    <section className={`cf-card ${className}`} id={id}>
      {(title || actions) && (
        <div className="hd">
          <div className="grow">{title && <h2>{title}</h2>}{sub && <div className="small faint" style={{ marginTop: 2 }}>{sub}</div>}</div>
          {actions}
        </div>
      )}
      <div className={`bd ${bodyClass}`}>{children}</div>
    </section>
  );
}
export function Tile({ label, value, sub, tone, help, onClick }) {
  return (
    <div className={`cf-card cf-tile ${tone || ""}`} onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      <div className="lbl">{label}{help && <Help tip={help} />}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
export function Help({ tip }) {
  return <span className="cf-help" tabIndex={0} data-tip={tip} aria-label={tip}>?</span>;
}
export function Badge({ tone, children, title }) { return <span className={`cf-badge ${tone || ""}`} title={title}>{children}</span>; }

const STATUS_TONE = { open: "info", partial: "warn", paid: "good", collected: "good", written_off: "", disputed: "bad", cancelled: "", overdue: "bad",
  submitted: "good", draft: "", reopened: "warn", received: "good", partially_received: "warn", in_production: "info", closed: "", unmatched: "warn", auto: "good", manual: "good", posted: "good", ignored: "",
  completed: "good", completed_with_errors: "warn", failed: "bad", healthy: "good", slow: "warn", dead: "bad", out: "" };
export function StatusBadge({ s, label }) {
  return <Badge tone={STATUS_TONE[s]}>{label || String(s || "").replace(/_/g, " ")}</Badge>;
}
const CONF = { actual: ["good", "Actual"], confirmed: ["info", "Confirmed"], probable: ["warn", "Probable"], possible: ["", "Possible"] };
export function ConfBadge({ c }) { const [t, l] = CONF[c] || ["", c]; return <Badge tone={t} title="How sure we are this cash will move">{l}</Badge>; }

export function Field({ label, help, hint, error, children, style }) {
  return (
    <div className="cf-field" style={style}>
      {label && <label>{label}{help && <Help tip={help} />}</label>}
      {children}
      {error ? <div className="msg">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

/** Money input: free typing, Indian grouping on blur, '' stays '' (blank ≠ zero). */
export function MoneyInput({ value, onChange, placeholder = "0", invalid, warn, ...rest }) {
  const [focus, setFocus] = useState(false);
  const shown = focus || value === "" || value === null || value === undefined || isNaN(Number(value))
    ? (value ?? "")
    : Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return (
    <input className={`cf-input money ${invalid ? "err" : warn ? "wrn" : ""}`} inputMode="decimal" placeholder={placeholder}
      value={shown} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      onChange={(e) => { const raw = e.target.value.replace(/[,₹\s]/g, ""); if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) onChange(raw); }} {...rest} />
  );
}
export function Input({ invalid, ...props }) { return <input className={`cf-input ${invalid ? "err" : ""}`} {...props} />; }
export function Select({ options, value, onChange, placeholder, ...rest }) {
  return (
    <select className="cf-select" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => typeof o === "string" ? <option key={o} value={o}>{o}</option>
        : o.group ? <optgroup key={o.group} label={o.group}>{o.options.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</optgroup>
          : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function Seg({ options, value, onChange }) {
  return (
    <div className="cf-seg" role="tablist">
      {options.map((o) => <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
export function Btn({ kind = "", size = "", loading, children, ...rest }) {
  return <button type="button" className={`cf-btn ${kind} ${size}`} disabled={loading || rest.disabled} {...rest}>{loading ? "Working…" : children}</button>;
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="cf-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`cf-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="mh"><h2>{title}</h2><Btn kind="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Btn></div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  );
}

/** Ask for a reason before changing history — used for every correction. */
export function useReason() {
  const [st, setSt] = useState(null);
  const ask = (title, detail) => new Promise((resolve) => setSt({ title, detail, resolve, text: "" }));
  const el = st && (
    <Modal title={st.title} onClose={() => { st.resolve(null); setSt(null); }}
      footer={<>
        <Btn onClick={() => { st.resolve(null); setSt(null); }}>Cancel</Btn>
        <Btn kind="primary" disabled={!st.text.trim()} onClick={() => { st.resolve(st.text.trim()); setSt(null); }}>Confirm</Btn>
      </>}>
      {st.detail && <p className="muted">{st.detail}</p>}
      <Field label="Reason (kept in the audit log)" hint="Financial history is never changed silently.">
        <textarea className="cf-textarea" autoFocus value={st.text} onChange={(e) => setSt({ ...st, text: e.target.value })} />
      </Field>
    </Modal>
  );
  return [ask, el];
}

export function Empty({ children }) { return <div className="cf-empty">{children}</div>; }
export function Skeleton({ h = 80 }) { return <div className="cf-skel" style={{ height: h }} />; }
export function ErrorBox({ error, retry }) {
  if (!error) return null;
  return <div className="cf-banner bad"><div className="grow"><b>Couldn't load.</b> {error.message}</div>{retry && <Btn size="sm" onClick={retry}>Retry</Btn>}</div>;
}
export function PageHead({ title, sub, children }) {
  return (
    <div className="cf-page-head">
      <div className="grow"><h1>{title}</h1>{sub && <p className="muted" style={{ marginTop: 4 }}>{sub}</p>}</div>
      {children}
    </div>
  );
}

// ─── simple sortable table with totals + export ──────────────────────────
export function DataTable({ columns, rows, empty = "Nothing here yet.", onRow, total, rowClass, max = 500, initialSort }) {
  const [sort, setSort] = useState(initialSort || null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = columns.find((x) => x.key === sort.key);
    const get = c?.sort || ((r) => r[sort.key]);
    return [...rows].sort((a, b) => { const x = get(a), y = get(b); return (x > y ? 1 : x < y ? -1 : 0) * (sort.dir === "asc" ? 1 : -1); });
  }, [rows, sort, columns]);
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="cf-table-wrap">
      <table className="cf-table">
        <thead><tr>{columns.map((c) => (
          <th key={c.key} className={c.num ? "n" : ""} style={{ cursor: "pointer", width: c.width }} title="Sort"
            onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}>
            {c.label}{sort?.key === c.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
          </th>))}</tr></thead>
        <tbody>
          {sorted.slice(0, max).map((r, i) => (
            <tr key={r.id || i} className={`${onRow ? "click" : ""} ${rowClass ? rowClass(r) : ""}`} onClick={onRow ? () => onRow(r) : undefined}>
              {columns.map((c) => <td key={c.key} className={`${c.num ? "n" : ""} ${c.ell ? "ell" : ""}`}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
          {total && <tr className="total">{columns.map((c, i) => <td key={c.key} className={c.num ? "n" : ""}>{i === 0 ? "Total" : total[c.key] ?? ""}</td>)}</tr>}
        </tbody>
      </table>
      {sorted.length > max && <div className="small faint" style={{ padding: 8 }}>Showing first {max} of {sorted.length}. Export for the full list.</div>}
    </div>
  );
}

// ─── export helpers (CSV / Excel / PDF) ──────────────────────────────────
const cell = (v) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v);
export function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export function exportCSV(name, columns, rows) {
  const esc = (v) => { const s = String(cell(v)); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [columns.map(esc).join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
  downloadBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${name}.csv`);
}
export async function exportXLSX(name, sheets) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.map((r) => Object.fromEntries((s.columns || Object.keys(r)).map((c) => [c, cell(r[c])]))), { header: s.columns });
    XLSX.utils.book_append_sheet(wb, ws, (s.name || "Sheet").slice(0, 31));
  }
  XLSX.writeFile(wb, `${name}.xlsx`);
}
export async function exportPDF(name, title, sections) {
  const html2pdf = (await import("html2pdf.js")).default;
  const esc = (s) => String(cell(s)).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const fmtv = (v) => (typeof v === "number" ? formatINR(v, { decimals: Number.isInteger(v) ? 0 : 2 }).replace("₹", "Rs ") : esc(v));
  const body = sections.map((s) => `
    ${s.title ? `<h3 style="margin:14px 0 6px;font-size:12px">${esc(s.title)}</h3>` : ""}
    ${s.summary ? `<table style="margin-bottom:8px;font-size:10px">${Object.entries(s.summary).map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#555">${esc(k)}</td><td style="text-align:right">${fmtv(v)}</td></tr>`).join("")}</table>` : ""}
    <table style="width:100%;border-collapse:collapse;font-size:9px">
      <thead><tr>${s.columns.map((c) => `<th style="text-align:left;border-bottom:1px solid #999;padding:3px 4px">${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${s.rows.map((r) => `<tr>${s.columns.map((c) => `<td style="border-bottom:1px solid #e5e5e5;padding:3px 4px;${typeof r[c] === "number" ? "text-align:right" : ""}">${fmtv(r[c])}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`).join("");
  const el = document.createElement("div");
  el.innerHTML = `<div style="font-family:Helvetica,Arial,sans-serif;color:#111;padding:8px">
    <div style="font-size:9px;color:#666">HASHWAY CLOTHING · Cash Command Center · generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
    <h2 style="margin:6px 0 4px;font-size:15px">${esc(title)}</h2>${body}</div>`;
  await html2pdf().set({ margin: 8, filename: `${name}.pdf`, jsPDF: { unit: "mm", format: "a4", orientation: sections[0]?.columns?.length > 7 ? "landscape" : "portrait" }, html2canvas: { scale: 2 } }).from(el).save();
}
export function ExportMenu({ name, title, columns, rows, sections }) {
  const [open, setOpen] = useState(false);
  const secs = sections || [{ columns, rows }];
  return (
    <div style={{ position: "relative" }}>
      <Btn size="sm" onClick={() => setOpen((o) => !o)} aria-haspopup="menu">Export ▾</Btn>
      {open && (
        <div className="cf-card" style={{ position: "absolute", right: 0, top: 32, zIndex: 40, padding: 6, display: "grid", minWidth: 140 }} onMouseLeave={() => setOpen(false)}>
          <Btn kind="ghost" size="sm" onClick={() => { exportCSV(name, secs[0].columns, secs[0].rows); setOpen(false); }}>CSV</Btn>
          <Btn kind="ghost" size="sm" onClick={() => { exportXLSX(name, secs.map((s, i) => ({ name: s.title || `Sheet${i + 1}`, columns: s.columns, rows: s.rows }))); setOpen(false); }}>Excel (.xlsx)</Btn>
          <Btn kind="ghost" size="sm" onClick={() => { exportPDF(name, title || name, secs); setOpen(false); }}>PDF</Btn>
        </div>
      )}
    </div>
  );
}

/** Recharts tooltip in the kit's style. rows: [{name,value,color}] */
export function ChartTip({ active, payload, label, labelFmt = (l) => l, valueFmt = inr, extra }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="cf-tt">
      <div className="t">{labelFmt(label, payload)}</div>
      {payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => (
        <div className="r" key={p.dataKey}><span><i style={{ background: p.color || p.stroke || p.fill }} />{p.name}</span><span>{valueFmt(p.value)}</span></div>
      ))}
      {extra && extra(payload)}
    </div>
  );
}

/** GREEN / YELLOW / RED daily-update discipline banner. */
export function UpdateBanner({ st, compact }) {
  if (!st) return null;
  const tone = { green: "good", yellow: "warn", red: "bad" }[st.status];
  return (
    <div className={`cf-banner ${tone}`}>
      <span aria-hidden>{st.status === "green" ? "●" : st.status === "yellow" ? "◐" : "■"}</span>
      <div className="grow">
        <b>{st.status === "red" ? "Yesterday's financial data has not been updated." : st.message}</b>
        {!compact && <span> Last completed finance update: <b>{st.lastCompleted ? fdate(st.lastCompleted) : "never"}</b>.
          {st.missing?.length > 1 ? ` ${st.missing.length} days missing in the last two weeks.` : ""}</span>}
      </div>
      {st.status !== "green" && !compact && <Link to="/cash/daily" className="cf-btn sm primary">Update now</Link>}
    </div>
  );
}
