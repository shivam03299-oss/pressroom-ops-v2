import React, { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { useApi, Card, Money, inr, inrC, fdate, fmonth, PageHead, Skeleton, ErrorBox, ExportMenu, Tile, ChartTip, Help } from "../ui.jsx";

export default function WorkingCapital() {
  const [levers, setLevers] = useState({ inventoryReductionPct: 15, collectFasterDays: 7, supplierCreditDays: 15 });
  const { data: w, error, reload } = useApi("working_capital", { levers });
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!w) return <Skeleton h={400} />;
  const parts = [
    { name: "Inventory (at cost)", v: w.inventory, color: "var(--s-base)" },
    { name: "Receivables", v: w.receivables, color: "var(--s-worst)" },
    { name: "Supplier advances", v: w.supplierAdvances, color: "var(--s-opt)" },
  ];
  const trend = w.cccTrend;
  return (
    <>
      <PageHead title="Working capital" sub="Where Hashway's money is locked up, and what each change would release.">
        <ExportMenu name="hashway-working-capital" title="Working-capital report" columns={["Item", "Amount"]}
          rows={[...parts.map((p) => ({ Item: p.name, Amount: p.v })), { Item: "Total cash locked", Amount: w.locked }, { Item: "Payables (supplier credit)", Amount: -w.payables },
            { Item: "Net working capital", Amount: w.netWorkingCapital }, ...w.levers.map((l) => ({ Item: `Release: ${l.label}`, Amount: l.release }))]} />
      </PageHead>
      <div className="cf-grid cf-g2">
        <Card title="Cash locked" sub="Money that has left the bank but hasn't come back as cash yet">
          <div style={{ fontSize: 28, fontWeight: 700 }}><Money v={w.locked} /></div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={parts} layout="vertical" margin={{ top: 8, right: 70, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: "var(--text-2)" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip labelFmt={(l) => l} />} cursor={{ fill: "var(--surface-2)" }} />
              <Bar dataKey="v" name="Locked" radius={[0, 4, 4, 0]} barSize={18} label={{ position: "right", formatter: inrC, fontSize: 12, fill: "var(--text)" }}>
                {parts.map((p) => <Cell key={p.name} fill={p.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="cf-kv" style={{ marginTop: 8 }}>
            <span>Less: payables (suppliers financing us)</span><span>−{inr(w.payables)}</span>
            <span><b>Net working capital</b></span><span><b>{inr(w.netWorkingCapital)}</b></span>
          </div>
        </Card>
        <Card title="What would release cash?" sub="Move the levers — numbers recalculate from the last 30 days of sales and COGS">
          {w.levers.map((l) => {
            const key = { inventory: "inventoryReductionPct", receivables: "collectFasterDays", payables: "supplierCreditDays" }[l.key];
            const max = { inventory: 50, receivables: 30, payables: 60 }[l.key];
            return (
              <div key={l.key} style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                <div className="cf-row"><span style={{ flex: 1 }}>{l.label}</span><b className="num pos">+{inr(l.release)}</b></div>
                <input type="range" min={0} max={max} value={levers[key]} style={{ width: "100%" }} aria-label={l.label}
                  onChange={(e) => setLevers({ ...levers, [key]: Number(e.target.value) })} />
              </div>);
          })}
          <div className="cf-row" style={{ paddingTop: 10, borderTop: "1px solid var(--border-strong)" }}><b style={{ flex: 1 }}>All three together</b><b className="num pos">+{inr(w.totalRelease)}</b></div>
        </Card>
      </div>

      <div className="cf-grid cf-g4" style={{ marginTop: 14 }}>
        <Tile label="Inventory days (DIO)" help="Inventory at cost ÷ daily COGS" value={w.ccc.dio === null ? "—" : `${w.ccc.dio} d`} />
        <Tile label="Receivable days (DSO)" help="Receivables ÷ daily net sales" value={w.ccc.dso === null ? "—" : `${w.ccc.dso} d`} />
        <Tile label="Payable days (DPO)" help="Supplier payables ÷ daily COGS" value={w.ccc.dpo === null ? "—" : `${w.ccc.dpo} d`} />
        <Tile label="Cash conversion cycle" tone={w.ccc.ccc > 60 ? "warn" : ""} help="DIO + DSO − DPO: days between paying for stock and getting cash from customers. Lower is better."
          value={w.ccc.ccc === null ? "—" : `${w.ccc.ccc} days`}
          sub={trend.length > 1 && trend.at(-2).ccc !== null ? (w.ccc.ccc < trend.at(-2).ccc ? `▼ improving vs ${fmonth(trend.at(-2).month)} (${trend.at(-2).ccc}d)` : `▲ worsening vs ${fmonth(trend.at(-2).month)} (${trend.at(-2).ccc}d)`) : null} />
      </div>

      <div className="cf-grid cf-g2" style={{ marginTop: 14 }}>
        <Card title="Cash conversion cycle trend" sub="Month-end, in days">
          <div className="cf-legend" style={{ marginBottom: 6 }}>
            <span><i style={{ background: "var(--s-actual)" }} />CCC</span><span><i style={{ background: "var(--s-base)" }} />DIO</span>
            <span><i style={{ background: "var(--s-worst)" }} />DSO</span><span><i style={{ background: "var(--s-opt)" }} />DPO</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="month" tickFormatter={fmonth} tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={40} unit="d" />
              <Tooltip content={<ChartTip labelFmt={fmonth} valueFmt={(v) => `${v} days`} />} />
              <Line dataKey="ccc" name="CCC" stroke="var(--s-actual)" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line dataKey="dio" name="DIO" stroke="var(--s-base)" strokeWidth={2} dot={false} />
              <Line dataKey="dso" name="DSO" stroke="var(--s-worst)" strokeWidth={2} dot={false} />
              <Line dataKey="dpo" name="DPO" stroke="var(--s-opt)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Working capital over time" sub="Daily snapshots">
          <div className="cf-legend" style={{ marginBottom: 6 }}>
            <span><i style={{ background: "var(--s-base)" }} />Inventory</span><span><i style={{ background: "var(--s-worst)" }} />Receivables</span>
            <span><i style={{ background: "var(--s-opt)" }} />Payables</span><span><i style={{ background: "var(--s-actual)" }} />Cash</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={w.wcTrend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="snap_date" tickFormatter={(d) => fdate(d, { year: false })} tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tickFormatter={inrC} tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={60} />
              <Tooltip content={<ChartTip labelFmt={(l) => fdate(l)} />} />
              <Line dataKey="inventory_value" name="Inventory" stroke="var(--s-base)" strokeWidth={2} dot={false} />
              <Line dataKey="receivables" name="Receivables" stroke="var(--s-worst)" strokeWidth={2} dot={false} />
              <Line dataKey="payables" name="Payables" stroke="var(--s-opt)" strokeWidth={2} dot={false} />
              <Line dataKey="cash" name="Cash" stroke="var(--s-actual)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <p className="small faint" style={{ marginTop: 10 }}>Last 30 days: net sales {inr(w.sales.netSales30)}, COGS {inr(w.sales.cogs30)}, production cash paid {inr(w.sales.purchases30)}.
        <Help tip="DPO uses supplier bills plus balances on POs whose goods have arrived. Advance installments on undelivered POs are commitments, not payables." /></p>
    </>
  );
}
