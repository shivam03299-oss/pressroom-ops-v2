import React, { useState } from "react";
import { call } from "../api.js";
import { useApi, useApp, useToast, useReason, Card, Money, inr, fdate, fdatetime, Badge, ConfBadge, Seg, Btn, Field, Input, MoneyInput, Select, Modal, PageHead, Skeleton, ErrorBox, ExportMenu, DataTable } from "../ui.jsx";

const NATURE = { cash: ["good", "Cash"], accrual: ["", "Accrual (P&L only)"], expected: ["info", "Expected"] };

export function Ledger() {
  const { boot, can } = useApp();
  const [flt, setFlt] = useState({ nature: "cash", from: "", to: "", category: "", account: "", q: "", status: "" });
  const { data, error, reload } = useApi("ledger_list", { ...Object.fromEntries(Object.entries(flt).filter(([, v]) => v)), limit: 500 });
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const set = (k) => (v) => setFlt({ ...flt, [k]: v?.target ? v.target.value : v });
  if (error) return <ErrorBox error={error} retry={reload} />;
  const rows = data?.rows || [];
  const exp = rows.map((r) => ({ Date: r.txn_date, Type: r.nature, Direction: r.direction, Account: r.account_name, Category: r.category_name, Party: r.party_name, Description: r.description,
    Amount: r.direction === "in" ? r.amount : -r.amount, Confidence: r.confidence, Source: r.source, Status: r.status, "Bank matched": r.bank_matched ? "yes" : "" }));
  return (
    <>
      <PageHead title="Ledger" sub="The single source of truth. Daily updates, imports, API feeds and manual entries all land here in the same structure.">
        {can("finance") && <><Btn onClick={() => setTransfer(true)}>Transfer</Btn><Btn kind="primary" onClick={() => setAdding(true)}>+ Transaction</Btn></>}
        <ExportMenu name="hashway-ledger" title="Ledger" columns={Object.keys(exp[0] || { Date: 0 })} rows={exp} />
      </PageHead>
      <Card>
        <div className="cf-row" style={{ marginBottom: 12 }}>
          <Seg value={flt.nature} onChange={set("nature")} options={[{ value: "cash", label: "Cash" }, { value: "accrual", label: "Accruals" }, { value: "expected", label: "Expected" }, { value: "", label: "All" }]} />
          <Input type="date" value={flt.from} onChange={set("from")} style={{ width: 150 }} aria-label="From" />
          <Input type="date" value={flt.to} onChange={set("to")} style={{ width: 150 }} aria-label="To" />
          <Select style={{ width: 200 }} placeholder="All categories" options={boot.categories.map((c) => ({ value: c.code, label: c.name }))} value={flt.category} onChange={set("category")} />
          <Select style={{ width: 180 }} placeholder="All accounts" options={boot.accounts.map((a) => ({ value: a.id, label: a.name }))} value={flt.account} onChange={set("account")} />
          <Input placeholder="Search description / party" value={flt.q} onChange={set("q")} style={{ width: 220 }} />
          <label className="cf-check small"><input type="checkbox" checked={flt.status === "void"} onChange={(e) => setFlt({ ...flt, status: e.target.checked ? "void" : "" })} /> show voided</label>
        </div>
        {!data ? <Skeleton h={300} /> : <>
          <div className="cf-row small muted" style={{ marginBottom: 8 }}>{data.total} transactions · in {inr(data.inflow)} · out {inr(data.outflow)} · net <Money v={data.inflow - data.outflow} signed /></div>
          <DataTable rows={rows} onRow={setSel} max={500}
            columns={[
              { key: "txn_date", label: "Date", render: (r) => fdate(r.txn_date) },
              { key: "nature", label: "Type", render: (r) => <Badge tone={NATURE[r.nature][0]}>{NATURE[r.nature][1]}</Badge> },
              { key: "category_name", label: "Category" },
              { key: "description", label: "Description", ell: true, render: (r) => <>{r.description}{r.party_name && <div className="small faint">{r.party_name}</div>}</> },
              { key: "account_name", label: "Account", render: (r) => r.account_name || "—" },
              { key: "amount", label: "Amount", num: true, sort: (r) => (r.direction === "in" ? 1 : -1) * r.amount, render: (r) => <Money v={(r.direction === "in" ? 1 : -1) * r.amount} signed /> },
              { key: "source", label: "Source", render: (r) => <span className="small">{r.source.replace("_", " ")}</span> },
              { key: "bank_matched", label: "Bank", render: (r) => (r.nature === "cash" ? (r.bank_matched ? <Badge tone="good">✓</Badge> : <span className="faint small">—</span>) : null) },
              { key: "status", label: "", render: (r) => (r.status === "void" ? <Badge tone="bad">void</Badge> : r.nature !== "cash" ? <ConfBadge c={r.confidence} /> : null) },
            ]} />
        </>}
      </Card>
      {sel && <TxnModal t={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); reload(); }} />}
      {adding && <NewTxn onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {transfer && <TransferModal onClose={() => setTransfer(false)} onSaved={() => { setTransfer(false); reload(); }} />}
    </>
  );
}

