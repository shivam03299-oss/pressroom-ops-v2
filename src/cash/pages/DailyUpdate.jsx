import React, { useEffect, useMemo, useState } from "react";
import { call } from "../api.js";
import * as E from "../../../api/_cash-engine.js";
import { useApp, useToast, useReason, Card, Field, MoneyInput, Input, Select, Btn, Badge, StatusBadge, Money, inr, fdate, fdatetime, PageHead, Skeleton, ErrorBox, UpdateBanner, Help } from "../ui.jsx";

const STEPS = [
  { key: "sales", label: "1 · Sales" },
  { key: "collections", label: "2 · Cash collected" },
  { key: "payments", label: "3 · Cash paid" },
  { key: "bank", label: "4 · Bank balances" },
  { key: "commitments", label: "5 · New commitments" },
  { key: "review", label: "Review & submit" },
];

export default function DailyUpdate() {
  const { boot, can } = useApp();
  const toast = useToast();
  const [ask, reasonModal] = useReason();
  const [date, setDate] = useState(E.addDays(boot.today, -1));
  const [ctx, setCtx] = useState(null);
  const [p, setP] = useState(null);
  const [err, setErr] = useState(null);
  const [step, setStep] = useState("sales");
  const [mode, setMode] = useState("new");
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverV, setServerV] = useState(null);
  const [done, setDone] = useState(null);
  const [dirty, setDirty] = useState(false);
  const pickDate = (d) => {
    if (d === date) return;
    if (dirty && !window.confirm("You have unsaved entries for this day. Switch date and discard them? (Use 'Save draft' to keep them.)")) return;
    setDate(d);
  };

  const load = async (d = date) => {
    setErr(null); setCtx(null); setDone(null); setServerV(null); setAck(false); setNote("");
    try {
      const r = await call("daily_get", { date: d });
      setCtx(r);
      const st = r.existing?.status;
      setMode(st === "reopened" ? "correct" : "new");
      setP(r.payload); setDirty(false);
      setStep(st === "submitted" || st === "partial" ? "review" : "sales");
    } catch (e) { setErr(e); }
  };
  useEffect(() => { load(date); }, [date]); // eslint-disable-line

  const v = useMemo(() => p && ctx ? E.validateDailyUpdate(p, { today: ctx.today, existingStatus: ctx.existing?.status, mode, accounts: ctx.accounts,
    prevClosing: ctx.prevClosing, averages: ctx.averages, ledgerSameDay: ctx.ledgerSameDay, settings: ctx.settings }) : null, [p, ctx, mode]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  if (err) return <ErrorBox error={err} retry={() => load()} />;
  if (!ctx || !p) return <Skeleton h={400} />;

  const locked = ["submitted", "partial"].includes(ctx.existing?.status);
  const writable = can("write") && !locked;
  const set = (fn) => { setDirty(true); setP((old) => { const n = structuredClone(old); fn(n); return n; }); };
  const markDone = (k, val = true) => set((n) => { n.sections = { ...n.sections, [k]: val }; });
  const fieldErr = (f) => v?.errors.find((e) => e.field === f)?.msg;
  const fieldWarn = (f) => v?.warnings.find((e) => e.field === f)?.msg;
  const accountOpts = ctx.accounts.map((a) => ({ value: a.id, label: a.name }));
  const multi = ctx.accounts.length > 1;

  const saveDraft = async () => {
    setBusy(true);
    try { await call("daily_save_draft", { payload: p }); setDirty(false); toast("Draft saved — you can finish later."); }
    catch (e) { toast(e.message, "bad"); } finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setServerV(null);
    try {
      const r = await call("daily_submit", { payload: p, acknowledged: ack, recon_note: note, mode });
      setDone(r);
      toast(r.status === "submitted" ? "Finance update submitted ✓" : "Saved as PARTIAL — finish the missing sections later.");
      load(date);
    } catch (e) {
      if (e.body?.validation) setServerV(e.body.validation);
      toast(e.message, "bad");
    } finally { setBusy(false); }
  };
  const reopen = async () => {
    const reason = await ask(`Correct ${fdate(date)}`, "Everything posted from this day will be reversed (kept in the audit log) and the form reopened with the same numbers for you to fix.");
    if (!reason) return;
    try { await call("daily_reopen", { date, reason }); toast("Day reopened for correction."); load(date); } catch (e) { toast(e.message, "bad"); }
  };

  return (
    <>
      {reasonModal}
      <PageHead title="10 AM finance update" sub="Enter yesterday's numbers. Takes 5–10 minutes. Sales are not cash — this form keeps them separate.">
        <Field label="Business day being reported" style={{ width: 200 }}>
          <Input type="date" value={date} max={ctx.today} onChange={(e) => e.target.value && pickDate(e.target.value)} />
        </Field>
      </PageHead>
      <UpdateBanner st={ctx.status} compact />

      <div className="cf-row" style={{ marginBottom: 12 }}>
        <span className="muted">Status for {fdate(date)}:</span>
        {ctx.existing ? <StatusBadge s={ctx.existing.status} /> : <Badge>not started</Badge>}
        {ctx.existing?.is_late && <Badge tone="warn">submitted late</Badge>}
        {ctx.existing?.submitted_at && <span className="small faint">by {ctx.existing.submitted_by} · {fdatetime(ctx.existing.submitted_at)}</span>}
        {mode === "correct" && <Badge tone="warn">correcting a previously submitted day</Badge>}
        <span style={{ flex: 1 }} />
        {locked && can("finance") && <Btn onClick={reopen}>Correct this day…</Btn>}
      </div>

      {done && done.notes?.length > 0 && (
        <div className="cf-banner info"><div className="grow"><b>Posted, with notes:</b><ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{done.notes.map((n) => <li key={n}>{n}</li>)}</ul></div></div>)}

      <div className="cf-steps" style={{ marginBottom: 12 }}>
        {STEPS.map((s) => (
          <button key={s.key} className={`cf-step ${step === s.key ? "on" : ""} ${p.sections?.[s.key] ? "done" : ""}`} onClick={() => setStep(s.key)}>
            {p.sections?.[s.key] ? "✓ " : ""}{s.label}
          </button>))}
      </div>

      <div className="cf-grid cf-split" style={{ "--split": "minmax(0,1fr) 300px" }}>
        <div className="cf-card" style={{ overflow: "visible" }}>
          <div className="bd" style={{ minHeight: 360 }}>
            <fieldset disabled={!writable} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              {step === "sales" && <Sales p={p} set={set} fieldErr={fieldErr} fieldWarn={fieldWarn} />}
              {step === "collections" && <Collections p={p} set={set} accountOpts={accountOpts} multi={multi} fieldWarn={fieldWarn} />}
              {step === "payments" && <Payments p={p} set={set} accountOpts={accountOpts} multi={multi} ctx={ctx} cats={boot.categories} fieldWarn={fieldWarn} />}
              {step === "bank" && <Bank p={p} set={set} ctx={ctx} v={v} accountOpts={accountOpts} fieldErr={fieldErr} />}
              {step === "commitments" && <Commitments p={p} set={set} cats={boot.categories} />}
            </fieldset>
            {step === "review" && <Review p={p} v={locked ? storedV(ctx, v) : serverV || v} ctx={ctx} locked={locked} ack={ack} setAck={setAck} note={note} setNote={setNote} />}
          </div>
          {writable && (
            <div className="cf-sticky-foot">
              {step !== "review" && <>
                <label className="cf-check"><input type="checkbox" checked={!!p.sections?.[step]} onChange={(e) => markDone(step, e.target.checked)} />
                  <span>{step === "commitments" ? "Done — including 'nothing new today'" : "This section is complete (blank = nothing today)"}</span></label>
                <span style={{ flex: 1 }} />
                <Btn onClick={saveDraft} loading={busy}>Save draft</Btn>
                <Btn kind="primary" onClick={() => { markDone(step); setStep(STEPS[STEPS.findIndex((s) => s.key === step) + 1].key); }}>Next →</Btn>
              </>}
              {step === "review" && <>
                <span className="small muted">{v.errors.length ? `${v.errors.length} error(s) to fix` : v.warnings.length ? `${v.warnings.length} warning(s) to review` : "All checks passed"}</span>
                <span style={{ flex: 1 }} />
                <Btn onClick={saveDraft} loading={busy}>Save draft</Btn>
                <Btn kind="primary" loading={busy} disabled={v.errors.length > 0 || (v.warnings.length > 0 && !ack) || (!v.reconOk && !note.trim())} onClick={submit}>
                  {v.status === "partial" ? "Submit as partial" : "Submit update"}
                </Btn>
              </>}
            </div>)}
        </div>
        <Summary v={locked ? storedV(ctx, v) : v} ctx={ctx} date={date} setDate={pickDate} />
      </div>
    </>
  );
}

