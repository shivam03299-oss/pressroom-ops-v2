import React, { useMemo, useState } from "react";
import { call } from "../api.js";
import * as E from "../../../api/_cash-engine.js";
import { useApi, useApp, useToast, useReason, Card, Money, inr, fdate, Badge, StatusBadge, ConfBadge, Seg, Btn, Field, Input, MoneyInput, Select, Modal, PageHead,
  Skeleton, ErrorBox, ExportMenu, DataTable, Tile, Help } from "../ui.jsx";
import { Ageing } from "./Dashboard.jsx";

const acctOpts = (boot) => boot.accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }));
const primary = (boot) => (boot.accounts.find((a) => a.is_primary) || boot.accounts[0])?.id;

// ═══ RECEIVABLES ═════════════════════════════════════════════════════════
export function Receivables() {
  const { boot, can } = useApp();
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("open");
  const { data, error, reload } = useApi("receivables_list", { kind: kind || undefined, status });
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Skeleton h={400} />;
  const today = boot.today;
  const rows = data.rows;
  const cols = [
    { key: "kind", label: "Type", render: (r) => <span style={{ textTransform: "capitalize" }}>{r.kind}</span> },
    { key: "party_name", label: "Customer / platform", render: (r) => r.party_name || boot.channels.find((c) => c.code === r.channel_code)?.name || "—" },
    { key: "reference", label: "Invoice / order", ell: true },
    { key: "origin_date", label: "Sale date", render: (r) => fdate(r.origin_date, { year: false }) },
    { key: "expected_date", label: "Expected", render: (r) => <>{fdate(r.expected_date, { year: false })}{r.expected_date < today && E.OPEN_REC.has(r.status) && <> <Badge tone="bad">{E.diffDays(today, r.expected_date)}d late</Badge></>}</> },
    { key: "net_amount", label: "Expected cash", num: true, render: (r) => inr(r.net_amount) },
    { key: "collected_amount", label: "Collected", num: true, render: (r) => inr(r.collected_amount) },
    { key: "remaining", label: "Outstanding", num: true, render: (r) => <b>{inr(r.remaining)}</b> },
    { key: "confidence", label: "Confidence", render: (r) => <ConfBadge c={r.confidence} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge s={r.status} /> },
  ];
  const expCols = ["Type", "Customer", "Reference", "Sale date", "Expected", "Net", "Collected", "Written off", "Outstanding", "Confidence", "Status"];
  const expRows = rows.map((r) => ({ Type: r.kind, Customer: r.party_name || r.channel_code, Reference: r.reference, "Sale date": r.origin_date, Expected: r.expected_date, Net: r.net_amount,
    Collected: r.collected_amount, "Written off": r.written_off_amount, Outstanding: r.remaining, Confidence: r.confidence, Status: r.status }));
  return (
    <>
      <PageHead title="Receivables" sub="Money owed to Hashway. Not cash until it lands in the bank.">
        {can("finance") && <Btn kind="primary" onClick={() => setAdding(true)}>+ Receivable</Btn>}
        <ExportMenu name="hashway-receivables" title="Receivables" columns={expCols} rows={expRows} />
      </PageHead>
      <div className="cf-grid cf-g4" style={{ marginBottom: 14 }}>
        <Tile label="Total receivables" value={<Money v={data.ageing.total} compact />} />
        <Tile label="Overdue" tone={data.ageing.overdue ? "bad" : ""} value={<Money v={data.ageing.overdue} compact />} sub={`${data.ageing.overdueCount} items past expected date`} />
        <Tile label="Expected · 7 days" value={<Money v={data.ageing.dueNext7} compact />} />
        <Card title="Ageing (from sale date)"><Ageing buckets={data.ageing.buckets} total={data.ageing.total} /></Card>
      </div>
      <Card actions={<div className="cf-row">
        <Seg value={kind} onChange={setKind} options={[{ value: "", label: "All" }, { value: "gateway", label: "Gateways" }, { value: "cod", label: "COD" }, { value: "marketplace", label: "Marketplace" }, { value: "b2b", label: "B2B" }, { value: "other", label: "Other" }]} />
        <Seg value={status} onChange={setStatus} options={[{ value: "open", label: "Open" }, { value: "all", label: "All" }]} /></div>}>
        <DataTable columns={cols} rows={rows} onRow={setSel} rowClass={(r) => (r.expected_date < today && E.OPEN_REC.has(r.status) ? "hl" : "")}
          total={{ net_amount: inr(rows.reduce((s, r) => s + r.net_amount, 0)), collected_amount: inr(rows.reduce((s, r) => s + r.collected_amount, 0)), remaining: inr(rows.reduce((s, r) => s + r.remaining, 0)) }} />
      </Card>
      {sel && <ReceivableModal r={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); reload(); }} />}
      {adding && <NewReceivable onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </>
  );
}