function TxnModal({ t, onClose, onSaved }) {
  const { boot, can } = useApp();
  const toast = useToast();
  const [ask, reasonEl] = useReason();
  const [f, setF] = useState({ amount: String(t.amount), txn_date: t.txn_date, category_code: t.category_code, bank_account_id: t.bank_account_id, description: t.description || "" });
  const hist = useApi("audit_list", { table: "cf_transactions", row_id: t.id });
  const cats = boot.categories.filter((c) => c.direction === t.direction || c.direction === "both");
  const editable = can("finance") && t.status === "posted";
  const save = async () => {
    const patch = {};
    if (Number(f.amount) !== t.amount) patch.amount = Number(f.amount);
    for (const k of ["txn_date", "category_code", "bank_account_id", "description"]) if ((f[k] || null) !== (t[k] || null)) patch[k] = f[k];
    if (!Object.keys(patch).length) return onClose();
    const reason = await ask("Why are you correcting this?", "The original values stay in the audit log.");
    if (!reason) return;
    try { await call("txn_update", { id: t.id, patch, reason }); toast("Corrected."); onSaved(); } catch (e) { toast(e.message, "bad"); }
  };
  const voidIt = async () => {
    const reason = await ask("Void this transaction?", "It stops counting everywhere (and releases any bill/receivable it settled) but is never deleted.");
    if (!reason) return;
    try { await call("txn_void", { id: t.id, reason }); toast("Voided."); onSaved(); } catch (e) { toast(e.message, "bad"); }
  };
  return (
    <Modal wide title={`${t.direction === "in" ? "Money in" : "Money out"} · ${inr(t.amount)}`} onClose={onClose}
      footer={editable && <><Btn kind="danger" onClick={voidIt}>Void…</Btn><span style={{ flex: 1 }} /><Btn onClick={onClose}>Close</Btn><Btn kind="primary" onClick={save}>Save correction</Btn></>}>
      {reasonEl}
      <div className="cf-row"><Badge tone={NATURE[t.nature][0]}>{NATURE[t.nature][1]}</Badge><span className="small muted">source: {t.source} · entered by {t.created_by || "system"} · {fdatetime(t.created_at)}</span>{t.status === "void" && <Badge tone="bad">void — {t.void_reason}</Badge>}</div>
      <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="cf-form">
          <Field label="Amount"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
          <Field label="Date"><Input type="date" value={f.txn_date} onChange={(e) => setF({ ...f, txn_date: e.target.value })} /></Field>
          <Field label="Category"><Select options={cats.map((c) => ({ value: c.code, label: `${c.grp} · ${c.name}` }))} value={f.category_code} onChange={(v) => setF({ ...f, category_code: v })} /></Field>
          {t.nature === "cash" && <Field label="Account"><Select options={boot.accounts.map((a) => ({ value: a.id, label: a.name }))} value={f.bank_account_id} onChange={(v) => setF({ ...f, bank_account_id: v })} /></Field>}
        </div>
        <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </fieldset>
      <h3>History</h3>
      <AuditRows rows={hist.data || []} />
    </Modal>
  );
}

function NewTxn({ onClose, onSaved }) {
  const { boot } = useApp();
  const toast = useToast();
  const [f, setF] = useState({ nature: "cash", direction: "out", amount: "", txn_date: boot.today, category_code: "expense_other", bank_account_id: (boot.accounts.find((a) => a.is_primary) || boot.accounts[0])?.id,
    party_name: "", description: "", confidence: "probable" });
  const cats = boot.categories.filter((c) => c.active && (c.direction === f.direction || c.direction === "both") && (f.nature === "accrual" || c.pnl_class !== "revenue"));
  const save = async () => { try { await call("txn_create", f); toast("Added to the ledger."); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal title="New transaction" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Add</Btn></>}>
      <Seg value={f.nature} onChange={(v) => setF({ ...f, nature: v })} options={[{ value: "cash", label: "Cash moved" }, { value: "expected", label: "Expected (future)" }, { value: "accrual", label: "Accrual (P&L only)" }]} />
      <p className="small muted">{f.nature === "cash" ? "Money that actually moved in or out of an account." : f.nature === "expected" ? "Future cash for the forecast." : "Revenue or expense recognised with no cash yet — affects the MIS only."}</p>
      <div className="cf-form">
        <Field label="Direction"><Seg value={f.direction} onChange={(v) => setF({ ...f, direction: v, category_code: v === "in" ? "income_other" : "expense_other" })} options={[{ value: "in", label: "In" }, { value: "out", label: "Out" }]} /></Field>
        <Field label="Amount"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Date"><Input type="date" value={f.txn_date} onChange={(e) => setF({ ...f, txn_date: e.target.value })} /></Field>
        <Field label="Category"><Select options={[...new Set(cats.map((c) => c.grp))].map((g) => ({ group: g, options: cats.filter((c) => c.grp === g).map((c) => ({ value: c.code, label: c.name })) }))} value={f.category_code} onChange={(v) => setF({ ...f, category_code: v })} /></Field>
        {f.nature === "cash" && <Field label="Account"><Select options={boot.accounts.map((a) => ({ value: a.id, label: a.name }))} value={f.bank_account_id} onChange={(v) => setF({ ...f, bank_account_id: v })} /></Field>}
        {f.nature === "expected" && <Field label="Confidence"><Select options={["confirmed", "probable", "possible"]} value={f.confidence} onChange={(v) => setF({ ...f, confidence: v })} /></Field>}
        <Field label="Party"><Input value={f.party_name} onChange={(e) => setF({ ...f, party_name: e.target.value })} /></Field>
      </div>
      <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
    </Modal>
  );
}