/** A submitted day shows the warnings that were accepted at submission time. */
function storedV(ctx, v) {
  return { ...v, errors: [], warnings: ctx.existing?.validation?.warnings || [], recon: ctx.existing?.validation?.recon || v.recon };
}

function Sales({ p, set, fieldErr, fieldWarn }) {
  const s = p.sales;
  return (
    <>
      <h2>Sales from Shopify</h2>
      <p className="muted small" style={{ margin: "4px 0 14px" }}>This is what customers <b>ordered</b>. It is <b>not cash</b> — prepaid money arrives via the gateway in 1–3 days, COD only when the courier remits it.</p>
      <div className="cf-form">
        {E.SALES_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} help={f.help} error={fieldErr(`sales.${f.key}`)} hint={fieldWarn(`sales.${f.key}`)}>
            {f.integer ? <Input inputMode="numeric" value={s[f.key]} onChange={(e) => set((n) => { n.sales[f.key] = e.target.value.replace(/[^\d]/g, ""); })} placeholder="0" />
              : <MoneyInput value={s[f.key]} invalid={!!fieldErr(`sales.${f.key}`)} warn={!!fieldWarn(`sales.${f.key}`)} onChange={(x) => set((n) => { n.sales[f.key] = x; })} />}
          </Field>))}
        <Field label="Units sold (optional)" help="Helps the inventory and COGS numbers.">
          <Input inputMode="numeric" value={s.units_sold ?? ""} onChange={(e) => set((n) => { n.sales.units_sold = e.target.value.replace(/[^\d]/g, ""); })} placeholder="—" />
        </Field>
      </div>
      {!E.isBlank(s.order_value) && (
        <div className="cf-kv" style={{ marginTop: 16, maxWidth: 420 }}>
          <span>Net sales (for MIS)</span><span>{inr(E.num(s.order_value) - E.num(s.cancellations) - E.num(s.refunds) - E.num(s.rto_value))}</span>
          <span>Cash received from these sales today</span><span>₹0 — comes later</span>
        </div>)}
    </>
  );
}