function ReceivableModal({ r, onClose, onSaved }) {
  const { boot, can } = useApp();
  const toast = useToast();
  const [ask, reasonEl] = useReason();
  const [amt, setAmt] = useState(String(r.remaining));
  const [date, setDate] = useState(boot.today);
  const [acct, setAcct] = useState(primary(boot));
  const [exp, setExp] = useState(r.expected_date);
  const [conf, setConf] = useState(r.confidence);
  const open = E.OPEN_REC.has(r.status);
  const act = async (fn, msg) => { try { await fn(); toast(msg); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal title={`${r.kind.toUpperCase()} · ${r.reference || "receivable"}`} onClose={onClose}>
      {reasonEl}
      <div className="cf-kv">
        <span>Customer / platform</span><span>{r.party_name || r.channel_code || "—"}</span>
        <span>Gross</span><span>{inr(r.gross_amount)}</span>
        <span>Fees / commission</span><span>{inr(r.fees)}</span>
        {r.returns_amount > 0 && <><span>Returns</span><span>{inr(r.returns_amount)}</span></>}
        <span>Expected cash</span><span>{inr(r.net_amount)}</span>
        <span>Collected</span><span>{inr(r.collected_amount)}{r.actual_date ? ` (last ${fdate(r.actual_date)})` : ""}</span>
        <span>Written off</span><span>{inr(r.written_off_amount)}</span>
        <span><b>Outstanding</b></span><span><b>{inr(r.remaining)}</b></span>
      </div>
      {r.note && <p className="small muted">{r.note}</p>}
      {open && can("finance") && (
        <>
          <h3>Record collection</h3>
          <div className="cf-form">
            <Field label="Amount received"><MoneyInput value={amt} onChange={setAmt} /></Field>
            <Field label="Date"><Input type="date" value={date} max={boot.today} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Into account"><Select options={acctOpts(boot)} value={acct} onChange={setAcct} /></Field>
          </div>
          <div className="cf-row">
            <Btn kind="primary" onClick={() => act(() => call("receivable_collect", { id: r.id, amount: amt, date, bank_account_id: acct }), "Collection recorded.")}>Record collection</Btn>
            <Btn kind="danger" onClick={async () => { const reason = await ask("Write off the outstanding balance?", "Use for RTOs, short-payments or disputes you won't recover. The forecast will stop expecting it."); if (reason) act(() => call("receivable_writeoff", { id: r.id, reason }), "Written off."); }}>Write off…</Btn>
          </div>
          <h3>Reschedule</h3>
          <div className="cf-form">
            <Field label="Expected date"><Input type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></Field>
            <Field label="Confidence"><Select options={["confirmed", "probable", "possible"]} value={conf} onChange={setConf} /></Field>
          </div>
          <div className="cf-row">
            <Btn onClick={async () => { const reason = await ask("Why is this changing?"); if (reason) act(() => call("receivable_update", { id: r.id, patch: { expected_date: exp, confidence: conf }, reason }), "Updated."); }}>Save changes</Btn>
            <Btn onClick={async () => { const reason = await ask("Mark as disputed?"); if (reason) act(() => call("receivable_update", { id: r.id, patch: { status: r.status === "disputed" ? "open" : "disputed" }, reason }), "Updated."); }}>{r.status === "disputed" ? "Undispute" : "Mark disputed"}</Btn>
          </div>
        </>)}
    </Modal>
  );
}

function NewReceivable({ onClose, onSaved }) {
  const { boot } = useApp();
  const toast = useToast();
  const [f, setF] = useState({ kind: "b2b", channel_code: "b2b", party_name: "", reference: "", origin_date: boot.today, gross_amount: "", fees: "", expected_date: E.addDays(boot.today, 30), confidence: "confirmed", book_revenue: true, note: "" });
  const net = E.num(f.gross_amount) - E.num(f.fees);
  const chans = boot.channels.filter((c) => c.kind === f.kind || (f.kind === "other" && c.kind === "other"));
  const save = async () => {
    try { await call("receivable_create", { ...f, net_amount: net }); toast("Receivable added — now in the forecast."); onSaved(); } catch (e) { toast(e.message, "bad"); }
  };
  return (
    <Modal title="New receivable" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Add</Btn></>}>
      <div className="cf-form">
        <Field label="Type"><Select value={f.kind} onChange={(v) => setF({ ...f, kind: v, channel_code: boot.channels.find((c) => c.kind === v)?.code || null })}
          options={[{ value: "b2b", label: "B2B / wholesale invoice" }, { value: "marketplace", label: "Marketplace settlement" }, { value: "gateway", label: "Payment gateway" }, { value: "cod", label: "COD (courier)" }, { value: "other", label: "Other" }]} /></Field>
        <Field label="Channel"><Select options={chans.map((c) => ({ value: c.code, label: c.name }))} value={f.channel_code} onChange={(v) => setF({ ...f, channel_code: v })} /></Field>
        <Field label="Customer / platform"><Input value={f.party_name} onChange={(e) => setF({ ...f, party_name: e.target.value })} /></Field>
        <Field label="Invoice / reference"><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Sale / invoice date"><Input type="date" value={f.origin_date} onChange={(e) => setF({ ...f, origin_date: e.target.value })} /></Field>
        <Field label="Gross amount"><MoneyInput value={f.gross_amount} onChange={(v) => setF({ ...f, gross_amount: v })} /></Field>
        <Field label="Fees / commission" help="Deducted before you're paid."><MoneyInput value={f.fees} onChange={(v) => setF({ ...f, fees: v })} /></Field>
        <Field label="Expected collection date"><Input type="date" value={f.expected_date} onChange={(e) => setF({ ...f, expected_date: e.target.value })} /></Field>
        <Field label="How sure?"><Select options={["confirmed", "probable", "possible"]} value={f.confidence} onChange={(v) => setF({ ...f, confidence: v })} /></Field>
      </div>
      <div className="cf-kv"><span>Cash expected</span><span><b>{inr(net)}</b></span></div>
      {f.kind !== "gateway" && f.kind !== "cod" && <label className="cf-check"><input type="checkbox" checked={f.book_revenue} onChange={(e) => setF({ ...f, book_revenue: e.target.checked })} /> Also book this as revenue in the MIS (untick if the sale was already recorded)</label>}
    </Modal>
  );
}

