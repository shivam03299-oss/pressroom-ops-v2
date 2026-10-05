import React, { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { call } from "../api.js";
import { useApi, useApp, useToast, Card, Money, inr, inrC, fdate, StatusBadge, Seg, Btn, Field, Input, MoneyInput, Select, Modal, PageHead, Skeleton, ErrorBox, ExportMenu, DataTable, Tile, ChartTip, pct } from "../ui.jsx";

export default function Inventory() {
  const { can } = useApp();
  const { data, error, reload } = useApi("inventory_list");
  const [filter, setFilter] = useState("all");
  const [edit, setEdit] = useState(null);
  const [move, setMove] = useState(null);
  const [range, setRange] = useState(90);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Skeleton h={400} />;
  const t = data.totals;
  const rows = data.rows.filter((r) => filter === "all" || r.status === filter);
  const trend = range === 30 ? data.trend.slice(-31) : data.trend;
  const exp = data.rows.map((r) => ({ SKU: r.sku, Product: r.product, Category: r.category, Units: r.units_on_hand, "Cost/unit": r.cost_per_unit, "Value at cost": r.value, "Retail value": r.retail_value,
    "Sold 30d": r.sold30, "Sold 90d": r.sold90, "Cover days": r.cover_days ?? "no sales", Status: r.status, "In production": r.units_wip, Incoming: r.units_incoming }));
  return (
    <>
      <PageHead title="Inventory" sub="Valued at COST, never MRP. Stock is cash that has been converted into goods.">
        {can("write") && <Btn kind="primary" onClick={() => setEdit({})}>+ SKU</Btn>}
        <ExportMenu name="hashway-inventory" title="Inventory at cost" columns={Object.keys(exp[0] || { SKU: 0 })} rows={exp} />
      </PageHead>
      <div className="cf-grid cf-g6 tiles" style={{ marginBottom: 14 }}>
        <Tile label="Inventory at cost" value={<Money v={t.value} compact />} sub={`${t.units.toLocaleString("en-IN")} units · retail ${inrC(t.retail_value)}`} />
        <Tile label="Coverage" tone={t.coverage_days > 75 ? "warn" : ""} help="Inventory value ÷ average daily COGS (last 30 days)." value={t.coverage_days === null ? "—" : `${t.coverage_days} days`} sub={`COGS 30d ${inrC(data.cogs30)}`} />
        <Tile label="30-day change" tone={data.invGrowthPct - (data.salesGrowthPct ?? 0) > 20 ? "warn" : ""} value={pct(data.invGrowthPct)} sub={`Sales ${pct(data.salesGrowthPct)} over the same period`} />
        <Tile label="Slow-moving" tone={t.slow_value ? "warn" : ""} value={<Money v={t.slow_value} compact />} sub={`${t.slow_count} SKUs with > 90 days of cover`} />
        <Tile label="Dead stock" tone={t.dead_value ? "bad" : ""} value={<Money v={t.dead_value} compact />} sub={`${t.dead_count} SKUs, no sale in 90 days`} />
        <Tile label="In production / incoming" value={<Money v={t.wip_value + t.incoming_value} compact />} sub={`WIP ${inrC(t.wip_value)} · incoming ${inrC(t.incoming_value)}`} />
      </div>
      <div className="cf-grid cf-split" style={{ "--split": "minmax(0,1.4fr) minmax(0,1fr)", marginBottom: 14 }}>
        <Card title="Inventory value at cost" sub="Daily snapshots taken by the 10 AM job" actions={<Seg value={range} onChange={setRange} options={[{ value: 30, label: "30 days" }, { value: 90, label: "90 days" }]} />}>
          {trend.length < 2 ? <p className="muted">The trend fills in as daily snapshots accumulate.</p> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => fdate(d, { year: false })} tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tickFormatter={inrC} tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={60} domain={["auto", "auto"]} />
                <Tooltip content={<ChartTip labelFmt={(l) => fdate(l)} />} />
                <Line dataKey="value" name="Inventory at cost" stroke="var(--s-base)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>)}
        </Card>
        <Card title="Top cash-consuming SKUs" sub="Where the stock money sits">
          <table className="cf-table"><tbody>{data.topCashConsumers.slice(0, 8).map((r) => (
            <tr key={r.id}><td><div>{r.product}</div><div className="small faint">{r.sku} · {r.cover_days === null ? "no recent sales" : `${r.cover_days} days cover`}</div></td>
              <td><StatusBadge s={r.status} /></td><td className="n"><b>{inr(r.value)}</b><div className="small faint">{pct((r.value / t.value) * 100, 1)}</div></td></tr>))}</tbody></table>
        </Card>
      </div>
      <Card actions={<Seg value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "dead", label: "Dead" }, { value: "slow", label: "Slow" }, { value: "healthy", label: "Healthy" }, { value: "out", label: "Out of stock" }]} />}>
        <DataTable rows={rows} onRow={can("write") ? setMove : undefined} empty="No SKUs yet — add them or import a stock file."
          columns={[
            { key: "sku", label: "SKU", render: (r) => <b>{r.sku}</b> },
            { key: "product", label: "Product", ell: true },
            { key: "units_on_hand", label: "Units", num: true, render: (r) => r.units_on_hand.toLocaleString("en-IN") },
            { key: "cost_per_unit", label: "Cost/unit", num: true, render: (r) => inr(r.cost_per_unit) },
            { key: "value", label: "Value at cost", num: true, render: (r) => <b>{inr(r.value)}</b> },
            { key: "sold30", label: "Sold 30d", num: true },
            { key: "cover_days", label: "Cover", num: true, sort: (r) => r.cover_days ?? 1e9, render: (r) => (r.cover_days === null ? "∞" : `${r.cover_days}d`) },
            { key: "last_sale_date", label: "Last sale", render: (r) => fdate(r.last_sale_date, { year: false }) },
            { key: "units_wip", label: "WIP", num: true },
            { key: "status", label: "Status", render: (r) => <StatusBadge s={r.status} /> },
          ]}
          total={{ units_on_hand: rows.reduce((s, r) => s + r.units_on_hand, 0).toLocaleString("en-IN"), value: inr(rows.reduce((s, r) => s + r.value, 0)) }} />
      </Card>
      {edit && <SkuModal sku={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {move && <MoveModal sku={move} onEdit={() => { setEdit(move); setMove(null); }} onClose={() => setMove(null)} onSaved={() => { setMove(null); reload(); }} />}
    </>
  );
}

