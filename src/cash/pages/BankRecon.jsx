import React, { useState } from "react";
import { call } from "../api.js";
import * as E from "../../../api/_cash-engine.js";
import { useApi, useApp, useToast, useReason, Card, Money, inr, fdate, Badge, StatusBadge, Btn, Field, Input, MoneyInput, Select, Modal, PageHead, Skeleton, ErrorBox, Link, Tile } from "../ui.jsx";

export default function BankRecon() {
  const { boot, can } = useApp();
  const toast = useToast();
  const [ask, reasonEl] = useReason();
  const [acct, setAcct] = useState((boot.accounts.find((a) => a.is_primary) || boot.accounts[0])?.id);
  const [range, setRange] = useState({ from: E.addDays(boot.today, -30), to: boot.today });
  const { data, error, reload } = useApi("bank_view", { account_id: acct, ...range });
  const [post, setPost] = useState(null);
  const [match, setMatch] = useState(null);
  const [bal, setBal] = useState(false);
  if (!acct) return <Card><p className="muted">Add a bank account in Settings first.</p></Card>;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const act = async (fn, msg) => { try { const r = await fn(); toast(typeof msg === "function" ? msg(r) : msg); reload(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <>
      {reasonEl}
      <PageHead title="Bank reconciliation" sub="Bank statement vs the ledger. Every difference stays visible until it's explained.">
        <Select style={{ width: 220 }} options={boot.accounts.map((a) => ({ value: a.id, label: a.name }))} value={acct} onChange={setAcct} />
        <Input type="date" style={{ width: 150 }} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Input type="date" style={{ width: 150 }} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <Link to="/cash/imports" className="cf-btn">Import statement</Link>
        {can("finance") && <Btn kind="primary" onClick={() => act(() => call("bank_automatch", { account_id: acct }), (r) => `Matched ${r.matched}; ${r.remaining} still unmatched.`)}>Auto-match</Btn>}
      </PageHead>
      {!data ? <Skeleton h={400} /> : <>
        <div className="cf-grid cf-g4" style={{ marginBottom: 14 }}>
          <Tile label="Bank statement closing" value={data.statement ? inr(data.statement.closing) : "—"} sub={data.statement ? `as of ${fdate(data.statement.date)}` : "Import a statement or add a balance"} />
          <Tile label="System (ledger) closing" value={data.statement ? inr(data.statement.system) : "—"} sub="same date" />
          <Tile label="Difference" tone={data.statement && Math.abs(data.statement.difference) > 1 ? "bad" : ""} value={data.statement ? <span className={Math.abs(data.statement.difference) > 1 ? "neg" : "pos"}>{inr(data.statement.difference)}</span> : "—"}
            sub={data.statement && Math.abs(data.statement.difference) > 1 ? "Explain it below: unmatched lines on either side" : data.statement ? "✓ reconciled" : null} />
          <Tile label="Unmatched" value={`${data.summary.unmatched} bank · ${data.summary.ledgerUnmatched} ledger`} sub={<>bank net <Money v={data.summary.unmatchedNet} signed /> · ledger net <Money v={data.summary.ledgerUnmatchedNet} signed /></>} />
        </div>
        {can("finance") && <div className="cf-row" style={{ marginBottom: 14 }}><Btn size="sm" onClick={() => setBal(true)}>+ Enter statement balance manually</Btn></div>}
        <div className="cf-grid cf-g2">
          <Card title="Bank statement lines" sub={`${data.lines.length} lines · ${data.summary.matched} matched · ${data.summary.ignored} ignored`}>
            {data.lines.length === 0 ? <p className="muted">No statement lines in this range. <Link to="/cash/imports">Import a bank statement</Link>.</p> : (
              <div className="cf-table-wrap" style={{ maxHeight: 620, overflowY: "auto" }}>
                <table className="cf-table"><tbody>{data.lines.map((l) => (
                  <tr key={l.id} className={l.match_status === "unmatched" ? "hl" : ""}>
                    <td className="small" style={{ width: 62 }}>{fdate(l.txn_date, { year: false })}</td>
                    <td className="small" style={{ maxWidth: 260 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.description}>{l.description}</div>{l.matched_desc && <div className="faint">↔ {l.matched_desc}</div>}
                      {can("finance") && l.match_status === "unmatched" && <div className="cf-row" style={{ gap: 4, marginTop: 4 }}>
                        <Btn size="sm" onClick={() => setMatch(l)}>Match</Btn><Btn size="sm" onClick={() => setPost(l)}>Post</Btn><Btn size="sm" kind="ghost" onClick={async () => { const reason = await ask("Ignore this bank line?", "e.g. reversed the same day."); if (reason) act(() => call("bank_ignore", { bank_id: l.id, reason }), "Ignored."); }}>Ignore</Btn></div>}</td>
                    <td className="n"><Money v={(l.direction === "in" ? 1 : -1) * l.amount} signed /></td>
                    <td><StatusBadge s={l.match_status} /></td>
                    <td>{can("finance") && ["auto", "manual"].includes(l.match_status) && <Btn size="sm" kind="ghost" onClick={() => act(() => call("bank_unmatch", { bank_id: l.id }), "Unmatched.")}>Unmatch</Btn>}</td>
                  </tr>))}</tbody></table>
              </div>)}
          </Card>
          <Card title="Ledger cash not on the statement" sub="Recorded in the books but not (yet) seen by the bank — uncleared cheques, wrong dates, duplicates">
            {(() => {
              const rows = data.ledger.filter((t) => !t.bank_line_id && t.txn_date >= data.from && t.txn_date <= data.to);
              return rows.length === 0 ? <p className="muted">Everything in the ledger is on the statement. ✓</p> : (
                <div className="cf-table-wrap" style={{ maxHeight: 620, overflowY: "auto" }}>
                  <table className="cf-table"><tbody>{rows.map((t) => (
                    <tr key={t.id}><td className="small" style={{ width: 62 }}>{fdate(t.txn_date, { year: false })}</td>
                      <td className="ell small">{t.description}<div className="faint">{t.category_name} · {t.source}</div></td>
                      <td className="n"><Money v={(t.direction === "in" ? 1 : -1) * t.amount} signed /></td></tr>))}</tbody></table>
                </div>);
            })()}
          </Card>
        </div>
      </>}
      {post && <PostModal line={post} onClose={() => setPost(null)} onSaved={() => { setPost(null); reload(); }} />}
      {match && <MatchModal line={match} ledger={data.ledger.filter((t) => !t.bank_line_id && t.direction === match.direction)} onClose={() => setMatch(null)} onSaved={() => { setMatch(null); reload(); }} />}
      {bal && <BalModal acct={acct} onClose={() => setBal(false)} onSaved={() => { setBal(false); reload(); }} />}
    </>
  );
}

function PostModal({ line, onClose, onSaved }) {
  const { boot } = useApp();
  const toast = useToast();
  const guess = /chrg|charge|fee/i.test(line.description) ? "fin_bank_charges" : line.direction === "in" ? "income_other" : "expense_other";
  const [f, setF] = useState({ category_code: guess, party_name: "", description: line.description });
  const cats = boot.categories.filter((c) => c.active && (c.direction === line.direction || c.direction === "both"));
  const save = async () => { try { await call("bank_post", { bank_id: line.id, ...f }); toast("Posted to the ledger and matched."); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal title={`Post to ledger · ${inr(line.amount)} ${line.direction === "in" ? "in" : "out"}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Post & match</Btn></>}>
      <p className="small muted">The bank shows money the books don't know about. Classify it so the ledger catches up. Collections are applied to the oldest matching receivables.</p>
      <div className="cf-form">
        <Field label="Category"><Select options={[...new Set(cats.map((c) => c.grp))].map((g) => ({ group: g, options: cats.filter((c) => c.grp === g).map((c) => ({ value: c.code, label: c.name })) }))} value={f.category_code} onChange={(v) => setF({ ...f, category_code: v })} /></Field>
        <Field label="Party (optional)"><Input value={f.party_name} onChange={(e) => setF({ ...f, party_name: e.target.value })} /></Field>
      </div>
      <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
    </Modal>
  );
}

function MatchModal({ line, ledger, onClose, onSaved }) {
  const toast = useToast();
  const [sel, setSel] = useState(null);
  const [reason, setReason] = useState("");
  const sorted = [...ledger].sort((a, b) => Math.abs(a.amount - line.amount) - Math.abs(b.amount - line.amount) || Math.abs(E.diffDays(a.txn_date, line.txn_date)) - Math.abs(E.diffDays(b.txn_date, line.txn_date)));
  const chosen = sorted.find((t) => t.id === sel);
  const diff = chosen ? chosen.amount - line.amount : 0;
  const save = async () => { try { await call("bank_match", { bank_id: line.id, txn_id: sel, reason }); toast("Matched."); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal wide title={`Match bank line · ${fdate(line.txn_date)} · ${inr(line.amount)}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={!sel || (Math.abs(diff) > 0.5 && !reason.trim())} onClick={save}>Match</Btn></>}>
      <p className="small muted">{line.description}</p>
      <div className="cf-table-wrap" style={{ maxHeight: 360, overflowY: "auto" }}>
        <table className="cf-table"><tbody>{sorted.slice(0, 60).map((t) => (
          <tr key={t.id} className="click" onClick={() => setSel(t.id)} style={sel === t.id ? { background: "var(--accent-soft)" } : undefined}>
            <td><input type="radio" readOnly checked={sel === t.id} /></td><td className="small">{fdate(t.txn_date, { year: false })}</td><td className="ell">{t.description}</td><td className="n">{inr(t.amount)}</td>
            <td>{Math.abs(t.amount - line.amount) <= 0.5 ? <Badge tone="good">same amount</Badge> : <Badge tone="warn">{inr(t.amount - line.amount)}</Badge>}</td></tr>))}</tbody></table>
      </div>
      {Math.abs(diff) > 0.5 && <Field label="Amounts differ — reason (required)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
    </Modal>
  );
}

function BalModal({ acct, onClose, onSaved }) {
  const { boot } = useApp();
  const toast = useToast();
  const [f, setF] = useState({ date: boot.today, closing: "", note: "" });
  const save = async () => { try { await call("bank_balance_add", { account_id: acct, ...f }); toast("Statement balance recorded."); onSaved(); } catch (e) { toast(e.message, "bad"); } };
  return (
    <Modal title="Statement balance" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="cf-form">
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Closing balance per bank"><MoneyInput value={f.closing} onChange={(v) => setF({ ...f, closing: v })} /></Field>
      </div>
      <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
    </Modal>
  );
}