// ═══ PAYABLES ════════════════════════════════════════════════════════════
export function Payables() {
  const { boot, can } = useApp();
  const [status, setStatus] = useState("open");
  const { data, error, reload } = useApi("payables_list", { status });
  const [pay, setPay] = useState(null);
  const [adding, setAdding] = useState(false);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Skeleton h={400} />;
  const today = boot.today;
  const all = [
    ...data.bills.map((b) => ({ ...b, type: "payable", what: b.description || b.reference || b.category_name, cat: b.category_name })),
    ...data.installments.map((i) => ({ ...i, type: "po_installment", what: `${i.po_number} · ${i.label}`, cat: boot.categories.find((c) => c.code === i.category_code)?.name, priority: "po", sub: i.item_desc })),
  ];
  const cols = [
    { key: "party_name", label: "Supplier / vendor", render: (r) => <>{r.party_name || "—"}<div className="small faint">{r.cat}</div></> },
    { key: "what", label: "What", ell: true, render: (r) => <>{r.what}{r.sub && <div className="small faint">{r.sub}</div>}</> },
    { key: "due_date", label: "Due", render: (r) => <>{fdate(r.due_date, { year: false })}{r.due_date < today && E.OPEN_PAY.has(r.status) && <> <Badge tone="bad">{E.diffDays(today, r.due_date)}d overdue</Badge></>}</> },
    { key: "expected_pay_date", label: "Will pay", render: (r) => fdate(r.expected_pay_date || r.due_date, { year: false }) },
    { key: "priority", label: "Priority", render: (r) => r.priority === "po" ? <Badge tone="info">PO</Badge> : <Badge tone={r.priority === "critical" ? "bad" : r.priority === "high" ? "warn" : ""}>{r.priority}</Badge> },
    { key: "amount", label: "Amount", num: true, render: (r) => inr(r.amount) },
    { key: "paid_amount", label: "Paid", num: true, render: (r) => inr(r.paid_amount) },
    { key: "remaining", label: "Balance", num: true, render: (r) => <b>{inr(r.remaining)}</b> },
    { key: "status", label: "Status", render: (r) => <StatusBadge s={r.status} /> },
  ];
  const exp = all.map((r) => ({ Supplier: r.party_name, Item: r.what, Category: r.cat, Due: r.due_date, "Will pay": r.expected_pay_date || r.due_date, Priority: r.priority, Amount: r.amount, Paid: r.paid_amount, Balance: r.remaining, Status: r.status }));
  return (
    <>
      <PageHead title="Payables" sub="What Hashway owes — bills and PO installments. Each appears in the forecast on its payment date.">
        {can("write") && <Btn kind="primary" onClick={() => setAdding(true)}>+ Bill</Btn>}
        <ExportMenu name="hashway-payables" title="Supplier payables" columns={Object.keys(exp[0] || { Supplier: 0 })} rows={exp} />
      </PageHead>
      <div className="cf-grid cf-g4" style={{ marginBottom: 14 }}>
        <Tile label="Total payable" value={<Money v={data.ageing.total} compact />} />
        <Tile label="Overdue" tone={data.ageing.overdue ? "bad" : ""} value={<Money v={data.ageing.overdue} compact />} />
        <Tile label="Due · 14 days" value={<Money v={data.ageing.dueNext14} compact />} sub={`${inr(data.ageing.dueNext7)} within 7 days`} />
        <Card title="Ageing (past due date)">
          {data.ageing.buckets.map((b) => <div key={b.key} className="cf-kv small"><span>{b.label}</span><span>{inr(b.amount)}</span></div>)}
        </Card>
      </div>
      <Card actions={<Seg value={status} onChange={setStatus} options={[{ value: "open", label: "Open" }, { value: "all", label: "All" }]} />}>
        <DataTable columns={cols} rows={all} onRow={setPay} initialSort={{ key: "expected_pay_date", dir: "asc" }} rowClass={(r) => (r.due_date < today && E.OPEN_PAY.has(r.status) ? "hl" : "")}
          total={{ amount: inr(all.reduce((s, r) => s + r.amount, 0)), paid_amount: inr(all.reduce((s, r) => s + r.paid_amount, 0)), remaining: inr(all.reduce((s, r) => s + r.remaining, 0)) }} />
      </Card>
      {pay && <PayModal item={pay} onClose={() => setPay(null)} onSaved={() => { setPay(null); reload(); }} />}
      {adding && <NewBill onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </>
  );
}

export function PayModal({ item, onClose, onSaved }) {
  const { boot, can } = useApp();
  const toast = useToast();
  const [ask, reasonEl] = useReason();
  const [amt, setAmt] = useState(String(item.remaining));
  const [date, setDate] = useState(boot.today);
  const [acct, setAcct] = useState(primary(boot));
  const [payDate, setPayDate] = useState(item.expected_pay_date || item.due_date);
  const act = async (fn, msg) => { try { await fn(); toast(msg); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  const isPo = item.type === "po_installment";
  return (
    <Modal title={item.what} onClose={onClose}>
      {reasonEl}
      <div className="cf-kv">
        <span>To</span><span>{item.party_name || "—"}</span>
        <span>Amount</span><span>{inr(item.amount)}</span>
        <span>Paid so far</span><span>{inr(item.paid_amount)}</span>
        <span><b>Balance</b></span><span><b>{inr(item.remaining)}</b></span>
        <span>Due</span><span>{fdate(item.due_date)}</span>
      </div>
      {E.OPEN_PAY.has(item.status) && can("finance") && (
        <>
          <h3>Record payment (cash leaves the bank)</h3>
          <div className="cf-form">
            <Field label="Amount paid" hint="Partial payments are fine."><MoneyInput value={amt} onChange={setAmt} /></Field>
            <Field label="Date paid"><Input type="date" value={date} max={boot.today} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="From account"><Select options={acctOpts(boot)} value={acct} onChange={setAcct} /></Field>
          </div>
          <Btn kind="primary" onClick={() => act(() => call("payable_pay", { type: item.type, id: item.id, amount: amt, date, bank_account_id: acct }), "Payment recorded.")}>Record payment</Btn>
          <h3>Change payment date</h3>
          <div className="cf-row">
            <Input type="date" value={payDate} style={{ width: 180 }} onChange={(e) => setPayDate(e.target.value)} />
            <Btn onClick={async () => { const reason = await ask("Why is the payment date changing?", "e.g. supplier agreed to 15 more days."); if (reason) act(() => call(isPo ? "po_installment_update" : "payable_update", { id: item.id, patch: { expected_pay_date: payDate }, reason }), "Rescheduled — forecast updated."); }}>Reschedule</Btn>
            {!isPo && Number(item.paid_amount) === 0 && <Btn kind="danger" onClick={async () => { const reason = await ask("Cancel this bill?"); if (reason) act(() => call("payable_update", { id: item.id, patch: { status: "cancelled" }, reason }), "Bill cancelled."); }}>Cancel bill…</Btn>}
          </div>
        </>)}
      {!can("finance") && <p className="small muted">Only Finance can record payments.</p>}
    </Modal>
  );
}

function NewBill({ onClose, onSaved }) {
  const { boot } = useApp();
  const toast = useToast();
  const [f, setF] = useState({ party_name: "", category_code: "expense_other", reference: "", description: "", bill_date: boot.today, amount: "", due_date: E.addDays(boot.today, 15), priority: "normal" });
  const outCats = boot.categories.filter((c) => c.active && c.direction === "out");
  const groups = [...new Set(outCats.map((c) => c.grp))].map((g) => ({ group: g, options: outCats.filter((c) => c.grp === g).map((c) => ({ value: c.code, label: c.name })) }));
  const cat = boot.categories.find((c) => c.code === f.category_code);
  const save = async () => { try { await call("payable_create", f); toast("Bill added — it's now a future cash outflow."); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal title="New bill to pay" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Add bill</Btn></>}>
      <div className="cf-form">
        <Field label="Supplier / vendor"><Input value={f.party_name} list="cf-parties" onChange={(e) => setF({ ...f, party_name: e.target.value })} /></Field>
        <Field label="Category"><Select options={groups} value={f.category_code} onChange={(v) => setF({ ...f, category_code: v, priority: boot.categories.find((c) => c.code === v)?.is_critical ? "critical" : f.priority })} /></Field>
        <Field label="Amount"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Bill date" help="The expense is recognised in the MIS on this date."><Input type="date" value={f.bill_date} onChange={(e) => setF({ ...f, bill_date: e.target.value })} /></Field>
        <Field label="Due date"><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        <Field label="Priority"><Select options={["critical", "high", "normal", "low"]} value={f.priority} onChange={(v) => setF({ ...f, priority: v })} /></Field>
        <Field label="Bill number"><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
      </div>
      <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <datalist id="cf-parties">{boot.parties.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      {cat?.pnl_class === "inventory" && <p className="small muted">Production purchases become inventory, not an expense — they'll hit the MIS as COGS when sold.</p>}
    </Modal>
  );
}

// ═══ PURCHASE ORDERS ═════════════════════════════════════════════════════
export function PurchaseOrders() {
  const { can } = useApp();
  const { data, error, reload } = useApi("po_list");
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const [show, setShow] = useState("active");
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Skeleton h={400} />;
  const list = data.filter((p) => show === "all" || !["closed", "cancelled"].includes(p.status) && (p.balance > 0 || p.status !== "received"));
  const totals = data.filter((p) => p.status !== "cancelled").reduce((s, p) => ({ value: s.value + p.total_value, paid: s.paid + p.paid, balance: s.balance + p.balance, adv: s.adv + p.advance }), { value: 0, paid: 0, balance: 0, adv: 0 });
  const current = sel && data.find((p) => p.id === sel);
  return (
    <>
      <PageHead title="Purchase orders & supplier commitments" sub="Every unpaid installment is a future cash outflow in the forecast, in the week it's due.">
        <Seg value={show} onChange={setShow} options={[{ value: "active", label: "Active" }, { value: "all", label: "All" }]} />
        {can("write") && <Btn kind="primary" onClick={() => setAdding(true)}>+ New PO</Btn>}
        <ExportMenu name="hashway-purchase-orders" title="Purchase orders" columns={["PO", "Supplier", "Item", "Order date", "Delivery", "Terms", "Value", "Paid", "Balance", "Advance locked", "Status"]}
          rows={data.map((p) => ({ PO: p.po_number, Supplier: p.party_name, Item: p.item_desc, "Order date": p.order_date, Delivery: p.expected_delivery_date, Terms: E.PAYMENT_TERMS[p.payment_terms], Value: p.total_value, Paid: p.paid, Balance: p.balance, "Advance locked": p.advance, Status: p.status }))} />
      </PageHead>
      <div className="cf-grid cf-g4" style={{ marginBottom: 14 }}>
        <Tile label="PO value (open + closed)" value={<Money v={totals.value} compact />} />
        <Tile label="Paid to suppliers" value={<Money v={totals.paid} compact />} />
        <Tile label="Still to pay" value={<Money v={totals.balance} compact />} help="Future cash commitments — all in the 13-week forecast." />
        <Tile label="Advances locked" value={<Money v={totals.adv} compact />} help="Paid but goods not yet received. This is working capital tied up with suppliers." />
      </div>
      <Card>
        <DataTable rows={list} onRow={(p) => setSel(p.id)} empty="No purchase orders yet."
          columns={[
            { key: "po_number", label: "PO", render: (p) => <b>{p.po_number}</b> },
            { key: "party_name", label: "Supplier" },
            { key: "item_desc", label: "For", ell: true },
            { key: "payment_terms", label: "Terms", render: (p) => <span className="small">{E.PAYMENT_TERMS[p.payment_terms]}</span> },
            { key: "expected_delivery_date", label: "Delivery", render: (p) => fdate(p.expected_delivery_date, { year: false }) },
            { key: "total_value", label: "Value", num: true, render: (p) => inr(p.total_value) },
            { key: "paid", label: "Paid", num: true, render: (p) => <>{inr(p.paid)}<div className="cf-bar" style={{ width: 90, marginLeft: "auto", marginTop: 3 }}><i style={{ width: `${Math.min(100, (p.paid / p.total_value) * 100)}%` }} /></div></> },
            { key: "balance", label: "Balance", num: true, render: (p) => <b>{inr(p.balance)}</b> },
            { key: "next", label: "Next due", sort: (p) => p.installments.find((i) => E.OPEN_PAY.has(i.status))?.due_date || "9", render: (p) => { const n = p.installments.find((i) => E.OPEN_PAY.has(i.status)); return n ? <>{fdate(n.expected_pay_date || n.due_date, { year: false })} · {inr(n.remaining)}</> : "—"; } },
            { key: "status", label: "Status", render: (p) => <StatusBadge s={p.status} /> },
          ]} />
      </Card>
      {current && <PoModal po={current} onClose={() => setSel(null)} onSaved={reload} />}
      {adding && <NewPo onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </>
  );
}

function PoModal({ po, onClose, onSaved }) {
  const { boot, can } = useApp();
  const toast = useToast();
  const [ask, reasonEl] = useReason();
  const [pay, setPay] = useState(null);
  const [recv, setRecv] = useState({ value: "", sku_id: po.sku_id || "", units: "", date: boot.today });
  const skus = useApi("inventory_list");
  const act = async (fn, msg) => { try { await fn(); toast(msg); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal wide title={`${po.po_number} · ${po.party_name}`} onClose={onClose}>
      {reasonEl}
      <div className="cf-grid cf-g4">
        <Tile label="PO value" value={inr(po.total_value)} sub={E.PAYMENT_TERMS[po.payment_terms]} />
        <Tile label="Paid" value={inr(po.paid)} />
        <Tile label="Balance payable" value={inr(po.balance)} />
        <Tile label="Advance locked" value={inr(po.advance)} sub={`Goods received ${inr(po.received_value)}`} />
      </div>
      <p className="muted">{po.item_desc} · ordered {fdate(po.order_date)} · delivery {fdate(po.expected_delivery_date)} · <StatusBadge s={po.status} /></p>
      <h3>Payment schedule</h3>
      <table className="cf-table">
        <thead><tr><th>#</th><th>Installment</th><th className="n">%</th><th>Due</th><th>Will pay</th><th className="n">Amount</th><th className="n">Paid</th><th className="n">Balance</th><th>Status</th><th></th></tr></thead>
        <tbody>{po.installments.map((i) => (
          <tr key={i.id}><td>{i.seq}</td><td>{i.label}</td><td className="n">{i.pct}%</td><td>{fdate(i.due_date, { year: false })}</td><td>{fdate(i.expected_pay_date || i.due_date, { year: false })}</td>
            <td className="n">{inr(i.amount)}</td><td className="n">{inr(i.paid_amount)}</td><td className="n"><b>{inr(i.remaining)}</b></td><td><StatusBadge s={i.status} /></td>
            <td>{E.OPEN_PAY.has(i.status) && po.status !== "cancelled" && <Btn size="sm" onClick={() => setPay({ ...i, type: "po_installment", what: `${po.po_number} · ${i.label}`, party_name: po.party_name })}>Pay / reschedule</Btn>}</td></tr>))}</tbody>
      </table>
      {can("write") && !["cancelled", "closed"].includes(po.status) && (
        <>
          <h3>Goods received</h3>
          <div className="cf-form" style={{ alignItems: "end" }}>
            <Field label="Value received (at cost)"><MoneyInput value={recv.value} onChange={(v) => setRecv({ ...recv, value: v })} /></Field>
            <Field label="Into SKU (optional)"><Select placeholder="— not a stock item —" options={(skus.data?.rows || []).map((s) => ({ value: s.id, label: `${s.sku} · ${s.product}` }))} value={recv.sku_id} onChange={(v) => setRecv({ ...recv, sku_id: v })} /></Field>
            <Field label="Units"><Input inputMode="numeric" value={recv.units} onChange={(e) => setRecv({ ...recv, units: e.target.value })} /></Field>
            <Field label="Date"><Input type="date" value={recv.date} onChange={(e) => setRecv({ ...recv, date: e.target.value })} /></Field>
            <Btn onClick={() => act(() => call("po_receive", { id: po.id, ...recv }), "Receipt recorded — supplier advance reduced, stock updated.")}>Record receipt</Btn>
          </div>
        </>)}
      {can("finance") && (
        <div className="cf-row" style={{ marginTop: 8 }}>
          {po.status !== "closed" && po.status !== "cancelled" && <Btn onClick={async () => { const reason = await ask("Close this PO?", "Any unpaid balance stays visible until paid or cancelled."); if (reason) act(() => call("po_update", { id: po.id, patch: { status: "closed" }, reason }), "PO closed."); }}>Close PO</Btn>}
          {po.paid === 0 && po.status !== "cancelled" && <Btn kind="danger" onClick={async () => { const reason = await ask("Cancel this PO?", "Its installments will leave the forecast."); if (reason) act(() => call("po_update", { id: po.id, patch: { status: "cancelled" }, reason }), "PO cancelled."); }}>Cancel PO…</Btn>}
        </div>)}
      {pay && <PayModal item={pay} onClose={() => setPay(null)} onSaved={() => { setPay(null); onSaved(); }} />}
    </Modal>
  );
}

function NewPo({ onClose, onSaved }) {
  const { boot } = useApp();
  const toast = useToast();
  const [f, setF] = useState({ po_number: "", supplier: "", item_desc: "", category_code: "prod_manufacturing", qty: "", total_value: "", order_date: boot.today,
    expected_delivery_date: E.addDays(boot.today, 30), payment_terms: "50_50", note: "", installments: [{ label: "Advance", pct: 40, due_date: boot.today }, { label: "Balance", pct: 60, due_date: E.addDays(boot.today, 30) }] });
  const plan = useMemo(() => {
    try { return { rows: E.buildInstallments(f.payment_terms, E.num(f.total_value), f.order_date, f.expected_delivery_date, f.installments) }; }
    catch (e) { return { error: e.message }; }
  }, [f]);
  const prodCats = boot.categories.filter((c) => c.grp === "Production").map((c) => ({ value: c.code, label: c.name }));
  const save = async () => { try { await call("po_create", f); toast("PO created — installments added to the forecast."); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal wide title="New purchase order" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!!plan.error} onClick={save}>Create PO</Btn></>}>
      <div className="cf-form">
        <Field label="Supplier"><Input value={f.supplier} list="cf-sup" onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
        <Field label="PO number" hint="Leave blank to auto-number"><Input value={f.po_number} onChange={(e) => setF({ ...f, po_number: e.target.value })} /></Field>
        <Field label="Type"><Select options={prodCats} value={f.category_code} onChange={(v) => setF({ ...f, category_code: v })} /></Field>
        <Field label="Total PO value"><MoneyInput value={f.total_value} onChange={(v) => setF({ ...f, total_value: v })} /></Field>
        <Field label="Quantity (optional)"><Input inputMode="numeric" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <Field label="Order date"><Input type="date" value={f.order_date} onChange={(e) => setF({ ...f, order_date: e.target.value })} /></Field>
        <Field label="Expected delivery"><Input type="date" value={f.expected_delivery_date} onChange={(e) => setF({ ...f, expected_delivery_date: e.target.value })} /></Field>
        <Field label="Payment terms"><Select options={Object.entries(E.PAYMENT_TERMS).map(([value, label]) => ({ value, label }))} value={f.payment_terms} onChange={(v) => setF({ ...f, payment_terms: v })} /></Field>
      </div>
      <Field label="Product / material"><Input value={f.item_desc} onChange={(e) => setF({ ...f, item_desc: e.target.value })} placeholder="e.g. 1,200 heavyweight tees, black & olive" /></Field>
      {f.payment_terms === "custom" && (
        <div>
          <h3>Custom installments (percent of PO value)</h3>
          {f.installments.map((x, i) => (
            <div key={i} className="cf-row" style={{ marginTop: 6 }}>
              <Input style={{ width: 160 }} value={x.label} onChange={(e) => { const a = [...f.installments]; a[i] = { ...x, label: e.target.value }; setF({ ...f, installments: a }); }} />
              <Input style={{ width: 90 }} type="number" value={x.pct} onChange={(e) => { const a = [...f.installments]; a[i] = { ...x, pct: e.target.value }; setF({ ...f, installments: a }); }} /> %
              <Input style={{ width: 170 }} type="date" value={x.due_date} onChange={(e) => { const a = [...f.installments]; a[i] = { ...x, due_date: e.target.value }; setF({ ...f, installments: a }); }} />
              <Btn size="sm" kind="danger" onClick={() => setF({ ...f, installments: f.installments.filter((_, j) => j !== i) })}>✕</Btn>
            </div>))}
          <Btn size="sm" style={{ marginTop: 6 }} onClick={() => setF({ ...f, installments: [...f.installments, { label: `Installment ${f.installments.length + 1}`, pct: 0, due_date: f.expected_delivery_date }] })}>+ Installment</Btn>
        </div>)}
      <h3>Payment schedule preview</h3>
      {plan.error ? <div className="cf-banner warn" style={{ margin: 0 }}>{plan.error}</div> : (
        <table className="cf-table"><tbody>{plan.rows.map((r) => <tr key={r.seq}><td>{r.label}</td><td className="n">{r.pct}%</td><td>{fdate(r.due_date)}</td><td className="n"><b>{inr(r.amount)}</b></td></tr>)}</tbody></table>)}
      <datalist id="cf-sup">{boot.parties.filter((p) => p.kind === "supplier").map((p) => <option key={p.id} value={p.name} />)}</datalist>
    </Modal>
  );
}