function Collections({ p, set, accountOpts, multi, fieldWarn }) {
  return (
    <>
      <h2>Cash actually received yesterday</h2>
      <p className="muted small" style={{ margin: "4px 0 14px" }}>Only money that <b>landed in a bank/cash account</b>. Check your bank app or the settlement emails. Leave blank if nothing came in.</p>
      <table className="cf-table">
        <thead><tr><th>Source</th><th className="n" style={{ width: 170 }}>Amount received</th>{multi && <th style={{ width: 200 }}>Into account</th>}</tr></thead>
        <tbody>{p.collections.map((c, i) => {
          const meta = E.COLLECTION_LINES.find((l) => l.key === c.key) || {};
          return (
            <tr key={c.key + i}>
              <td>{meta.label || c.key}{fieldWarn(`collection.${c.key}`) && <div className="small" style={{ color: "var(--warn)" }}>{fieldWarn(`collection.${c.key}`)}</div>}</td>
              <td><MoneyInput value={c.amount} placeholder="—" warn={!!fieldWarn(`collection.${c.key}`)} onChange={(x) => set((n) => { n.collections[i].amount = x; })} /></td>
              {multi && <td><Select options={accountOpts} value={c.account_id} onChange={(x) => set((n) => { n.collections[i].account_id = x; })} /></td>}
            </tr>);
        })}</tbody>
      </table>
    </>
  );
}

