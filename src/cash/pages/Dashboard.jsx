import React, { useMemo, useState } from "react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useApi, Tile, Card, Money, inr, inrC, fdate, Badge, Link, Skeleton, ErrorBox, PageHead, ChartTip, ConfBadge, UpdateBanner, Seg, pct, useApp } from "../ui.jsx";

const SC = { base: { label: "Base", color: "var(--s-base)" }, optimistic: { label: "Optimistic", color: "var(--s-opt)" }, worst: { label: "Worst", color: "var(--s-worst)" } };

export default function Dashboard() {
  const { data: d, error, loading, reload } = useApi("dashboard");
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading && !d) return <><Skeleton h={90} /><div style={{ height: 14 }} /><Skeleton h={340} /></>;
  return <DashboardView d={d} reload={reload} />;
}

function DashboardView({ d }) {
  const t = d.tiles;
  const base = d.scenarios.base;
  const gapNow = t.surplusNow;
  const atLowest = t.surplusAtLowest;
  return (
    <>
      <PageHead title="Cash dashboard" sub={`As of ${fdate(d.asOf)} · everything below is CASH — not sales, not profit.`}>
        <Link to="/cash/daily" className="cf-btn primary">10 AM update</Link>
      </PageHead>
      <UpdateBanner st={d.updateStatus} />

      <div className="cf-grid cf-g6 tiles">
        <Tile label="Current cash" help="Money actually in the bank and cash accounts today (bank-reported, rolled forward by entries since)."
          value={<Money v={t.currentCash} compact />}
          sub={<>Available {inrC(t.availableCash)}{t.restrictedCash ? ` · ${inrC(t.restrictedCash)} restricted` : ""}{Math.abs(t.unreconciled) > 1 ? <><br /><span className="neg">Ledger differs by {inr(t.unreconciled)}</span></> : null}</>} />
        <Tile label="Expected · next 7 days" help="Weighted by confidence: confirmed 100%, probable/possible at the scenario's weights."
          value={<Money v={t.expected7.inflow} compact />} sub={<>In · out {inrC(t.expected7.outflow)} · net <Money v={t.expected7.inflow - t.expected7.outflow} compact signed /></>} />
        <Tile label="Expected · next 30 days" value={<Money v={t.expected30.inflow} compact />}
          sub={<>In · out {inrC(t.expected30.outflow)} · net <Money v={t.expected30.inflow - t.expected30.outflow} compact signed /></>} />
        <Tile label="Lowest cash · 13 weeks" tone={t.lowest13.closing < 0 ? "bad" : t.lowest13.closing < t.minRequired ? "warn" : ""}
          help="Base case. The lowest week-end balance in the next 13 weeks."
          value={<Money v={t.lowest13.closing} compact />} sub={`Week ${t.lowest13.week} · w/c ${fdate(t.lowest13.start, { year: false })}`} />
        <Tile label="Minimum required cash" help="Higher of your manual reserve and the next 30 days of critical payments (salaries, rent, GST, EMI, critical suppliers, logistics)."
          value={<Money v={t.minRequired} compact />} sub={`${d.minCash.mode === "higher" ? "Higher of manual" : d.minCash.mode} · critical 30d ${inrC(d.minCash.computed)}`} />
        <Tile label="Surplus / gap" tone={atLowest < 0 ? "bad" : gapNow < 0 ? "warn" : ""}
          help="Today: current cash − minimum. At lowest: lowest projected cash − minimum required that week."
          value={<Money v={gapNow} compact signed />} sub={<>At lowest point <Money v={atLowest} compact signed /></>} />
      </div>

      <div className="cf-grid cf-split" style={{ "--split": "minmax(0,2fr) minmax(0,1fr)", marginTop: 14 }}>
        <ForecastChart d={d} />
        <Card title="Alerts" sub={`${d.alerts.length} active`} actions={<Link to="/cash/settings#alerts" className="small">Configure</Link>}>
          {d.alerts.length === 0 ? <p className="muted">No alerts. Cash is above the reserve in all 13 weeks of the base case.</p> :
            d.alerts.map((a) => (
              <div className="cf-alert" key={a.code}>
                <span className="ic" aria-label={a.severity}>{a.severity === "high" ? "🔴" : "🟡"}</span>
                <div><div>{a.message}</div><div className="small faint">{a.severity === "high" ? "High priority" : "Watch"}</div></div>
              </div>))}
        </Card>
      </div>

      <div className="cf-grid cf-g2" style={{ marginTop: 14 }}>
        <Answers d={d} />
        <Scenarios d={d} />
      </div>

      <div className="cf-grid cf-g2" style={{ marginTop: 14 }}>
        <FlowList title="Upcoming inflows · 14 days" rows={d.upcomingInflows} dir="in" link="/cash/receivables" />
        <FlowList title="Upcoming outflows · 14 days" rows={d.upcomingOutflows} dir="out" link="/cash/payables" />
      </div>

      <div className="cf-grid cf-g3" style={{ marginTop: 14 }}>
        <Card title="Supplier payments due · 14 days" actions={<Link to="/cash/payables" className="small">All payables</Link>}>
          <div className="val" style={{ fontSize: 22, fontWeight: 680 }}><Money v={d.supplierDue14} /></div>
          <table className="cf-table" style={{ marginTop: 8 }}><tbody>
            {d.supplierDue.slice(0, 6).map((s) => (
              <tr key={s.id}><td><div>{s.party || "—"}</div><div className="small faint">{s.label}</div></td>
                <td className="n">{s.overdue ? <Badge tone="bad">overdue</Badge> : fdate(s.pay_date, { year: false })}</td><td className="n"><Money v={s.remaining} /></td></tr>))}
          </tbody></table>
        </Card>
        <Card title="Waiting to collect" actions={<Link to="/cash/receivables" className="small">Receivables</Link>}>
          <div className="cf-kv">
            <span>Total receivables</span><span>{inr(d.receivables.total)}</span>
            <span>Overdue</span><span className={d.receivables.overdue ? "neg" : ""}>{inr(d.receivables.overdue)}</span>
            <span>COD overdue</span><span className={d.codOverdue ? "neg" : ""}>{inr(d.codOverdue)}</span>
            <span>Due in 7 days</span><span>{inr(d.receivables.dueNext7)}</span>
          </div>
          <Ageing buckets={d.receivables.buckets} total={d.receivables.total} />
        </Card>
        <Card title="Working capital" actions={<Link to="/cash/working-capital" className="small">Details</Link>}>
          <div className="cf-kv">
            <span>Inventory (at cost)</span><span>{inr(d.workingCapital.inventory)}</span>
            <span>Receivables</span><span>{inr(d.workingCapital.receivables)}</span>
            <span>Supplier advances</span><span>{inr(d.workingCapital.supplierAdvances)}</span>
            <span><b>Cash locked</b></span><span><b>{inr(d.workingCapital.locked)}</b></span>
            <span>Payables (we owe)</span><span>{inr(d.workingCapital.payables)}</span>
            <span>Cash conversion cycle</span><span>{d.ccc.ccc === null ? "—" : `${d.ccc.ccc} days`}</span>
            <span>Inventory coverage</span><span>{d.inventory.totals.coverage_days ?? "—"} days</span>
          </div>
        </Card>
      </div>

      <div className="cf-grid cf-g2" style={{ marginTop: 14 }}>
        <Card title="Forecast accuracy" sub="Each week's forecast (frozen on Monday) vs what actually happened" actions={<Link to="/cash/forecast#accuracy" className="small">Details</Link>}>
          {d.accuracy.rows.length === 0 ? <p className="muted">Builds up automatically — the forecast is frozen every Monday at 10 AM and compared with actual cash a week later.</p> : (
            <div className="cf-kv">
              <span>Avg inflow accuracy ({d.accuracy.rows.length} weeks)</span><span>{pct(d.accuracy.avgAccuracyIn)}</span>
              <span>Avg outflow accuracy</span><span>{pct(d.accuracy.avgAccuracyOut)}</span>
              <span>Collections vs forecast</span><span>{d.accuracy.collectionRatio === null ? "—" : pct(d.accuracy.collectionRatio * 100)}</span>
              <span>Last week</span><span><Money v={d.accuracy.rows.at(-1).actualIn} /> vs <Money v={d.accuracy.rows.at(-1).forecastIn} /></span>
            </div>)}
          {d.suggestions.length > 0 && <div className="cf-banner info" style={{ marginTop: 12, marginBottom: 0 }}><div className="grow">{d.suggestions.length} assumption update{d.suggestions.length > 1 ? "s" : ""} suggested from history.</div><Link to="/cash/forecast#assumptions" className="cf-btn sm">Review</Link></div>}
        </Card>
        <Card title="Bank & cash accounts" actions={<Link to="/cash/bank" className="small">Reconcile</Link>}>
          <table className="cf-table"><thead><tr><th>Account</th><th className="n">Bank</th><th className="n">Per ledger</th><th className="n">Difference</th></tr></thead><tbody>
            {d.position.accounts.map((a) => (
              <tr key={a.id}><td>{a.name}{a.restricted ? <div className="small faint">{inrC(a.restricted)} restricted</div> : null}{a.reportedDate && <div className="small faint">bank figure as of {fdate(a.reportedDate, { year: false })}</div>}</td>
                <td className="n"><Money v={a.bank} /></td><td className="n"><Money v={a.system} /></td>
                <td className="n">{Math.abs(a.difference) > 1 ? <Badge tone="bad">{inr(a.difference)}</Badge> : <Badge tone="good">✓ matches</Badge>}</td></tr>))}
            <tr className="total"><td>Total</td><td className="n"><Money v={d.position.total} /></td><td className="n"><Money v={d.position.system} /></td><td className="n">{inr(d.position.unreconciled)}</td></tr>
          </tbody></table>
        </Card>
      </div>
    </>
  );
}

