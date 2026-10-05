import React, { useState } from "react";
import { call } from "../api.js";
import { useApi, useApp, useToast, Card, Money, inr, fmonth, Btn, Field, Input, MoneyInput, Select, Modal, PageHead, Skeleton, ErrorBox, ExportMenu, Badge, pct } from "../ui.jsx";

const LINES = [
  ["revenue", "Revenue (ex-GST)", 1], ["cogs", "COGS", -1], ["grossProfit", "Gross profit", 0, true], ["grossMargin", "Gross margin", "pct"],
  ["marketing", "Marketing", -1], ["shipping", "Shipping", -1], ["salaries", "Salaries", -1], ["opex", "Operating expenses", -1], ["finance_cost", "Finance costs", -1],
  ["other", "Other income", 1], ["netProfit", "Net profit", 0, true], ["netMargin", "Net margin", "pct"],
];

export default function Mis() {
  const { can } = useApp();
  const { data, error, reload } = useApi("mis", { months: 6 });
  const [m, setM] = useState(null);
  const [adj, setAdj] = useState(false);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Skeleton h={400} />;
  const month = m || data.months[data.months.length - 1];
  const idx = data.months.indexOf(month);
  const pnl = data.pnl[idx], br = data.bridges[idx];
  const expCols = ["Line", ...data.months.map(fmonth)];
  const expRows = LINES.map(([k, l]) => ({ Line: l, ...Object.fromEntries(data.months.map((mm, i) => [fmonth(mm), data.pnl[i][k]])) }));
  return (
    <>
      <PageHead title="MIS / P&L — and why profit isn't cash" sub="The P&L is kept separate from cash flow. Never use it to forecast cash.">
        {can("finance") && <Btn onClick={() => setAdj(true)}>+ Accountant adjustment</Btn>}
        <ExportMenu name="hashway-mis" title="Monthly MIS" columns={expCols} rows={expRows} />
      </PageHead>

      <Card title="Profit & loss by month">
        <div className="cf-table-wrap">
          <table className="cf-table">
            <thead><tr><th></th>{data.months.map((mm) => <th key={mm} className="n" style={{ cursor: "pointer", color: mm === month ? "var(--accent)" : undefined }} onClick={() => setM(mm)}>{fmonth(mm)}</th>)}</tr></thead>
            <tbody>{LINES.map(([k, l, sign, bold]) => (
              <tr key={k} className={bold ? "total" : ""}><td className={sign === "pct" ? "muted small" : ""}>{l}</td>
                {data.pnl.map((p, i) => <td key={i} className="n" style={{ background: data.months[i] === month ? "var(--accent-soft)" : undefined }}>
                  {sign === "pct" ? pct(p[k], 1) : <Money v={sign === -1 ? -p[k] : p[k]} />}</td>)}</tr>))}</tbody>
          </table>
        </div>
        {data.pnl.some((p) => p.cogsEstimated) && <p className="small faint" style={{ marginTop: 8 }}>Some COGS is estimated with the default COGS % (Settings) where SKU-level cost wasn't recorded for the day.</p>}
      </Card>

      <div className="cf-grid cf-g2" style={{ marginTop: 14 }}>
        <Card title={`Profit vs cash generated · ${fmonth(month)}`} sub="Indirect method: start from profit, adjust for working-capital movements">
          <table className="cf-table"><tbody>
            {br.lines.slice(0, -1).map((l) => <tr key={l.key}><td>{l.label}<div className="small faint">{l.help}</div></td><td className="n"><Money v={l.amount} signed={l.key !== "net_profit"} /></td></tr>)}
            <tr className="total"><td>Net operating cash flow</td><td className="n"><Money v={br.operatingCashFlow} /></td></tr>
            {br.lines.slice(-1).map((l) => <tr key={l.key}><td>{l.label}</td><td className="n"><Money v={l.amount} signed /></td></tr>)}
            <tr className="total"><td>Cash change explained</td><td className="n"><Money v={br.derivedNetCash} /></td></tr>
            <tr><td>Actual change in bank cash</td><td className="n"><Money v={br.actualNetCash} /></td></tr>
            <tr className={Math.abs(br.unexplained) > 1 ? "hl" : ""}><td><b>Unexplained difference</b><div className="small faint">Timing, estimates (COGS %), unrecorded items. Shown, never hidden.</div></td>
              <td className="n"><b><Money v={br.unexplained} /></b></td></tr>
          </tbody></table>
          {br.missing.length > 0 && <div className="cf-banner warn" style={{ marginTop: 10, marginBottom: 0 }}>Missing {br.missing.join(", ")} for this month — those lines are left out. Snapshots are taken daily from now on.</div>}
        </Card>
        <Card title="In plain words">
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>
            In {fmonth(month)} Hashway made a <b>{pnl.netProfit >= 0 ? "profit" : "loss"} of {inr(Math.abs(pnl.netProfit))}</b>
            {" "}but operating cash {br.operatingCashFlow >= 0 ? "grew" : "fell"} by <b>{inr(Math.abs(br.operatingCashFlow))}</b>.
          </p>
          <ul style={{ lineHeight: 1.7, paddingLeft: 18 }}>
            {br.lines.filter((l) => !["net_profit", "financing"].includes(l.key) && Math.abs(l.amount) > 1).sort((a, b) => a.amount - b.amount).map((l) => (
              <li key={l.key}>{l.label}: <Money v={l.amount} signed /> {l.amount < 0 ? <Badge tone="warn">cash consumed</Badge> : <Badge tone="good">cash released</Badge>}</li>))}
          </ul>
          {pnl.netProfit > 0 && br.operatingCashFlow < 0 && <div className="cf-banner warn" style={{ marginBottom: 0 }}><b>Profitable but cash-poor:</b>&nbsp;the profit went into stock, receivables or supplier advances instead of the bank.</div>}
          {data.adjustments.filter((a) => a.month.slice(0, 7) === month).length > 0 && <>
            <h3 style={{ marginTop: 12 }}>Adjustments this month</h3>
            {data.adjustments.filter((a) => a.month.slice(0, 7) === month).map((a) => <div key={a.id} className="small">{a.line}: {inr(a.amount)} — {a.note} ({a.created_by})</div>)}
          </>}
        </Card>
      </div>
      {adj && <AdjModal months={data.months} onClose={() => setAdj(false)} onSaved={() => { setAdj(false); reload(); }} />}
    </>
  );
}

function AdjModal({ months, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ month: months[months.length - 1], line: "opex", amount: "", note: "" });
  const save = async () => { try { await call("mis_adjust", f); toast("Adjustment saved."); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal title="Accountant adjustment" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <p className="small muted">For P&L-only entries with no cash, e.g. depreciation or a provision. Positive increases the line.</p>
      <div className="cf-form">
        <Field label="Month"><Select options={months.map((m) => ({ value: m, label: fmonth(m) }))} value={f.month} onChange={(v) => setF({ ...f, month: v })} /></Field>
        <Field label="Line"><Select options={["revenue", "cogs", "marketing", "shipping", "salaries", "opex", "finance_cost", "other"]} value={f.line} onChange={(v) => setF({ ...f, line: v })} /></Field>
        <Field label="Amount (±)"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
      </div>
      <Field label="Explanation (required)"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
    </Modal>
  );
}