function Payments({ p, set, accountOpts, multi, ctx, cats, fieldWarn }) {
  const outCats = cats.filter((c) => c.active && (c.direction === "out" || c.direction === "both") && c.code !== "transfer");
  const catOpts = [...new Set(outCats.map((c) => c.grp))].map((g) => ({ group: g, options: outCats.filter((c) => c.grp === g).map((c) => ({ value: c.code, label: c.name })) }));
  const linkOpts = [
    ...ctx.openInstallments.map((i) => ({ value: `po_installment:${i.id}`, label: `${i.po_number} · ${i.label} · ${i.party_name || ""} — due ${fdate(i.due_date, { year: false })}, ${inr(i.amount - i.paid_amount)} left` })),
    ...ctx.openPayables.map((b) => ({ value: `payable:${b.id}`, label: `${b.party_name || "Bill"} · ${b.description || b.reference || ""} — due ${fdate(b.due_date, { year: false })}, ${inr(b.amount - b.paid_amount)} left` })),
  ];
  return (
    <>
      <h2>Cash actually paid yesterday</h2>
      <p className="muted small" style={{ margin: "4px 0 14px" }}>Money that <b>left</b> the bank/cash. A bill you received but haven't paid goes in step 5, not here. If a payment settles a PO installment or bill, link it so the forecast stops expecting it.</p>
      <div className="cf-table-wrap">
        <table className="cf-table">
          <thead><tr><th>What for</th><th className="n" style={{ width: 150 }}>Amount paid</th>{multi && <th style={{ width: 170 }}>From account</th>}<th>Paid to / settles</th></tr></thead>
          <tbody>{p.payments.map((x, i) => {
            const meta = E.PAYMENT_LINES.find((l) => l.key === x.key);
            const extra = !meta || p.payments.findIndex((y) => y.key === x.key) !== i;
            return (
              <tr key={i}>
                <td style={{ minWidth: 170 }}>
                  {extra ? <Select options={catOpts} value={x.category_code} onChange={(c) => set((n) => { n.payments[i].category_code = c; })} />
                    : <>{meta.label}{x.category_code !== meta.category && <div className="small faint">{cats.find((c) => c.code === x.category_code)?.name}</div>}</>}
                  {fieldWarn(`payment.${x.key}`) && <div className="small" style={{ color: "var(--warn)" }}>{fieldWarn(`payment.${x.key}`)}</div>}
                </td>
                <td><MoneyInput value={x.amount} placeholder="—" warn={!!fieldWarn(`payment.${x.key}`)} onChange={(v) => set((n) => { n.payments[i].amount = v; })} /></td>
                {multi && <td><Select options={accountOpts} value={x.account_id} onChange={(v) => set((n) => { n.payments[i].account_id = v; })} /></td>}
                <td style={{ minWidth: 220 }}>
                  {!E.isBlank(x.amount) && (
                    <div style={{ display: "grid", gap: 6 }}>
                      <Input placeholder="Vendor (optional)" value={x.party_name || ""} onChange={(e) => set((n) => { n.payments[i].party_name = e.target.value; })} />
                      {linkOpts.length > 0 && ["manufacturing", "fabric", "packaging", "supplier", "logistics", "rent", "gst", "other_out", "software", "advertising"].includes(x.key) && (
                        <Select options={linkOpts} placeholder="— doesn't settle a known bill/PO —" value={x.link ? `${x.link.type}:${x.link.id}` : ""}
                          onChange={(v) => set((n) => { n.payments[i].link = v ? { type: v.split(":")[0], id: v.split(":")[1] } : null; })} />)}
                    </div>)}
                </td>
              </tr>);
          })}</tbody>
        </table>
      </div>
      <Btn size="sm" style={{ marginTop: 10 }} onClick={() => set((n) => { n.payments.push({ key: "extra_" + n.payments.length, category_code: "expense_other", amount: "", account_id: ctx.accounts[0]?.id, party_name: "", link: null }); })}>+ Add another payment</Btn>
    </>
  );
}