export function Ageing({ buckets, total }) {
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
      {buckets.map((b) => (
        <div key={b.key} style={{ display: "grid", gridTemplateColumns: "88px 1fr 90px", gap: 8, alignItems: "center", fontSize: 12 }}>
          <span className="muted">{b.label}</span>
          <div className="cf-bar"><i style={{ width: `${total ? (b.amount / total) * 100 : 0}%`, background: b.min > 30 ? "var(--s-worst)" : "var(--s-base)" }} /></div>
          <span className="num">{inrC(b.amount)}</span>
        </div>))}
    </div>
  );
}

function ForecastChart({ d }) {
  const [show, setShow] = useState({ base: true, optimistic: true, worst: true });
  const [mode, setMode] = useState("balance");
  const data = useMemo(() => {
    const rows = d.actual.filter((w) => !w.partial).map((w) => ({ wk: w.start, actual: w.closing, inAct: w.inflow, outAct: w.outflow }));
    const sb = d.scenarios.base.weeks;
    // join the actual line to week 1's opening so the lines connect
    if (rows.length) rows[rows.length - 1].base = rows[rows.length - 1].optimistic = rows[rows.length - 1].worst = rows[rows.length - 1].actual;
    sb.forEach((w, i) => rows.push({ wk: w.start, label: `W${w.index}`, base: w.closing, optimistic: d.scenarios.optimistic.weeks[i].closing, worst: d.scenarios.worst.weeks[i].closing,
      min: w.minRequired, inConfirmed: w.inflowConfirmed, inProbable: w.inflowProbable, inPossible: w.inflowPossible, inCounted: w.inflow, out: w.outflow }));
    return rows;
  }, [d]);
  const minLine = d.tiles.minRequired;
  return (
    <Card title="13-week cash flow" sub="Week-end cash: actual (last 8 weeks) and forecast by scenario"
      actions={<Seg value={mode} onChange={setMode} options={[{ value: "balance", label: "Balance" }, { value: "flows", label: "In vs out" }]} />}>
      {mode === "balance" ? (
        <>
          <div className="cf-legend" style={{ marginBottom: 8 }}>
            <span><i style={{ background: "var(--s-actual)" }} />Actual</span>
            {Object.entries(SC).map(([k, s]) => (
              <label key={k} className="cf-check"><input type="checkbox" checked={show[k]} onChange={() => setShow({ ...show, [k]: !show[k] })} /><i style={{ background: s.color }} />{s.label}</label>))}
            <span><i className="dash" />Minimum required</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="wk" tickFormatter={(v) => fdate(v, { year: false })} tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} minTickGap={18} />
              <YAxis tickFormatter={inrC} tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={64} />
              <Tooltip content={<ChartTip labelFmt={(l) => `Week of ${fdate(l)}`} />} />
              <ReferenceLine y={0} stroke="var(--border-strong)" />
              <ReferenceLine x={d.scenarios.base.weeks[0].start} stroke="var(--border-strong)" strokeDasharray="2 3" label={{ value: "today", position: "insideTopLeft", fontSize: 10, fill: "var(--text-3)" }} />
              <Line dataKey="min" name="Minimum required" stroke="var(--critical)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} />
              <Line dataKey="actual" name="Actual" stroke="var(--s-actual)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              {show.worst && <Line dataKey="worst" name="Worst case" stroke={SC.worst.color} strokeWidth={2} dot={false} />}
              {show.optimistic && <Line dataKey="optimistic" name="Optimistic" stroke={SC.optimistic.color} strokeWidth={2} dot={false} />}
              {show.base && <Line dataKey="base" name="Base case" stroke={SC.base.color} strokeWidth={2.5} dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
          <p className="small faint">Minimum required today: {inr(minLine)}. Solid grey = real bank cash; coloured = forecast. Forecast inflows are weighted by confidence.</p>
        </>
      ) : (
        <>
          <div className="cf-legend" style={{ marginBottom: 8 }}>
            <span><i className="sq" style={{ background: "var(--seq-1)" }} />Confirmed in</span>
            <span><i className="sq" style={{ background: "var(--seq-2)" }} />Probable in</span>
            <span><i className="sq" style={{ background: "var(--seq-3)" }} />Possible in</span>
            <span><i className="sq" style={{ background: "var(--s-out)" }} />Out</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data.filter((r) => r.label)} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={inrC} tick={{ fontSize: 11, fill: "var(--text-3)" }} axisLine={false} tickLine={false} width={64} />
              <Tooltip content={<ChartTip labelFmt={(l, p) => `${l} · w/c ${fdate(p?.[0]?.payload?.wk)}`}
                extra={(p) => <div className="r" style={{ marginTop: 4 }}><span>Inflow counted (weighted)</span><span>{inr(p[0]?.payload?.inCounted)}</span></div>} />} />
              <Bar dataKey="inConfirmed" name="Confirmed in" stackId="in" fill="var(--seq-1)" stroke="var(--surface)" strokeWidth={1} />
              <Bar dataKey="inProbable" name="Probable in" stackId="in" fill="var(--seq-2)" stroke="var(--surface)" strokeWidth={1} />
              <Bar dataKey="inPossible" name="Possible in" stackId="in" fill="var(--seq-3)" stroke="var(--surface)" strokeWidth={1} radius={[4, 4, 0, 0]} />
              <Bar dataKey="out" name="Out" fill="var(--s-out)" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="small faint">Inflow bars show the full amount by confidence; the balance line only counts probable/possible at the scenario's weights.</p>
        </>
      )}
    </Card>
  );
}