function TransferModal({ onClose, onSaved }) {
  const { boot } = useApp();
  const toast = useToast();
  const [f, setF] = useState({ from_account: boot.accounts[0]?.id, to_account: boot.accounts[1]?.id, amount: "", txn_date: boot.today, description: "" });
  const opts = boot.accounts.map((a) => ({ value: a.id, label: a.name }));
  const save = async () => { try { await call("transfer", f); toast("Transfer recorded (both legs)."); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal title="Transfer between own accounts" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Record</Btn></>}>
      <div className="cf-form">
        <Field label="From"><Select options={opts} value={f.from_account} onChange={(v) => setF({ ...f, from_account: v })} /></Field>
        <Field label="To"><Select options={opts} value={f.to_account} onChange={(v) => setF({ ...f, to_account: v })} /></Field>
        <Field label="Amount"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Date"><Input type="date" value={f.txn_date} onChange={(e) => setF({ ...f, txn_date: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function AuditRows({ rows }) {
  if (!rows.length) return <p className="small muted">No history.</p>;
  return (
    <table className="cf-table"><tbody>{rows.map((a) => (
      <tr key={a.id}><td style={{ width: 130 }} className="small">{fdatetime(a.changed_at)}</td>
        <td style={{ width: 70 }}><Badge tone={a.action === "update" ? "warn" : a.action === "delete" ? "bad" : ""}>{a.action}</Badge></td>
        <td className="small">{a.changed_by}{a.reason && <div className="muted">“{a.reason}”</div>}</td>
        <td className="small">{a.action === "update" ? Object.keys(a.new_values || {}).map((k) => <div key={k}><b>{k}</b>: <s className="faint">{fmt(a.old_values?.[k])}</s> → {fmt(a.new_values[k])}</div>) : <span className="faint">{a.table_name.replace("cf_", "")}</span>}</td></tr>))}</tbody></table>
  );
}
const fmt = (v) => (v === null || v === undefined ? "∅" : typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v));

export function Audit() {
  const [flt, setFlt] = useState({ table: "", action: "", only_changes: true });
  const { data, error, reload } = useApi("audit_list", { ...flt, limit: 300 });
  if (error) return <ErrorBox error={error} retry={reload} />;
  return (
    <>
      <PageHead title="Audit log" sub="Every insert, correction, void and setting change — who, when, what changed and why. Nothing is overwritten silently.">
        <ExportMenu name="hashway-audit" title="Audit log" columns={["When", "Who", "Table", "Row", "Action", "Reason", "Old", "New"]}
          rows={(data || []).map((a) => ({ When: a.changed_at, Who: a.changed_by, Table: a.table_name, Row: a.row_id, Action: a.action, Reason: a.reason, Old: JSON.stringify(a.old_values), New: JSON.stringify(a.new_values) }))} />
      </PageHead>
      <Card>
        <div className="cf-row" style={{ marginBottom: 10 }}>
          <Select style={{ width: 220 }} placeholder="All tables" value={flt.table} onChange={(v) => setFlt({ ...flt, table: v })}
            options={["cf_transactions", "cf_daily_updates", "cf_receivables", "cf_payables", "cf_purchase_orders", "cf_po_installments", "cf_bank_accounts", "cf_settings", "cf_forecast_assumptions", "cf_users", "cf_skus", "cf_alert_rules", "cf_imports"]} />
          <label className="cf-check small"><input type="checkbox" checked={flt.only_changes} onChange={(e) => setFlt({ ...flt, only_changes: e.target.checked })} /> changes & deletions only</label>
        </div>
        {!data ? <Skeleton h={300} /> : <AuditRows rows={data} />}
      </Card>
    </>
  );
}