function SkuModal({ sku, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ id: sku.id, sku: sku.sku || "", product: sku.product || "", category: sku.category || "", cost_per_unit: sku.cost_per_unit ?? "", selling_price: sku.selling_price ?? "",
    units_on_hand: "", units_wip: sku.units_wip ?? 0, units_incoming: sku.units_incoming ?? 0 });
  const save = async () => { try { await call("sku_upsert", f); toast("Saved."); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal title={sku.id ? `Edit ${sku.sku}` : "New SKU"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="cf-form">
        <Field label="SKU"><Input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} /></Field>
        <Field label="Product"><Input value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} /></Field>
        <Field label="Category"><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
        <Field label="Cost per unit" help="What it cost to make/buy (excl. GST you can claim back). NOT the MRP."><MoneyInput value={f.cost_per_unit} onChange={(v) => setF({ ...f, cost_per_unit: v })} /></Field>
        <Field label="Selling price"><MoneyInput value={f.selling_price} onChange={(v) => setF({ ...f, selling_price: v })} /></Field>
        {!sku.id && <Field label="Units on hand now"><Input inputMode="numeric" value={f.units_on_hand} onChange={(e) => setF({ ...f, units_on_hand: e.target.value })} /></Field>}
        <Field label="Units in production"><Input inputMode="numeric" value={f.units_wip} onChange={(e) => setF({ ...f, units_wip: e.target.value })} /></Field>
        <Field label="Units incoming"><Input inputMode="numeric" value={f.units_incoming} onChange={(e) => setF({ ...f, units_incoming: e.target.value })} /></Field>
      </div>
      {sku.id && <p className="small muted">To change units on hand, record a stock movement (receipt, sale, return, write-off or count adjustment) so the history stays intact.</p>}
    </Modal>
  );
}

function MoveModal({ sku, onClose, onSaved, onEdit }) {
  const { boot } = useApp();
  const toast = useToast();
  const [f, setF] = useState({ kind: "adjust", qty: "", date: boot.today, note: "" });
  const save = async () => { try { await call("sku_movement", { sku_id: sku.id, ...f }); toast("Stock updated."); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal title={`${sku.sku} · ${sku.product}`} onClose={onClose} footer={<><Btn onClick={onEdit}>Edit details</Btn><span style={{ flex: 1 }} /><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Record movement</Btn></>}>
      <div className="cf-kv"><span>On hand</span><span>{sku.units_on_hand} units</span><span>Value at cost</span><span>{inr(sku.value)}</span><span>Sold last 30 / 90 days</span><span>{sku.sold30} / {sku.sold90}</span></div>
      <div className="cf-form">
        <Field label="Movement"><Select value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: "adjust", label: "Count adjustment (±)" }, { value: "receipt", label: "Received" }, { value: "sale", label: "Sold" }, { value: "return", label: "Customer return" }, { value: "writeoff", label: "Write-off (damaged)" }]} /></Field>
        <Field label={f.kind === "adjust" ? "Units (+ or −)" : "Units"}><Input value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      </div>
      <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
    </Modal>
  );
}