function Answers({ d }) {
  const b = d.scenarios.base;
  const w = d.workingCapital;
  const top = [...w.levers].sort((a, x) => x.release - a.release)[0];
  const q = [
    ["How much cash do we have?", <><Money v={d.tiles.currentCash} /> in the bank{Math.abs(d.tiles.unreconciled) > 1 ? <span className="neg"> (ledger differs by {inr(d.tiles.unreconciled)})</span> : ""}</>],
    ["How much will we have in 13 weeks?", <><Money v={b.endingCash} /> base · <Money v={d.scenarios.worst.endingCash} /> worst · <Money v={d.scenarios.optimistic.endingCash} /> optimistic</>],
    ["When do we run out if nothing changes?", b.runOutWeek ? <span className="neg">Week {b.runOutWeek} (w/c {fdate(b.weeks[b.runOutWeek - 1].start)})</span>
      : d.scenarios.worst.runOutWeek ? <>Not in the base case — but in the worst case, week {d.scenarios.worst.runOutWeek}</> : <>Not within 13 weeks, even in the worst case</>],
    ["How much is locked in inventory?", <><Money v={w.inventory} /> at cost ({d.inventory.totals.coverage_days ?? "—"} days of cover)</>],
    ["How much do we owe suppliers?", <><Money v={w.supplierPayables} /> on bills + received POs; <Money v={d.payables.total} /> all payables & PO balances</>],
    ["How much are we waiting to collect?", <><Money v={d.receivables.total} /> ({inr(d.receivables.overdue)} overdue)</>],
    ["How much production can we afford?", b.fundingGap > 0 ? <span className="neg">None right now — {inr(b.fundingGap)} short of the reserve at the low point</span>
      : <><Money v={b.affordableNow} /> could be committed today without breaching the reserve in any week</>],
    ["What needs to change?", b.fundingGap > 0 || b.firstBelowMinWeek ? <>Biggest lever: <b>{top.label}</b> → frees {inr(top.release)}. See Working capital.</> : <>Nothing urgent. Keep the reserve and watch the alerts.</>],
  ];
  return (
    <Card title="The answers" sub="Plain-language answers, base case unless stated">
      <div style={{ display: "grid", gap: 10 }}>
        {q.map(([k, v]) => <div key={k}><div className="small muted">{k}</div><div style={{ fontWeight: 560 }}>{v}</div></div>)}
      </div>
    </Card>
  );
}

