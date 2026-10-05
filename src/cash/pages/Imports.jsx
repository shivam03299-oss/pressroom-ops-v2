import React, { useMemo, useState } from "react";
import { call } from "../api.js";
import { IMPORT_TYPES, guessMapping, normaliseRow } from "../../../api/_cash-imports.js";
import { hashString } from "../../../api/_cash-engine.js";
import { useApi, useApp, useToast, Card, Btn, Field, Select, Input, PageHead, Badge, StatusBadge, fdatetime, Modal, Skeleton, Help } from "../ui.jsx";

export default function Imports() {
  const { boot, can } = useApp();
  const toast = useToast();
  const hist = useApi("imports_list");
  const [type, setType] = useState("bank_statement");
  const [file, setFile] = useState(null); // { name, hash, headers, rows }
  const [mapping, setMapping] = useState({});
  const [acct, setAcct] = useState((boot.accounts.find((a) => a.is_primary) || boot.accounts[0])?.id);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState(null);
  const def = IMPORT_TYPES[type];
  const restricted = ["bank_statement", "expenses"].includes(type) && !can("finance");

  const onFile = async (f) => {
    setResult(null);
    if (!f) return;
    const XLSX = await import("xlsx");
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    let rows = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
    // Bank exports often have a few title lines before the header — find the header row.
    if (rows.length && Object.keys(rows[0]).filter((k) => !k.startsWith("__EMPTY")).length < 3) {
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const hi = aoa.findIndex((r) => r.filter((c) => String(c).trim()).length >= 3);
      if (hi >= 0) {
        const headers = aoa[hi].map((h, i) => String(h).trim() || `Column ${i + 1}`);
        rows = aoa.slice(hi + 1).filter((r) => r.some((c) => String(c).trim())).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
      }
    }
    rows = rows.filter((r) => Object.values(r).some((v) => String(v).trim() !== ""));
    const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const bytes = new Uint8Array(buf);
    let s = ""; for (let i = 0; i < bytes.length; i += 4096) s += String.fromCharCode(...bytes.subarray(i, i + 4096));
    const hash = hashString(s) + "-" + bytes.length;
    let map = guessMapping(type, headers);
    try { const saved = await call("mappings", { import_type: type }); const m = saved.find((x) => Object.values(x.mapping).every((h) => headers.includes(h))); if (m) map = m.mapping; } catch { /* none */ }
    setFile({ name: f.name, hash, headers, rows }); setMapping(map);
  };

  const preview = useMemo(() => file ? file.rows.slice(0, 200).map((r) => normaliseRow(type, r, mapping, { categories: boot.categories, today: boot.today })) : [], [file, mapping, type, boot]);
  const bad = preview.filter((p) => p.errors.length).length;
  const missingRequired = def.fields.filter((f) => f.required && !mapping[f.key]);

  const commit = async () => {
    setBusy(true);
    try {
      await call("mapping_save", { import_type: type, name: "last", mapping }).catch(() => {});
      const r = await call("import_commit", { import_type: type, file_name: file.name, file_hash: file.hash, mapping, rows: file.rows, bank_account_id: def.needsAccount ? acct : undefined });
      setResult(r); setFile(null); hist.reload();
      toast(`Imported ${r.success} rows${r.duplicates ? `, ${r.duplicates} duplicates skipped` : ""}${r.failed ? `, ${r.failed} failed` : ""}.`);
    } catch (e) { toast(e.message, "bad"); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="Imports" sub="CSV or Excel from your bank, Shopify, couriers, gateways and marketplaces. Map the columns once; duplicates are refused." />
      {can("write") && <Card title="New import">
        <div className="cf-form">
          <Field label="What are you importing?"><Select value={type} onChange={(v) => { setType(v); setFile(null); setResult(null); }} options={Object.entries(IMPORT_TYPES).map(([value, d]) => ({ value, label: d.label }))} /></Field>
          {def.needsAccount && <Field label="Bank account"><Select options={boot.accounts.map((a) => ({ value: a.id, label: a.name }))} value={acct} onChange={setAcct} /></Field>}
          <Field label="File (.csv, .xlsx, .xls)"><input className="cf-input" style={{ paddingTop: 5 }} type="file" accept=".csv,.xlsx,.xls" disabled={restricted} onChange={(e) => onFile(e.target.files?.[0])} /></Field>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>{def.help}</p>
        {restricted && <div className="cf-banner warn" style={{ marginTop: 8 }}>Only Finance can import this type.</div>}
        {def.needsAggregateOff && boot.settings.receivables_from_sales && <div className="cf-banner warn" style={{ marginTop: 8 }}>“Create receivables from daily sales” is ON in Settings, so this import would double-count. Turn it off first if you want AWB/payment-level tracking.</div>}

        {file && <>
          <h3 style={{ marginTop: 16 }}>Map columns · {file.name} · {file.rows.length} rows</h3>
          <div className="cf-form" style={{ marginTop: 8 }}>
            {def.fields.map((f) => (
              <Field key={f.key} label={<>{f.label}{f.required && <span className="neg"> *</span>}</>}>
                <Select placeholder="— not in file —" options={file.headers} value={mapping[f.key] || ""} onChange={(v) => setMapping({ ...mapping, [f.key]: v || undefined })} />
              </Field>))}
          </div>
          <h3 style={{ marginTop: 16 }}>Preview (first {Math.min(200, file.rows.length)} rows) {bad > 0 ? <Badge tone="bad">{bad} rows with problems</Badge> : <Badge tone="good">looks good</Badge>}</h3>
          <div className="cf-table-wrap" style={{ maxHeight: 320, overflowY: "auto", marginTop: 6 }}>
            <table className="cf-table">
              <thead><tr><th>#</th>{def.fields.filter((f) => mapping[f.key]).map((f) => <th key={f.key}>{f.label}</th>)}<th>Check</th></tr></thead>
              <tbody>{preview.slice(0, 50).map((p, i) => (
                <tr key={i} className={p.errors.length ? "hl" : ""}><td className="faint">{i + 2}</td>
                  {def.fields.filter((f) => mapping[f.key]).map((f) => <td key={f.key} className={f.type === "money" ? "n" : ""}>{p.row[f.key] === null ? <span className="faint">—</span> : String(p.row[f.key])}</td>)}
                  <td className="small">{p.errors.length ? <span className="neg">{p.errors.join("; ")}</span> : "✓"}</td></tr>))}</tbody>
            </table>
          </div>
          <div className="cf-row end" style={{ marginTop: 12 }}>
            {missingRequired.length > 0 && <span className="small neg">Map: {missingRequired.map((f) => f.label).join(", ")}</span>}
            <Btn onClick={() => setFile(null)}>Cancel</Btn>
            <Btn kind="primary" loading={busy} disabled={missingRequired.length > 0} onClick={commit}>Import {file.rows.length} rows</Btn>
          </div>
        </>}
        {result && (
          <div className={`cf-banner ${result.failed ? "warn" : "good"}`} style={{ marginTop: 14 }}>
            <div className="grow"><b>Import {result.status.replace(/_/g, " ")}.</b> {result.total} rows · {result.success} imported · {result.duplicates} duplicates · {result.failed} failed.</div>
            {result.errors.length > 0 && <Btn size="sm" onClick={() => setErrs(result.errors)}>See rows</Btn>}
          </div>)}
      </Card>}

      <Card title="Import history" className="" sub="Each file is fingerprinted — the same file can't be imported twice." >
        {!hist.data ? <Skeleton h={160} /> : hist.data.length === 0 ? <p className="muted">No imports yet.</p> : (
          <table className="cf-table">
            <thead><tr><th>When</th><th>Type</th><th>File</th><th>By</th><th className="n">Rows</th><th className="n">OK</th><th className="n">Duplicates</th><th className="n">Failed</th><th>Status</th><th></th></tr></thead>
            <tbody>{hist.data.map((i) => (
              <tr key={i.id}><td className="small">{fdatetime(i.created_at)}</td><td>{IMPORT_TYPES[i.import_type]?.label || i.import_type}{i.account_name && <div className="small faint">{i.account_name}</div>}</td>
                <td className="ell">{i.file_name}</td><td className="small">{i.imported_by}</td><td className="n">{i.total_rows}</td><td className="n">{i.success_rows}</td><td className="n">{i.duplicate_rows}</td><td className="n">{i.failed_rows}</td>
                <td><StatusBadge s={i.status} /></td><td>{(i.failed_rows > 0 || i.duplicate_rows > 0) && <ErrBtn id={i.id} />}</td></tr>))}</tbody>
          </table>)}
      </Card>
      {errs && <Modal wide title="Rows not imported" onClose={() => setErrs(null)}><ErrTable rows={errs} /></Modal>}
    </>
  );
}

function ErrBtn({ id }) {
  const [open, setOpen] = useState(false);
  return <>{open && <ErrModal id={id} onClose={() => setOpen(false)} />}<Btn size="sm" kind="ghost" onClick={() => setOpen(true)}>Details</Btn></>;
}
function ErrModal({ id, onClose }) {
  const { data } = useApi("import_errors", { id });
  return <Modal wide title="Rows not imported" onClose={onClose}>{!data ? <Skeleton h={120} /> : <ErrTable rows={data.map((e) => ({ row: e.row_number, kind: e.kind, error: e.error }))} />}</Modal>;
}
function ErrTable({ rows }) {
  return <table className="cf-table"><thead><tr><th>Row</th><th>Type</th><th>Problem</th></tr></thead><tbody>{rows.map((e, i) => <tr key={i}><td>{e.row}</td><td><Badge tone={e.kind === "duplicate" ? "warn" : "bad"}>{e.kind}</Badge></td><td>{e.error}</td></tr>)}</tbody></table>;
}
