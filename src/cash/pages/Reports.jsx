import React, { useState } from "react";
import { call } from "../api.js";
import * as E from "../../../api/_cash-engine.js";
import { useApp, useToast, Card, Btn, Field, Input, Select, PageHead, exportCSV, exportXLSX, exportPDF, inr, Skeleton } from "../ui.jsx";

const REPORTS = [
  { type: "daily_cash", label: "Daily cash report", desc: "Every cash movement on a day + account balances.", date: true },
  { type: "weekly_cash", label: "Weekly cash report", desc: "Actual cash in / out and closing balance, last 8 weeks." },
  { type: "forecast_13w", label: "13-week cash-flow report", desc: "Week-by-week forecast with confidence split.", scenario: true },
  { type: "working_capital", label: "Working-capital report", desc: "Where cash is locked and what releases it; CCC." },
  { type: "supplier_payables", label: "Supplier payables", desc: "Bills and PO installments with due dates and overdue days." },
  { type: "receivables", label: "Receivables report", desc: "Outstanding receivables with ageing." },
  { type: "inventory", label: "Inventory report", desc: "SKUs at cost, cover days, slow and dead stock." },
  { type: "forecast_vs_actual", label: "Forecast vs actual", desc: "Weekly variance and accuracy." },
  { type: "monthly_mis", label: "Monthly MIS", desc: "P&L for a month (kept separate from cash).", month: true },
  { type: "ccc", label: "Cash conversion cycle", desc: "DIO, DSO, DPO and CCC by month." },
];

export default function Reports() {
  const { boot } = useApp();
  const toast = useToast();
  const [opt, setOpt] = useState({ date: E.addDays(boot.today, -1), scenario: "base", month: boot.today.slice(0, 7) });
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(null);
  const run = async (r, fmt) => {
    setBusy(r.type + fmt);
    try {
      const rep = await call("report", { type: r.type, date: opt.date, scenario: opt.scenario, month: opt.month });
      const name = `hashway-${r.type}-${boot.today}`;
      const sections = [{ title: rep.title, columns: rep.columns, rows: rep.rows, summary: rep.summary }, ...(rep.extra || []).map((x) => ({ title: x.title, columns: Object.keys(x.rows[0] || {}), rows: x.rows }))];
      if (fmt === "view") setView(rep);
      else if (fmt === "csv") exportCSV(name, rep.columns, rep.rows);
      else if (fmt === "xlsx") await exportXLSX(name, sections.map((s) => ({ name: s.title.slice(0, 28), columns: s.columns, rows: s.rows })));
      else await exportPDF(name, rep.title, sections);
    } catch (e) { toast(e.message, "bad"); } finally { setBusy(null); }
  };
  return (
    <>
      <PageHead title="Reports" sub="Generate, view or download. Every report is built from the same ledger the dashboard uses." />
      <Card>
        <div className="cf-form" style={{ marginBottom: 14 }}>
          <Field label="Day (daily report)"><Input type="date" value={opt.date} max={boot.today} onChange={(e) => setOpt({ ...opt, date: e.target.value })} /></Field>
          <Field label="Scenario (forecast)"><Select options={["base", "optimistic", "worst"]} value={opt.scenario} onChange={(v) => setOpt({ ...opt, scenario: v })} /></Field>
          <Field label="Month (MIS)"><Input type="month" value={opt.month} onChange={(e) => setOpt({ ...opt, month: e.target.value })} /></Field>
        </div>
        <table className="cf-table"><tbody>{REPORTS.map((r) => (
          <tr key={r.type}><td><b>{r.label}</b><div className="small faint">{r.desc}</div></td>
            <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
              {["view", "csv", "xlsx", "pdf"].map((f) => <Btn key={f} size="sm" kind={f === "view" ? "" : "ghost"} loading={busy === r.type + f} onClick={() => run(r, f)} style={{ marginLeft: 4 }}>{f === "view" ? "View" : f.toUpperCase()}</Btn>)}
            </td></tr>))}</tbody></table>
      </Card>
      {view && (
        <Card title={view.title} actions={<Btn size="sm" onClick={() => setView(null)}>Close</Btn>} className="" >
          {Object.keys(view.summary || {}).length > 0 && <div className="cf-kv" style={{ maxWidth: 480, marginBottom: 12 }}>{Object.entries(view.summary).map(([k, v]) => <React.Fragment key={k}><span>{k}</span><span>{typeof v === "number" ? (Math.abs(v) > 1000 ? inr(v) : v) : String(v)}</span></React.Fragment>)}</div>}
          {!view.rows ? <Skeleton /> : view.rows.length === 0 ? <p className="muted">No rows.</p> : (
            <div className="cf-table-wrap" style={{ maxHeight: 560, overflowY: "auto" }}>
              <table className="cf-table"><thead><tr>{view.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{view.rows.map((r, i) => <tr key={i}>{view.columns.map((c) => <td key={c} className={typeof r[c] === "number" ? "n" : ""}>{typeof r[c] === "number" && Math.abs(r[c]) >= 100 && !/%|Week$|days|Age|Units|Sold|DIO|DSO|DPO|cycle/i.test(c) ? inr(r[c]) : String(r[c] ?? "")}</td>)}</tr>)}</tbody></table>
            </div>)}
        </Card>)}
    </>
  );
}