function Bank({ p, set, ctx, v, accountOpts, fieldErr }) {
  const recon = Object.fromEntries((v?.recon || []).map((r) => [r.account_id, r]));
  return (
    <>
      <h2>Bank & cash balances</h2>
      <p className="muted small" style={{ margin: "4px 0 14px" }}>Copy yesterday's <b>closing</b> balance from each bank app. We check it against opening + what you entered — differences are flagged, never hidden.</p>
      <table className="cf-table">
        <thead><tr><th>Account</th><th className="n" style={{ width: 160 }}>Opening <Help tip="Pre-filled from the last closing balance on record." /></th><th className="n" style={{ width: 160 }}>Closing (from bank)</th><th className="n">Expected closing</th><th className="n">Difference</th></tr></thead>
        <tbody>{p.bank.accounts.map((b, i) => {
          const r = recon[b.account_id];
          const prev = ctx.prevClosing[b.account_id];
          return (
            <tr key={b.account_id}>
              <td>{ctx.accounts.find((a) => a.id === b.account_id)?.name}{fieldErr(`bank.${b.account_id}`) && <div className="small neg">{fieldErr(`bank.${b.account_id}`)}</div>}</td>
              <td><MoneyInput value={b.opening} placeholder={prev !== undefined ? Number(prev).toLocaleString("en-IN") : "—"} onChange={(x) => set((n) => { n.bank.accounts[i].opening = x; })} /></td>
              <td><MoneyInput value={b.closing} placeholder="—" invalid={!!fieldErr(`bank.${b.account_id}`)} onChange={(x) => set((n) => { n.bank.accounts[i].closing = x; })} /></td>
              <td className="n">{r ? inr(r.expected) : "—"}</td>
              <td className="n">{r ? (Math.abs(r.difference) <= 1 ? <Badge tone="good">✓ reconciles</Badge> : <Badge tone="bad">{inr(r.difference)}</Badge>) : "—"}</td>
            </tr>);
        })}</tbody>
      </table>

      <h3 style={{ marginTop: 20 }}>Other cash / bank movements</h3>
      <p className="muted small" style={{ margin: "4px 0 8px" }}>Transfers between your own accounts, capital or loans received, owner drawings — anything that isn't a sale or an expense.</p>
      {p.bank.movements.map((m, i) => (
        <div key={i} className="cf-form" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", marginBottom: 8, alignItems: "end" }}>
          <Field label="Type"><Select value={m.category_code} onChange={(x) => set((n) => { n.bank.movements[i].category_code = x; n.bank.movements[i].direction = { capital_in: "in", income_other: "in", owner_drawings: "out", fin_loan: "out", fin_bank_charges: "out" }[x] || n.bank.movements[i].direction; })}
            options={[{ value: "transfer", label: "Transfer between my accounts" }, { value: "capital_in", label: "Capital / loan received" }, { value: "owner_drawings", label: "Owner drawings" },
              { value: "fin_bank_charges", label: "Bank charges" }, { value: "income_other", label: "Other money in" }, { value: "expense_other", label: "Other money out" }]} /></Field>
          <Field label={m.category_code === "transfer" ? "From" : "Account"}><Select options={accountOpts} value={m.account_id} onChange={(x) => set((n) => { n.bank.movements[i].account_id = x; })} /></Field>
          {m.category_code === "transfer" && <Field label="To"><Select options={accountOpts} value={m.to_account_id} placeholder="Choose" onChange={(x) => set((n) => { n.bank.movements[i].to_account_id = x; })} /></Field>}
          <Field label="Amount"><MoneyInput value={m.amount} onChange={(x) => set((n) => { n.bank.movements[i].amount = x; })} /></Field>
          <Field label="Note"><Input value={m.note || ""} onChange={(e) => set((n) => { n.bank.movements[i].note = e.target.value; })} /></Field>
          <Btn size="sm" kind="danger" onClick={() => set((n) => { n.bank.movements.splice(i, 1); })}>Remove</Btn>
        </div>))}
      <Btn size="sm" onClick={() => set((n) => { n.bank.movements.push({ category_code: "transfer", direction: "out", account_id: ctx.accounts[0]?.id, to_account_id: ctx.accounts[1]?.id || "", amount: "", note: "" }); })}>+ Add movement</Btn>
    </>
  );
}