function Scenarios({ d }) {
  return (
    <Card title="Scenarios" sub="Same commitments; different sales, collections and returns" actions={<Link to="/cash/forecast" className="small">Assumptions</Link>}>
      <table className="cf-table">
        <thead><tr><th></th>{Object.entries(SC).map(([k, s]) => <th key={k} className="n"><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />{s.label}</th>)}</tr></thead>
        <tbody>
          {[["Lowest cash", (x) => <Money v={x.lowest.closing} />], ["Lowest in week", (x) => `Week ${x.lowest.week}`],
            ["Below reserve from", (x) => (x.firstBelowMinWeek ? <Badge tone="bad">Week {x.firstBelowMinWeek}</Badge> : <Badge tone="good">Never</Badge>)],
            ["Cash runs out", (x) => (x.runOutWeek ? <Badge tone="bad">Week {x.runOutWeek}</Badge> : "—")],
            ["Cash in 13 weeks", (x) => <Money v={x.endingCash} />],
            ["Can still commit today", (x) => <Money v={x.affordableNow} />],
            ["Funding gap", (x) => (x.fundingGap ? <span className="neg">{inr(x.fundingGap)}</span> : "—")]].map(([lbl, f]) => (
            <tr key={lbl}><td className="muted">{lbl}</td>{Object.keys(SC).map((k) => <td key={k} className="n">{f(d.scenarios[k])}</td>)}</tr>))}
        </tbody>
      </table>
    </Card>
  );
}

function FlowList({ title, rows, dir, link }) {
  const total = rows.reduce((s, r) => s + (dir === "in" ? r.weighted : r.amount), 0);
  return (
    <Card title={title} sub={`${rows.length} items · ${inr(total)}${dir === "in" ? " counted after confidence" : ""}`} actions={<Link to={link} className="small">Open</Link>}>
      {rows.length === 0 ? <p className="muted">Nothing scheduled.</p> : (
        <div className="cf-table-wrap" style={{ maxHeight: 300, overflowY: "auto" }}>
          <table className="cf-table"><tbody>
            {rows.slice(0, 40).map((r, i) => (
              <tr key={i}><td style={{ width: 70 }} className="small">{fdate(r.date, { year: false })}{r.overdue && <div><Badge tone="bad">overdue</Badge></div>}</td>
                <td className="ell">{r.label}</td><td>{dir === "in" ? <ConfBadge c={r.confidence} /> : r.critical ? <Badge tone="warn">critical</Badge> : null}</td>
                <td className="n"><Money v={r.amount} /></td></tr>))}
          </tbody></table>
        </div>)}
    </Card>
  );
}
