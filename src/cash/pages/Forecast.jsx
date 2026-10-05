import React, { useEffect, useState } from "react";
import { call } from "../api.js";
import * as E from "../../../api/_cash-engine.js";
import { useApi, useApp, useToast, Card, Money, inr, fdate, Badge, ConfBadge, Seg, Btn, Field, Input, MoneyInput, Select, Modal, PageHead, Skeleton, ErrorBox, ExportMenu, pct, Help } from "../ui.jsx";

export default function Forecast() {
  const [sc, setSc] = useState("base");
  const { data, error, loading, reload } = useApi("forecast", { scenario: sc });
  const dash = useApi("dashboard");
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const { can } = useApp();
  useEffect(() => { const h = window.location.hash.slice(1); if (h) setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth" }), 400); }, []);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Skeleton h={400} />;
  const f = data.scenarios[sc];
  const cols = ["Week", "Week from", "Opening", "In: confirmed", "In: probable", "In: possible", "In: counted", "Out", "Net", "Closing", "Min required", "Surplus/(gap)"];
  const rows = f.weeks.map((w) => ({ Week: w.index, "Week from": w.start, Opening: w.opening, "In: confirmed": w.inflowConfirmed, "In: probable": w.inflowProbable,
    "In: possible": w.inflowPossible, "In: counted": w.inflow, Out: w.outflow, Net: w.net, Closing: w.closing, "Min required": w.minRequired, "Surplus/(gap)": w.surplus }));
  return (
    <>
      <PageHead title="13-week cash forecast" sub={`Rolls forward automatically · as of ${fdate(data.asOf)} · opening cash ${inr(data.openingCash)} (bank)`}>
        <Seg value={sc} onChange={setSc} options={[{ value: "base", label: "Base" }, { value: "optimistic", label: "Optimistic" }, { value: "worst", label: "Worst" }]} />
        {can("finance") && <Btn onClick={() => setAdding(true)}>+ Expected item</Btn>}
        <ExportMenu name={`hashway-13-week-${sc}-${data.asOf}`} title={`13-week cash forecast — ${sc} case`} columns={cols} rows={rows} />
      </PageHead>

      <div className="cf-grid cf-g4" style={{ marginBottom: 14 }}>
        <Card title="Lowest cash"><div style={{ fontSize: 22, fontWeight: 680 }}><Money v={f.lowest.closing} /></div><div className="small faint">Week {f.lowest.week} · w/c {fdate(f.lowest.start)}</div></Card>
        <Card title="Below reserve"><div style={{ fontSize: 22, fontWeight: 680 }}>{f.firstBelowMinWeek ? <span className="neg">Week {f.firstBelowMinWeek}</span> : <span className="pos">Never</span>}</div><div className="small faint">{f.runOutWeek ? <span className="neg">Cash runs out in week {f.runOutWeek}</span> : "Cash stays positive"}</div></Card>
        <Card title={<>Can commit today <Help tip="Extra spend (e.g. a new production run) you could pay today without breaching the minimum reserve in any week." /></>}><div style={{ fontSize: 22, fontWeight: 680 }}><Money v={f.affordableNow} /></div><div className="small faint">{f.fundingGap ? <span className="neg">Funding gap {inr(f.fundingGap)}</span> : "after keeping the reserve"}</div></Card>
        <Card title="In 13 weeks"><div style={{ fontSize: 22, fontWeight: 680 }}><Money v={f.endingCash} /></div><div className="small faint">In {inr(f.totalInflow)} · Out {inr(f.totalOutflow)}</div></Card>
      </div>

      <Card title="Week by week" sub="Click a week to see every expected receipt and payment in it. Inflows show the full amount by confidence; 'counted' applies the scenario weights.">
        <div className="cf-table-wrap">
          <table className="cf-table">
            <thead><tr><th>Week</th><th className="n">Opening</th><th className="n">Confirmed in</th><th className="n">Probable in</th><th className="n">Possible in</th><th className="n">In counted</th><th className="n">Out</th><th className="n">Net</th><th className="n">Closing</th><th className="n">Min required</th><th className="n">Surplus / gap</th></tr></thead>
            <tbody>{f.weeks.map((w) => (
              <React.Fragment key={w.index}>
                <tr className={`click ${w.belowMin ? "hl" : ""}`} onClick={() => setOpen(open === w.index ? null : w.index)}>
                  <td><b>W{w.index}</b> <span className="small faint">{fdate(w.start, { year: false })}–{fdate(w.end, { year: false })}</span></td>
                  <td className="n">{inr(w.opening)}</td><td className="n">{inr(w.inflowConfirmed)}</td><td className="n">{inr(w.inflowProbable)}</td><td className="n">{inr(w.inflowPossible)}</td>
                  <td className="n"><b>{inr(w.inflow)}</b></td><td className="n">{inr(w.outflow)}</td><td className="n"><Money v={w.net} signed /></td>
                  <td className="n"><b><Money v={w.closing} /></b></td><td className="n">{inr(w.minRequired)}</td><td className="n"><Money v={w.surplus} signed /></td>
                </tr>
                {open === w.index && <tr><td colSpan={11} style={{ background: "var(--surface-2)" }}><WeekDetail flows={f.flows.filter((x) => x.date >= w.start && x.date <= w.end)} A={f.assumptionsUsed} /></td></tr>}
              </React.Fragment>))}</tbody>
          </table>
        </div>
        <p className="small faint" style={{ marginTop: 8 }}>Closing = Opening + In counted − Out. Next week's opening = this week's closing. Rows highlighted are below the minimum reserve.</p>
      </Card>

      <div className="cf-grid cf-g2" style={{ marginTop: 14 }}>
        <Assumptions data={data} sc={sc} onSaved={reload} suggestions={dash.data?.suggestions || []} />
        <Accuracy d={dash.data} />
      </div>
      {adding && <ExpectedModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </>
  );
}

function WeekDetail({ flows, A }) {
  const ins = flows.filter((f) => f.direction === "in"), outs = flows.filter((f) => f.direction === "out");
  const group = (list) => {
    const m = new Map();
    for (const f of list) {
      const k = f.source === "projection" ? `proj:${f.label}` : `${f.source}:${f.ref || f.label}:${f.date}`;
      const g = m.get(k) || { ...f, amount: 0, n: 0 };
      g.amount += f.amount; g.n++; m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  };
  const T = ({ list, dir }) => (
    <table className="cf-table"><tbody>{group(list).map((f, i) => (
      <tr key={i}><td style={{ width: 70 }} className="small">{f.source === "projection" ? "daily" : fdate(f.date, { year: false })}</td>
        <td>{f.label}{f.overdue && <> <Badge tone="bad">overdue</Badge></>}<div className="small faint">{sourceLabel(f.source)}</div></td>
        <td>{dir === "in" ? <ConfBadge c={f.confidence} /> : f.critical ? <Badge tone="warn">critical</Badge> : null}</td>
        <td className="n">{inr(f.amount)}{(dir === "in" || f.linked) && E.confidenceWeight(f.confidence, A) < 1 && <div className="small faint">counts {inr(f.amount * E.confidenceWeight(f.confidence, A))}</div>}</td></tr>))}
      {!list.length && <tr><td className="muted">None</td></tr>}</tbody></table>
  );
  return <div className="cf-grid cf-g2"><div><h3 style={{ margin: "4px 0" }}>Coming in</h3><T list={ins} dir="in" /></div><div><h3 style={{ margin: "4px 0" }}>Going out</h3><T list={outs} dir="out" /></div></div>;
}
const sourceLabel = (s) => ({ receivable: "Receivable", payable: "Bill", po: "Purchase order", recurring: "Recurring", expected: "Manual expected item", projection: "Projected from recent sales", gst: "GST reserve" }[s] || s);

function Assumptions({ data, sc, onSaved, suggestions }) {
  const { boot, can } = useApp();
  const toast = useToast();
  const [vals, setVals] = useState(data.assumptions[sc]);
  useEffect(() => setVals(data.assumptions[sc]), [data, sc]);
  const meta = boot.assumptionMeta;
  const used = data.scenarios[sc].assumptionsUsed;
  const save = async (values = vals, scenario = sc, reason) => {
    try { await call("assumptions_save", { scenario, values, reason: reason || `Edited ${scenario} assumptions` }); toast("Assumptions saved — forecast recalculated."); onSaved(); }
    catch (e) { toast(e.message, "bad"); }
  };
  return (
    <Card id="assumptions" title={`Assumptions · ${sc} case`} sub={`Observed last 4 weeks: ${inr(used.avg_daily_sales)}/day sales, ${used.observed_prepaid_share}% prepaid, ${used.observed_rto_rate}% COD RTO`}
      actions={can("finance") && <Btn size="sm" kind="primary" onClick={() => save()}>Save</Btn>}>
      {suggestions.length > 0 && (
        <div className="cf-banner info"><div className="grow"><b>Suggested from history</b>
          {suggestions.map((s) => (
            <div key={s.key} className="cf-row" style={{ marginTop: 6 }}>
              <span className="small" style={{ color: "var(--text)" }}>{meta[s.key]?.label}: {s.current} → <b>{s.suggested}</b>. {s.why}</span>
              {can("finance") && <Btn size="sm" onClick={() => save({ [s.key]: s.suggested }, s.scenario, `Applied suggestion: ${s.why}`)}>Apply</Btn>}
            </div>))}
        </div></div>)}
      <div className="cf-form" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
        {Object.entries(meta).map(([k, m]) => (
          <Field key={k} label={m.label} help={m.help || undefined}>
            <Input type="number" step={m.step} value={vals[k] ?? ""} disabled={!can("finance")} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
          </Field>))}
      </div>
    </Card>
  );
}

function Accuracy({ d }) {
  if (!d) return <Skeleton h={200} />;
  const a = d.accuracy;
  return (
    <Card id="accuracy" title="Forecast vs actual" sub="Forecast frozen each Monday for that week vs the cash that actually moved">
      {a.rows.length === 0 ? <p className="muted">History builds up automatically every Monday (10 AM job).</p> : (
        <>
          <div className="cf-kv" style={{ marginBottom: 10 }}>
            <span>Average inflow accuracy</span><span>{pct(a.avgAccuracyIn)}</span>
            <span>Average outflow accuracy</span><span>{pct(a.avgAccuracyOut)}</span>
            <span>4-weeks-ahead inflow accuracy</span><span>{pct(d.accuracy4.avgAccuracyIn)}</span>
          </div>
          <div className="cf-table-wrap"><table className="cf-table">
            <thead><tr><th>Week</th><th className="n">Forecast in</th><th className="n">Actual in</th><th className="n">Variance</th><th className="n">Accuracy</th><th className="n">Out acc.</th></tr></thead>
            <tbody>{[...a.rows].reverse().map((r) => (
              <tr key={r.week_start}><td>{fdate(r.week_start, { year: false })}</td><td className="n">{inr(r.forecastIn)}</td><td className="n">{inr(r.actualIn)}</td>
                <td className="n"><Money v={r.varianceIn} signed /></td><td className="n">{pct(r.accuracyIn)}</td><td className="n">{pct(r.accuracyOut)}</td></tr>))}</tbody>
          </table></div>
        </>)}
    </Card>
  );
}

function ExpectedModal({ onClose, onSaved }) {
  const { boot } = useApp();
  const toast = useToast();
  const [f, setF] = useState({ direction: "in", amount: "", txn_date: E.addDays(boot.today, 7), category_code: "income_other", confidence: "probable", description: "" });
  const cats = boot.categories.filter((c) => c.active && (c.direction === f.direction || c.direction === "both") && c.pnl_class !== "revenue");
  const save = async () => {
    try { await call("txn_create", { ...f, nature: "expected" }); toast("Expected item added to the forecast."); onSaved(); } catch (e) { toast(e.message, "bad"); }
  };
  return (
    <Modal title="Add an expected receipt or payment" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Add</Btn></>}>
      <p className="muted small">For one-off future cash that isn't a bill, PO or receivable — e.g. an investor tranche, a refund claim, a one-time fee.</p>
      <div className="cf-form">
        <Field label="Direction"><Seg value={f.direction} onChange={(v) => setF({ ...f, direction: v, category_code: v === "in" ? "income_other" : "expense_other" })} options={[{ value: "in", label: "Money in" }, { value: "out", label: "Money out" }]} /></Field>
        <Field label="Amount"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Expected date"><Input type="date" value={f.txn_date} onChange={(e) => setF({ ...f, txn_date: e.target.value })} /></Field>
        <Field label="Category"><Select options={cats.map((c) => ({ value: c.code, label: `${c.grp} · ${c.name}` }))} value={f.category_code} onChange={(v) => setF({ ...f, category_code: v })} /></Field>
        <Field label="How sure?" help="Confirmed = contracted. Probable = likely. Possible = maybe."><Select options={["confirmed", "probable", "possible"]} value={f.confidence} onChange={(v) => setF({ ...f, confidence: v })} /></Field>
      </div>
      <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
    </Modal>
  );
}