function Commitments({ p, set, cats }) {
  const c = p.commitments;
  const prodCats = cats.filter((x) => x.grp === "Production").map((x) => ({ value: x.code, label: x.name }));
  const outCats = cats.filter((x) => x.active && x.direction === "out").map((x) => ({ value: x.code, label: `${x.grp} · ${x.name}` }));
  return (
    <>
      <h2>Anything new we've committed to pay?</h2>
      <p className="muted small" style={{ margin: "4px 0 14px" }}>New purchase orders, manufacturing commitments, supplier bills or big upcoming expenses. These go straight into the 13-week forecast.</p>
      <label className="cf-check" style={{ marginBottom: 14 }}><input type="checkbox" checked={!!c.none && !c.pos.length && !c.expenses.length} disabled={c.pos.length + c.expenses.length > 0}
        onChange={(e) => set((n) => { n.commitments.none = e.target.checked; if (e.target.checked) n.sections = { ...n.sections, commitments: true }; })} /> No new commitments yesterday</label>

      <h3>New purchase orders</h3>
      {c.pos.map((po, i) => (
        <div key={i} className="cf-card" style={{ padding: 12, margin: "8px 0" }}>
          <div className="cf-form">
            <Field label="Supplier"><Input value={po.supplier} onChange={(e) => set((n) => { n.commitments.pos[i].supplier = e.target.value; })} /></Field>
            <Field label="For (product / material)"><Input value={po.item_desc} onChange={(e) => set((n) => { n.commitments.pos[i].item_desc = e.target.value; })} /></Field>
            <Field label="Type"><Select options={prodCats} value={po.category_code} onChange={(x) => set((n) => { n.commitments.pos[i].category_code = x; })} /></Field>
            <Field label="Total PO value"><MoneyInput value={po.total_value} onChange={(x) => set((n) => { n.commitments.pos[i].total_value = x; })} /></Field>
            <Field label="Payment terms"><Select value={po.payment_terms} onChange={(x) => set((n) => { n.commitments.pos[i].payment_terms = x; })}
              options={Object.entries(E.PAYMENT_TERMS).filter(([k]) => k !== "custom").map(([value, label]) => ({ value, label }))} /></Field>
            <Field label="Expected delivery"><Input type="date" value={po.expected_delivery_date} onChange={(e) => set((n) => { n.commitments.pos[i].expected_delivery_date = e.target.value; })} /></Field>
          </div>
          <Btn size="sm" kind="danger" style={{ marginTop: 8 }} onClick={() => set((n) => { n.commitments.pos.splice(i, 1); })}>Remove</Btn>
        </div>))}
      <Btn size="sm" onClick={() => set((n) => { n.commitments.none = false; n.commitments.pos.push({ supplier: "", item_desc: "", category_code: "prod_manufacturing", total_value: "", payment_terms: "50_50", expected_delivery_date: E.addDays(p.date, 30) }); })}>+ Add a PO</Btn>
      <p className="small faint" style={{ marginTop: 6 }}>Need custom installments? Create the PO on the Purchase orders page.</p>

      <h3 style={{ marginTop: 20 }}>Bills / large upcoming expenses</h3>
      {c.expenses.map((e, i) => (
        <div key={i} className="cf-form" style={{ alignItems: "end", margin: "8px 0" }}>
          <Field label="Pay to"><Input value={e.party_name} onChange={(ev) => set((n) => { n.commitments.expenses[i].party_name = ev.target.value; })} /></Field>
          <Field label="Category"><Select options={outCats} value={e.category_code} onChange={(x) => set((n) => { n.commitments.expenses[i].category_code = x; })} /></Field>
          <Field label="Amount"><MoneyInput value={e.amount} onChange={(x) => set((n) => { n.commitments.expenses[i].amount = x; })} /></Field>
          <Field label="Due date"><Input type="date" value={e.due_date} onChange={(ev) => set((n) => { n.commitments.expenses[i].due_date = ev.target.value; })} /></Field>
          <Field label="Priority"><Select options={["critical", "high", "normal", "low"]} value={e.priority} onChange={(x) => set((n) => { n.commitments.expenses[i].priority = x; })} /></Field>
          <Field label="What is it"><Input value={e.description} onChange={(ev) => set((n) => { n.commitments.expenses[i].description = ev.target.value; })} /></Field>
          <Btn size="sm" kind="danger" onClick={() => set((n) => { n.commitments.expenses.splice(i, 1); })}>Remove</Btn>
        </div>))}
      <Btn size="sm" onClick={() => set((n) => { n.commitments.none = false; n.commitments.expenses.push({ party_name: "", category_code: "mkt_influencer", amount: "", due_date: E.addDays(p.date, 15), priority: "normal", description: "" }); })}>+ Add a bill / expense</Btn>
    </>
  );
}

function Review({ p, v, ctx, locked, ack, setAck, note, setNote }) {
  const s = p.sales;
  return (
    <>
      <h2>{locked ? "Submitted update" : "Review before submitting"}</h2>
      <div className="cf-grid cf-g2" style={{ marginTop: 12 }}>
        <div className="cf-card" style={{ padding: 14 }}>
          <h3>Sales ≠ cash</h3>
          <div className="cf-kv" style={{ marginTop: 8 }}>
            <span>Shopify sales (ordered)</span><span>{E.isBlank(s.order_value) ? "—" : inr(s.order_value)}</span>
            <span>Net sales for MIS</span><span>{inr(v.totals.netSales)}</span>
            <span><b>Cash collected</b></span><span><b>{inr(v.totals.collections)}</b></span>
          </div>
        </div>
        <div className="cf-card" style={{ padding: 14 }}>
          <h3>Expenses ≠ cash paid</h3>
          <div className="cf-kv" style={{ marginTop: 8 }}>
            <span><b>Cash paid out</b></span><span><b>{inr(v.totals.payments)}</b></span>
            <span>New bills (not paid yet)</span><span>{inr(p.commitments.expenses.reduce((a, e) => a + E.num(e.amount), 0))}</span>
            <span>New POs committed</span><span>{inr(p.commitments.pos.reduce((a, e) => a + E.num(e.total_value), 0))}</span>
          </div>
        </div>
      </div>

      <h3 style={{ marginTop: 16 }}>Bank reconciliation</h3>
      {v.recon.length === 0 ? <p className="muted small">No balances entered.</p> : (
        <table className="cf-table" style={{ marginTop: 6 }}>
          <thead><tr><th>Account</th><th className="n">Opening</th><th className="n">+ In</th><th className="n">− Out</th><th className="n">= Expected</th><th className="n">Bank says</th><th className="n">Difference</th></tr></thead>
          <tbody>{v.recon.map((r) => (
            <tr key={r.account_id} className={Math.abs(r.difference) > 1 ? "hl" : ""}><td>{r.name}</td><td className="n">{inr(r.opening)}</td><td className="n">{inr(r.inflow)}</td><td className="n">{inr(r.outflow)}</td>
              <td className="n">{inr(r.expected)}</td><td className="n">{inr(r.reported)}</td><td className="n">{Math.abs(r.difference) <= 1 ? <Badge tone="good">✓</Badge> : <b className="neg">{inr(r.difference)}</b>}</td></tr>))}</tbody>
        </table>)}

      {v.errors.length > 0 && (
        <div className="cf-banner bad" style={{ marginTop: 14 }}><div className="grow"><b>Fix these first:</b><ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{v.errors.map((e, i) => <li key={i}>{e.msg}</li>)}</ul></div></div>)}
      {v.warnings.length > 0 && (
        <div className="cf-banner warn" style={{ marginTop: 14 }}><div className="grow"><b>Please review:</b>
          <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{v.warnings.map((e, i) => <li key={i}>{e.msg}</li>)}</ul>
          {!locked && <label className="cf-check" style={{ marginTop: 8, color: "var(--text)" }}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I've reviewed these and the numbers are correct</label>}
        </div></div>)}
      {!v.reconOk && !locked && (
        <Field label="Explain the bank difference (required)" hint="e.g. 'bank charges not entered yet' — saved with the day and shown in reconciliation." style={{ marginTop: 12 }}>
          <textarea className="cf-textarea" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>)}
      {locked && ctx.existing?.recon_note && <p className="small" style={{ marginTop: 10 }}><b>Difference note:</b> {ctx.existing.recon_note}</p>}
    </>
  );
}

function Summary({ v, ctx, date, setDate }) {
  return (
    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      <Card title="Live totals">
        <div className="cf-kv">
          <span>Sales (not cash)</span><span>{inr(v.totals.sales)}</span>
          <span>Cash in</span><span className="pos">{inr(v.totals.collections + v.totals.movementsIn)}</span>
          <span>Cash out</span><span className="neg">{inr(v.totals.payments + v.totals.movementsOut)}</span>
          <span>Bank difference</span><span className={Math.abs(v.totalDifference) > 1 ? "neg" : ""}>{v.recon.length ? inr(v.totalDifference) : "—"}</span>
        </div>
        <div className="cf-row" style={{ marginTop: 10 }}>
          {v.errors.length > 0 && <Badge tone="bad">{v.errors.length} error{v.errors.length > 1 ? "s" : ""}</Badge>}
          {v.warnings.length > 0 && <Badge tone="warn">{v.warnings.length} warning{v.warnings.length > 1 ? "s" : ""}</Badge>}
          {!v.errors.length && !v.warnings.length && <Badge tone="good">all checks pass</Badge>}
        </div>
      </Card>
      <Card title="Recent days">
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          <table className="cf-table"><tbody>
            {Array.from({ length: 21 }, (_, i) => E.addDays(ctx.today, -1 - i)).map((d) => {
              const u = ctx.recent.find((r) => r.update_date === d);
              return (
                <tr key={d} className="click" onClick={() => setDate(d)} style={d === date ? { background: "var(--accent-soft)" } : undefined}>
                  <td>{fdate(d, { year: false })}</td>
                  <td className="n">{u ? <StatusBadge s={u.status} label={u.status === "partial" ? "partial" : undefined} /> : <Badge tone="bad">missing</Badge>}
                    {u?.is_late && <span className="small faint"> late</span>}
                    {u && Math.abs(u.recon_difference) > 1 && <span title="Bank didn't reconcile" className="neg"> ≠</span>}</td>
                </tr>);
            })}
          </tbody></table>
        </div>
      </Card>
    </div>
  );
}
