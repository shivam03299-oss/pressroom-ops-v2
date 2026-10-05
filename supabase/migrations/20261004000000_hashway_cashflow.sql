-- ═══════════════════════════════════════════════════════════════════════
-- Hashway Cash Command Center — schema
-- ═══════════════════════════════════════════════════════════════════════
-- Every table is prefixed cf_ and carries a `book` column ('live' | 'demo')
-- so realistic demo data can be loaded/cleared without ever touching the
-- real books. This lives in its OWN Supabase project (not pressroom's).
-- All access goes through the API (api/_hashway-cash.js) over a direct
-- Postgres connection, so RLS is enabled with NO policies: the anon /
-- authenticated PostgREST keys can read nothing directly.
--
-- Core idea: ONE ledger (cf_transactions). Every money event lands there
-- with a `nature`:
--   cash      — money actually moved in/out of a bank/cash account
--   accrual   — recognised for P&L but no cash moved (sales booked,
--               expense billed)
--   expected  — manual one-off future cash (forecast input)
-- Documents (receivables, payables, PO installments) hold *expected* cash;
-- they are settled by cf_allocations rows that point at cash txns, and
-- triggers keep their collected/paid totals in sync.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── users / roles ─────────────────────────────────────────────────────
create table if not exists cf_users (
  email       text primary key check (email = lower(email)),
  name        text,
  role        text not null check (role in ('admin','finance','operations','viewer')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  text
);

-- ─── settings (one row per book) ───────────────────────────────────────
create table if not exists cf_settings (
  book                     text primary key check (book in ('live','demo')),
  min_cash_manual          numeric(14,2) not null default 1000000,
  min_cash_mode            text not null default 'higher'
                             check (min_cash_mode in ('manual','computed','higher')),
  min_cash_horizon_days    int not null default 30,
  gst_rate_pct             numeric(6,3) not null default 5,      -- output GST on apparel
  gst_net_payable_pct      numeric(6,3) not null default 3.5,    -- net of ITC, % of net sales
  default_cogs_pct         numeric(6,3) not null default 38,     -- fallback when no SKU cost
  receivables_from_sales   boolean not null default true,        -- daily sales auto-create gateway/COD receivables
  large_amount_multiple    numeric(6,2) not null default 3,      -- validation: x * 30d avg
  large_amount_floor       numeric(14,2) not null default 100000,
  recon_tolerance          numeric(14,2) not null default 1,
  slow_moving_days         int not null default 90,              -- cover days above this = slow
  dead_stock_days          int not null default 90,              -- no sale for this long = dead
  updated_at               timestamptz not null default now(),
  updated_by               text
);
insert into cf_settings(book) values ('live'),('demo') on conflict do nothing;

-- ─── chart of accounts / categories ────────────────────────────────────
-- pnl_class decides how a cash/accrual row feeds the MIS:
--   revenue | cogs | marketing | shipping | salaries | opex | finance_cost
--   inventory (production spend → stock, not P&L) | tax (GST/TDS — balance
--   sheet) | financing (loan principal, capital) | refund (already netted
--   in net sales) | collection (settling a receivable) | transfer | none
create table if not exists cf_categories (
  code        text primary key,
  name        text not null,
  direction   text not null check (direction in ('in','out','both')),
  grp         text not null,
  pnl_class   text not null,
  is_critical boolean not null default false,  -- counts toward minimum cash
  is_custom   boolean not null default false,
  sort        int not null default 100,
  active      boolean not null default true
);

insert into cf_categories(code,name,direction,grp,pnl_class,is_critical,sort) values
 -- inflows
 ('sales_d2c',            'D2C sales (Shopify)',           'in','Sales','revenue',false,1),
 ('sales_marketplace',    'Marketplace sales',             'in','Sales','revenue',false,2),
 ('sales_b2b',            'B2B / wholesale sales',         'in','Sales','revenue',false,3),
 ('collect_gateway',      'Payment gateway settlement',    'in','Collections','collection',false,10),
 ('collect_cod',          'COD remittance',                'in','Collections','collection',false,11),
 ('collect_marketplace',  'Marketplace settlement',        'in','Collections','collection',false,12),
 ('collect_b2b',          'B2B collection',                'in','Collections','collection',false,13),
 ('income_other',         'Other income',                  'in','Other','opex',false,14),
 ('capital_in',           'Capital / loan received',       'in','Financing','financing',false,15),
 -- production
 ('prod_manufacturing',   'Manufacturing',                 'out','Production','inventory',false,20),
 ('prod_fabric',          'Fabric',                        'out','Production','inventory',false,21),
 ('prod_raw',             'Raw materials',                 'out','Production','inventory',false,22),
 ('prod_printing',        'Printing',                      'out','Production','inventory',false,23),
 ('prod_embroidery',      'Embroidery',                    'out','Production','inventory',false,24),
 ('prod_washing',         'Washing',                       'out','Production','inventory',false,25),
 ('prod_labels',          'Labels',                        'out','Production','inventory',false,26),
 ('prod_trims',           'Trims',                         'out','Production','inventory',false,27),
 ('prod_packaging',       'Packaging',                     'out','Production','opex',false,28),
 -- logistics
 ('log_delhivery',        'Delhivery',                     'out','Logistics','shipping',true,30),
 ('log_courier_other',    'Other courier',                 'out','Logistics','shipping',true,31),
 ('log_forward',          'Forward shipping',              'out','Logistics','shipping',true,32),
 ('log_reverse',          'Reverse shipping',              'out','Logistics','shipping',false,33),
 ('log_rto',              'RTO charges',                   'out','Logistics','shipping',false,34),
 -- marketing
 ('mkt_meta',             'Meta Ads',                      'out','Marketing','marketing',false,40),
 ('mkt_google',           'Google Ads',                    'out','Marketing','marketing',false,41),
 ('mkt_influencer',       'Influencer marketing',          'out','Marketing','marketing',false,42),
 ('mkt_shoots',           'Shoots',                        'out','Marketing','marketing',false,43),
 ('mkt_creative',         'Creative',                      'out','Marketing','marketing',false,44),
 ('mkt_agency',           'Agencies',                      'out','Marketing','marketing',false,45),
 ('mkt_other',            'Other marketing',               'out','Marketing','marketing',false,46),
 -- operations
 ('ops_salaries',         'Salaries',                      'out','Operations','salaries',true,50),
 ('ops_rent',             'Rent',                          'out','Operations','opex',true,51),
 ('ops_utilities',        'Utilities',                     'out','Operations','opex',true,52),
 ('ops_software',         'Software',                      'out','Operations','opex',false,53),
 ('ops_accounting',       'Accounting',                    'out','Operations','opex',false,54),
 ('ops_legal',            'Legal',                         'out','Operations','opex',false,55),
 ('ops_office',           'Office expenses',               'out','Operations','opex',false,56),
 -- finance / tax
 ('tax_gst',              'GST',                           'out','Finance & Tax','tax',true,60),
 ('tax_tds',              'TDS',                           'out','Finance & Tax','tax',true,61),
 ('tax_income',           'Income tax',                    'out','Finance & Tax','tax',true,62),
 ('fin_emi',              'EMI',                           'out','Finance & Tax','financing',true,63),
 ('fin_loan',             'Loan repayment',                'out','Finance & Tax','financing',true,64),
 ('fin_interest',         'Interest',                      'out','Finance & Tax','finance_cost',true,65),
 ('fin_bank_charges',     'Bank charges',                  'out','Finance & Tax','opex',false,66),
 ('fin_gateway_charges',  'Payment gateway charges',       'out','Finance & Tax','opex',false,67),
 -- other
 ('refund_paid',          'Customer refunds paid',         'out','Other','refund',false,70),
 ('supplier_payment',     'Supplier payment (unclassified)','out','Production','inventory',false,71),
 ('expense_other',        'Other expense',                 'out','Other','opex',false,80),
 ('owner_drawings',       'Owner drawings',                'out','Financing','financing',false,81),
 ('transfer',             'Transfer between own accounts', 'both','Other','transfer',false,90),
 ('bank_adjustment',      'Bank reconciliation adjustment','both','Other','none',false,91)
on conflict (code) do nothing;

-- ─── bank / cash accounts ──────────────────────────────────────────────
create table if not exists cf_bank_accounts (
  id                uuid primary key default gen_random_uuid(),
  book              text not null default 'live' check (book in ('live','demo')),
  name              text not null,
  bank_name         text,
  account_last4     text,
  kind              text not null default 'bank' check (kind in ('bank','cash','wallet')),
  opening_balance   numeric(14,2) not null default 0,
  opening_date      date not null,
  restricted_amount numeric(14,2) not null default 0,   -- FD lien, OD margin, etc.
  is_primary        boolean not null default false,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (book, name)
);

-- ─── parties (suppliers, customers, platforms, couriers, …) ────────────
create table if not exists cf_parties (
  id                  uuid primary key default gen_random_uuid(),
  book                text not null default 'live' check (book in ('live','demo')),
  name                text not null,
  kind                text not null check (kind in ('supplier','customer','platform','courier','gateway','employee','landlord','government','lender','other')),
  gstin               text,
  phone               text,
  payment_terms_days  int not null default 0,
  note                text,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);
create unique index if not exists cf_parties_name_uq on cf_parties(book, lower(name), kind);

-- ─── settlement channels (gateways, COD couriers, marketplaces) ────────
create table if not exists cf_channels (
  code                 text primary key,
  name                 text not null,
  kind                 text not null check (kind in ('gateway','cod','marketplace','b2b','other')),
  fee_pct              numeric(6,3) not null default 0,
  settlement_lag_days  int not null default 0,
  active               boolean not null default true
);
insert into cf_channels(code,name,kind,fee_pct,settlement_lag_days) values
 ('razorpay','Razorpay','gateway',2.0,2),
 ('payu','PayU','gateway',2.0,2),
 ('cashfree','Cashfree','gateway',1.9,1),
 ('gateway_other','Other gateway','gateway',2.0,3),
 ('delhivery_cod','Delhivery COD','cod',1.5,8),
 ('cod_other','Other courier COD','cod',2.0,10),
 ('myntra','Myntra','marketplace',28,30),
 ('ajio','AJIO','marketplace',25,30),
 ('amazon','Amazon','marketplace',20,14),
 ('flipkart','Flipkart','marketplace',22,14),
 ('marketplace_other','Other marketplace','marketplace',20,30),
 ('b2b','B2B / wholesale','b2b',0,30),
 ('other','Other','other',0,0)
on conflict (code) do nothing;

-- ─── imports ───────────────────────────────────────────────────────────
create table if not exists cf_imports (
  id              uuid primary key default gen_random_uuid(),
  book            text not null default 'live' check (book in ('live','demo')),
  import_type     text not null,
  file_name       text,
  file_hash       text not null,
  bank_account_id uuid references cf_bank_accounts(id),
  mapping         jsonb not null default '{}',
  total_rows      int not null default 0,
  success_rows    int not null default 0,
  failed_rows     int not null default 0,
  duplicate_rows  int not null default 0,
  status          text not null default 'completed' check (status in ('completed','completed_with_errors','failed','reverted')),
  imported_by     text,
  created_at      timestamptz not null default now(),
  unique (book, import_type, file_hash)
);
create table if not exists cf_import_errors (
  id          bigserial primary key,
  import_id   uuid not null references cf_imports(id) on delete cascade,
  row_number  int not null,
  kind        text not null default 'error' check (kind in ('error','duplicate')),
  error       text not null,
  raw         jsonb
);
create table if not exists cf_import_mappings (
  book         text not null default 'live',
  import_type  text not null,
  name         text not null,
  mapping      jsonb not null,
  updated_at   timestamptz not null default now(),
  primary key (book, import_type, name)
);

-- ─── daily 10 AM finance update ────────────────────────────────────────
create table if not exists cf_daily_updates (
  id                 uuid primary key default gen_random_uuid(),
  book               text not null default 'live' check (book in ('live','demo')),
  update_date        date not null,                 -- the business day being reported
  status             text not null default 'draft' check (status in ('draft','partial','submitted','reopened')),
  sections_complete  jsonb not null default '{}',
  payload            jsonb not null default '{}',
  validation         jsonb not null default '{}',
  recon_difference   numeric(14,2) not null default 0,
  recon_note         text,
  is_late            boolean not null default false,
  submitted_by       text,
  submitted_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (book, update_date)
);

-- ─── recurring expenses ────────────────────────────────────────────────
create table if not exists cf_recurring_expenses (
  id               uuid primary key default gen_random_uuid(),
  book             text not null default 'live' check (book in ('live','demo')),
  name             text not null,
  category_code    text not null references cf_categories(code),
  party_id         uuid references cf_parties(id),
  amount           numeric(14,2) not null check (amount > 0),
  frequency        text not null check (frequency in ('weekly','monthly','quarterly','yearly')),
  day_of_month     int check (day_of_month between 1 and 31),
  weekday          int check (weekday between 1 and 7),   -- ISO, 1 = Monday
  start_date       date not null,
  end_date         date,
  is_critical      boolean not null default false,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ─── purchase orders + payment schedule ────────────────────────────────
create table if not exists cf_purchase_orders (
  id                      uuid primary key default gen_random_uuid(),
  book                    text not null default 'live' check (book in ('live','demo')),
  po_number               text not null,
  party_id                uuid references cf_parties(id),
  item_desc               text not null,
  category_code           text not null default 'prod_manufacturing' references cf_categories(code),
  sku_id                  uuid,
  qty                     numeric(14,2),
  total_value             numeric(14,2) not null check (total_value > 0),
  order_date              date not null,
  expected_delivery_date  date,
  payment_terms           text not null default 'custom' check (payment_terms in ('100_advance','50_50','30_40_30','on_delivery','custom')),
  status                  text not null default 'open' check (status in ('draft','open','in_production','partially_received','received','closed','cancelled')),
  received_value          numeric(14,2) not null default 0,   -- value of goods received so far (for supplier-advance calc)
  note                    text,
  daily_update_id         uuid references cf_daily_updates(id),
  created_by              text,
  created_at              timestamptz not null default now(),
  unique (book, po_number)
);
create table if not exists cf_po_installments (
  id                 uuid primary key default gen_random_uuid(),
  book               text not null default 'live' check (book in ('live','demo')),
  po_id              uuid not null references cf_purchase_orders(id) on delete cascade,
  seq                int not null,
  label              text not null,
  pct                numeric(7,3),
  amount             numeric(14,2) not null check (amount >= 0),
  due_date           date not null,
  expected_pay_date  date,
  paid_amount        numeric(14,2) not null default 0,   -- maintained by trigger from cf_allocations
  last_paid_date     date,
  status             text not null default 'open' check (status in ('open','partial','paid','cancelled')),
  unique (po_id, seq)
);

-- ─── payables (bills / commitments not tied to a PO) ───────────────────
create table if not exists cf_payables (
  id                 uuid primary key default gen_random_uuid(),
  book               text not null default 'live' check (book in ('live','demo')),
  party_id           uuid references cf_parties(id),
  category_code      text not null references cf_categories(code),
  reference          text,
  description        text,
  bill_date          date not null,              -- expense recognised on this date
  amount             numeric(14,2) not null check (amount > 0),
  paid_amount        numeric(14,2) not null default 0,   -- maintained by trigger
  due_date           date not null,
  expected_pay_date  date,
  last_paid_date     date,
  priority           text not null default 'normal' check (priority in ('critical','high','normal','low')),
  status             text not null default 'open' check (status in ('open','partial','paid','cancelled')),
  recurring_id       uuid references cf_recurring_expenses(id),
  source             text not null default 'manual',
  daily_update_id    uuid references cf_daily_updates(id),
  import_id          uuid references cf_imports(id),
  dedupe_key         text,
  created_by         text,
  created_at         timestamptz not null default now()
);
create unique index if not exists cf_payables_dedupe on cf_payables(book, dedupe_key) where dedupe_key is not null;

-- ─── receivables (gateway / COD / marketplace / B2B) ───────────────────
create table if not exists cf_receivables (
  id                 uuid primary key default gen_random_uuid(),
  book               text not null default 'live' check (book in ('live','demo')),
  kind               text not null check (kind in ('gateway','cod','marketplace','b2b','other')),
  channel_code       text references cf_channels(code),
  party_id           uuid references cf_parties(id),
  reference          text,                         -- invoice / order / AWB / settlement batch
  origin_date        date not null,                -- sale / invoice date (ageing starts here)
  gross_amount       numeric(14,2) not null default 0,
  fees               numeric(14,2) not null default 0,   -- gateway fee / commission / courier deduction
  returns_amount     numeric(14,2) not null default 0,   -- marketplace returns
  net_amount         numeric(14,2) not null check (net_amount >= 0),  -- cash expected
  collected_amount   numeric(14,2) not null default 0,   -- maintained by trigger
  written_off_amount numeric(14,2) not null default 0,   -- maintained by trigger (RTO, short-pay)
  expected_date      date not null,
  actual_date        date,
  confidence         text not null default 'confirmed' check (confidence in ('confirmed','probable','possible')),
  status             text not null default 'open' check (status in ('open','partial','collected','written_off','disputed','cancelled')),
  note               text,
  source             text not null default 'manual',
  daily_update_id    uuid references cf_daily_updates(id),
  import_id          uuid references cf_imports(id),
  dedupe_key         text,
  created_by         text,
  created_at         timestamptz not null default now()
);
create unique index if not exists cf_receivables_dedupe on cf_receivables(book, dedupe_key) where dedupe_key is not null;
create index if not exists cf_receivables_open on cf_receivables(book, kind, status, expected_date);

-- ─── SKUs + inventory movements ────────────────────────────────────────
create table if not exists cf_skus (
  id               uuid primary key default gen_random_uuid(),
  book             text not null default 'live' check (book in ('live','demo')),
  sku              text not null,
  product          text not null,
  category         text,
  cost_per_unit    numeric(14,2) not null default 0 check (cost_per_unit >= 0),
  selling_price    numeric(14,2) not null default 0,
  units_on_hand    numeric(14,2) not null default 0,   -- maintained by trigger = Σ movements
  units_wip        numeric(14,2) not null default 0,   -- production in progress
  units_incoming   numeric(14,2) not null default 0,   -- in transit / ready at vendor
  launched_on      date,
  last_sale_date   date,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (book, sku)
);
alter table cf_purchase_orders drop constraint if exists cf_purchase_orders_sku_fk;
alter table cf_purchase_orders add constraint cf_purchase_orders_sku_fk foreign key (sku_id) references cf_skus(id);

create table if not exists cf_inventory_movements (
  id          uuid primary key default gen_random_uuid(),
  book        text not null default 'live' check (book in ('live','demo')),
  sku_id      uuid not null references cf_skus(id) on delete cascade,
  mv_date     date not null,
  kind        text not null check (kind in ('opening','receipt','sale','return','adjust','writeoff')),
  qty         numeric(14,2) not null,    -- signed: + in, − out
  unit_cost   numeric(14,2),
  reference   text,
  source      text not null default 'manual',
  import_id   uuid references cf_imports(id),
  dedupe_key  text,
  created_by  text,
  created_at  timestamptz not null default now()
);
create unique index if not exists cf_invmv_dedupe on cf_inventory_movements(book, dedupe_key) where dedupe_key is not null;
create index if not exists cf_invmv_sku on cf_inventory_movements(sku_id, mv_date);

-- ─── daily sales summary (detail behind the revenue accrual) ───────────
create table if not exists cf_daily_sales (
  id               uuid primary key default gen_random_uuid(),
  book             text not null default 'live' check (book in ('live','demo')),
  sale_date        date not null,
  channel          text not null default 'shopify' check (channel in ('shopify','marketplace','b2b','other')),
  orders           int not null default 0,
  order_value      numeric(14,2) not null default 0,   -- after discounts = prepaid + cod
  prepaid_sales    numeric(14,2) not null default 0,
  cod_sales        numeric(14,2) not null default 0,
  discounts        numeric(14,2) not null default 0,
  cancellations    numeric(14,2) not null default 0,
  refunds          numeric(14,2) not null default 0,
  rto_value        numeric(14,2) not null default 0,
  units_sold       numeric(14,2),
  cogs             numeric(14,2),                      -- at cost
  net_sales        numeric(14,2) generated always as (order_value - cancellations - refunds - rto_value) stored,
  source           text not null default 'daily_update',
  daily_update_id  uuid references cf_daily_updates(id),
  import_id        uuid references cf_imports(id),
  status           text not null default 'posted' check (status in ('posted','void')),
  created_at       timestamptz not null default now()
);
create unique index if not exists cf_daily_sales_uq on cf_daily_sales(book, sale_date, channel) where status = 'posted';

-- ─── THE LEDGER ────────────────────────────────────────────────────────
create table if not exists cf_transactions (
  id                 uuid primary key default gen_random_uuid(),
  book               text not null default 'live' check (book in ('live','demo')),
  nature             text not null check (nature in ('cash','accrual','expected')),
  direction          text not null check (direction in ('in','out')),
  amount             numeric(14,2) not null check (amount > 0),
  txn_date           date not null,          -- cash: date money moved; accrual: recognition; expected: expected date
  category_code      text not null references cf_categories(code),
  party_id           uuid references cf_parties(id),
  bank_account_id    uuid references cf_bank_accounts(id),
  channel_code       text references cf_channels(code),
  confidence         text not null default 'actual' check (confidence in ('actual','confirmed','probable','possible')),
  status             text not null default 'posted' check (status in ('posted','void')),
  source             text not null default 'manual'
                       check (source in ('manual','daily_update','import','api','bank_recon','system','demo')),
  source_ref         text,
  description        text,
  dedupe_key         text,
  daily_update_id    uuid references cf_daily_updates(id),
  import_id          uuid references cf_imports(id),
  recurring_id       uuid references cf_recurring_expenses(id),
  payable_id         uuid references cf_payables(id),   -- accrual row that recognised this bill
  transfer_group     uuid,                   -- pairs the two legs of an own-account transfer
  created_by         text,
  created_at         timestamptz not null default now(),
  void_reason        text,
  voided_by          text,
  voided_at          timestamptz,
  constraint cf_txn_cash_has_account check (nature <> 'cash' or bank_account_id is not null),
  constraint cf_txn_cash_is_actual   check ((nature = 'cash') = (confidence = 'actual')),
  constraint cf_txn_void_reason      check (status <> 'void' or coalesce(void_reason,'') <> '')
);
create unique index if not exists cf_txn_dedupe on cf_transactions(book, dedupe_key) where dedupe_key is not null and status = 'posted';
create index if not exists cf_txn_book_date on cf_transactions(book, nature, txn_date) where status = 'posted';
create index if not exists cf_txn_daily on cf_transactions(daily_update_id);

-- ─── allocations: settle documents with cash (or write them off) ───────
create table if not exists cf_allocations (
  id                 uuid primary key default gen_random_uuid(),
  book               text not null default 'live' check (book in ('live','demo')),
  kind               text not null check (kind in ('collection','payment','writeoff')),
  txn_id             uuid references cf_transactions(id),
  receivable_id      uuid references cf_receivables(id) on delete cascade,
  payable_id         uuid references cf_payables(id) on delete cascade,
  po_installment_id  uuid references cf_po_installments(id) on delete cascade,
  amount             numeric(14,2) not null check (amount > 0),
  alloc_date         date not null,
  reason             text,
  daily_update_id    uuid references cf_daily_updates(id),
  created_by         text,
  created_at         timestamptz not null default now(),
  constraint cf_alloc_one_target check (num_nonnulls(receivable_id, payable_id, po_installment_id) = 1),
  constraint cf_alloc_cash_needs_txn check (kind = 'writeoff' or txn_id is not null)
);
create index if not exists cf_alloc_txn on cf_allocations(txn_id);
create index if not exists cf_alloc_rec on cf_allocations(receivable_id);
create index if not exists cf_alloc_pay on cf_allocations(payable_id);
create index if not exists cf_alloc_poi on cf_allocations(po_installment_id);

-- ─── bank balances (reported vs system, per account per day) ───────────
create table if not exists cf_bank_balances (
  id                 uuid primary key default gen_random_uuid(),
  book               text not null default 'live' check (book in ('live','demo')),
  bank_account_id    uuid not null references cf_bank_accounts(id),
  bal_date           date not null,
  opening_reported   numeric(14,2),
  closing_reported   numeric(14,2) not null,
  system_closing     numeric(14,2),
  difference         numeric(14,2),
  source             text not null default 'daily_update' check (source in ('daily_update','statement','manual')),
  daily_update_id    uuid references cf_daily_updates(id),
  note               text,
  created_by         text,
  created_at         timestamptz not null default now(),
  unique (book, bank_account_id, bal_date, source)
);

-- ─── bank statement lines (for reconciliation) ─────────────────────────
create table if not exists cf_bank_transactions (
  id               uuid primary key default gen_random_uuid(),
  book             text not null default 'live' check (book in ('live','demo')),
  bank_account_id  uuid not null references cf_bank_accounts(id),
  txn_date         date not null,
  description      text,
  reference        text,
  direction        text not null check (direction in ('in','out')),
  amount           numeric(14,2) not null check (amount > 0),
  running_balance  numeric(14,2),
  import_id        uuid references cf_imports(id),
  dedupe_key       text not null,
  match_status     text not null default 'unmatched' check (match_status in ('unmatched','auto','manual','ignored','posted')),
  matched_txn_id   uuid references cf_transactions(id),
  matched_by       text,
  matched_at       timestamptz,
  created_at       timestamptz not null default now(),
  unique (book, dedupe_key)
);
create index if not exists cf_banktxn_status on cf_bank_transactions(book, bank_account_id, match_status, txn_date);

-- ─── forecast assumptions + frozen weekly snapshots ────────────────────
create table if not exists cf_forecast_assumptions (
  book       text not null default 'live' check (book in ('live','demo')),
  scenario   text not null check (scenario in ('base','optimistic','worst')),
  key        text not null,
  value      numeric(14,4) not null,
  note       text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (book, scenario, key)
);

create table if not exists cf_forecast_snapshots (
  id                uuid primary key default gen_random_uuid(),
  book              text not null default 'live' check (book in ('live','demo')),
  as_of             date not null,       -- date the forecast was frozen (Monday)
  scenario          text not null,
  week_index        int not null,
  week_start        date not null,
  opening           numeric(14,2) not null,
  inflow            numeric(14,2) not null,
  outflow           numeric(14,2) not null,
  closing           numeric(14,2) not null,
  inflow_confirmed  numeric(14,2) not null default 0,
  inflow_probable   numeric(14,2) not null default 0,
  inflow_possible   numeric(14,2) not null default 0,
  detail            jsonb not null default '{}',   -- per-category inflow/outflow
  created_at        timestamptz not null default now(),
  unique (book, as_of, scenario, week_start)
);

-- ─── working-capital snapshots (trends, CCC history) ───────────────────
create table if not exists cf_wc_snapshots (
  book               text not null default 'live' check (book in ('live','demo')),
  snap_date          date not null,
  cash               numeric(14,2) not null default 0,
  inventory_value    numeric(14,2) not null default 0,
  receivables        numeric(14,2) not null default 0,
  payables           numeric(14,2) not null default 0,
  supplier_advances  numeric(14,2) not null default 0,
  net_sales_30d      numeric(14,2) not null default 0,
  cogs_30d           numeric(14,2) not null default 0,
  dio                numeric(10,2),
  dso                numeric(10,2),
  dpo                numeric(10,2),
  ccc                numeric(10,2),
  primary key (book, snap_date)
);

-- ─── MIS manual adjustments (accountant entries: depreciation, etc.) ───
create table if not exists cf_mis_adjustments (
  id          uuid primary key default gen_random_uuid(),
  book        text not null default 'live' check (book in ('live','demo')),
  month       date not null check (extract(day from month) = 1),
  line        text not null check (line in ('revenue','cogs','marketing','shipping','salaries','opex','finance_cost','other')),
  amount      numeric(14,2) not null,     -- signed: + increases the line
  note        text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);

-- ─── alerts ────────────────────────────────────────────────────────────
create table if not exists cf_alert_rules (
  book       text not null default 'live' check (book in ('live','demo')),
  code       text not null,
  name       text not null,
  severity   text not null check (severity in ('high','medium','info')),
  threshold  numeric(14,4),
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (book, code)
);
insert into cf_alert_rules(book,code,name,severity,threshold)
select b.book, r.code, r.name, r.severity, r.threshold from (values
  ('below_min_reserve',         'Projected cash below minimum reserve',            'high',   null),
  ('cash_negative',             'Projected cash goes negative',                    'high',   null),
  ('supplier_due_14d',          'Supplier payments due in next 14 days above ₹',   'high',   500000),
  ('cod_overdue',               'Overdue COD settlements above ₹',                 'high',   100000),
  ('receivables_overdue',       'Overdue receivables (all) above ₹',               'medium', 200000),
  ('inventory_vs_sales',        'Inventory growth exceeds sales growth by (pp)',   'high',   20),
  ('inventory_coverage',        'Inventory coverage above (days)',                 'high',   75),
  ('marketing_over_forecast',   'Marketing cash outflow above forecast by (%)',    'medium', 20),
  ('collections_below_forecast','Cash collections below forecast by (%)',          'medium', 15),
  ('daily_update_missing',      'Yesterday''s finance update missing',             'high',   null),
  ('bank_recon_difference',     'Bank balance does not reconcile (₹ tolerance)',   'high',   1),
  ('payables_overdue',          'Overdue payables above ₹',                        'medium', 100000)
) as r(code,name,severity,threshold)
cross join (values ('live'),('demo')) as b(book)
on conflict do nothing;

create table if not exists cf_alerts (
  id               uuid primary key default gen_random_uuid(),
  book             text not null default 'live' check (book in ('live','demo')),
  code             text not null,
  severity         text not null,
  message          text not null,
  amount           numeric(14,2),
  fired_on         date not null,
  acknowledged_by  text,
  acknowledged_at  timestamptz,
  created_at       timestamptz not null default now(),
  unique (book, code, fired_on)
);

-- ─── audit log ─────────────────────────────────────────────────────────
create table if not exists cf_audit_log (
  id          bigserial primary key,
  book        text,
  table_name  text not null,
  row_id      text not null,
  action      text not null check (action in ('insert','update','delete')),
  old_values  jsonb,
  new_values  jsonb,
  reason      text,
  changed_by  text,
  changed_at  timestamptz not null default now()
);
create index if not exists cf_audit_row on cf_audit_log(table_name, row_id);
create index if not exists cf_audit_time on cf_audit_log(changed_at desc);

-- ═══════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════

-- The API runs every write inside a transaction that first does
--   select set_config('cf.actor', <email>, true), set_config('cf.reason', <why>, true)
-- so the audit trigger knows WHO changed WHAT and WHY, and the guard
-- trigger can refuse unexplained edits. (true = local to the transaction.)
create or replace function cf_ctx(k text) returns text language sql stable set search_path = public as $$
  select nullif(current_setting('cf.' || k, true), '')
$$;

create or replace function cf_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor  text := coalesce(cf_ctx('actor'), current_user);
  reason text := cf_ctx('reason');
  o jsonb; n jsonb; diff_old jsonb := '{}'; diff_new jsonb := '{}'; k text;
  rid text; bk text;
begin
  if tg_op = 'INSERT' then
    n := to_jsonb(new);
    rid := coalesce(n->>'id', n->>'code', n->>'email', n->>'key', '?'); bk := n->>'book';
    insert into cf_audit_log(book,table_name,row_id,action,new_values,reason,changed_by)
      values (bk, tg_table_name, rid, 'insert', n, reason, actor);
    return new;
  elsif tg_op = 'UPDATE' then
    o := to_jsonb(old); n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      if k in ('updated_at') then continue; end if;
      if (o->k) is distinct from (n->k) then
        diff_old := diff_old || jsonb_build_object(k, o->k);
        diff_new := diff_new || jsonb_build_object(k, n->k);
      end if;
    end loop;
    if diff_new = '{}'::jsonb then return new; end if;
    rid := coalesce(n->>'id', n->>'code', n->>'email', n->>'key', '?'); bk := n->>'book';
    insert into cf_audit_log(book,table_name,row_id,action,old_values,new_values,reason,changed_by)
      values (bk, tg_table_name, rid, 'update', diff_old, diff_new, reason, actor);
    return new;
  else
    o := to_jsonb(old);
    rid := coalesce(o->>'id', o->>'code', o->>'email', o->>'key', '?'); bk := o->>'book';
    insert into cf_audit_log(book,table_name,row_id,action,old_values,reason,changed_by)
      values (bk, tg_table_name, rid, 'delete', o, reason, actor);
    return old;
  end if;
end $$;

-- Financial history must never be silently overwritten:
--  * changing amount/date/direction/category/account of a posted ledger row
--    requires a reason header
--  * hard deletes of ledger / daily-update rows are refused in the live book
create or replace function cf_guard_history() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.book = 'live' then
      raise exception 'Hard delete is not allowed on % in the live book — void it with a reason instead', tg_table_name;
    end if;
    return old;
  end if;
  if tg_table_name = 'cf_transactions' then
    if (old.amount, old.txn_date, old.direction, old.category_code, coalesce(old.bank_account_id::text,''), old.nature, old.status)
       is distinct from
       (new.amount, new.txn_date, new.direction, new.category_code, coalesce(new.bank_account_id::text,''), new.nature, new.status)
       and cf_ctx('reason') is null then
      raise exception 'A reason is required to change a posted financial transaction';
    end if;
    if old.status = 'void' and new.status = 'posted' then
      raise exception 'A voided transaction cannot be revived — post a new one';
    end if;
  elsif tg_table_name = 'cf_daily_updates' then
    if old.status = 'submitted' and new.payload is distinct from old.payload and cf_ctx('reason') is null then
      raise exception 'A reason is required to change a submitted daily update';
    end if;
  end if;
  return new;
end $$;

-- Keep receivable / payable / installment totals = Σ allocations (recalc,
-- not increment — idempotent and safe for bulk inserts).
create or replace function cf_recalc_doc(p_rec uuid, p_pay uuid, p_poi uuid) returns void language plpgsql set search_path = public as $$
declare c numeric; w numeric; d date;
begin
  if p_rec is not null then
    select coalesce(sum(amount) filter (where kind='collection'),0),
           coalesce(sum(amount) filter (where kind='writeoff'),0),
           max(alloc_date) filter (where kind='collection')
      into c, w, d from cf_allocations where receivable_id = p_rec;
    update cf_receivables r set
      collected_amount = c, written_off_amount = w, actual_date = d,
      status = case
        when r.status in ('disputed','cancelled') then r.status
        when c + w >= r.net_amount - 0.5 and c > 0 then 'collected'
        when c + w >= r.net_amount - 0.5 then 'written_off'
        when c + w > 0 then 'partial'
        else 'open' end
    where r.id = p_rec;
  end if;
  if p_pay is not null then
    select coalesce(sum(amount),0), max(alloc_date) into c, d from cf_allocations where payable_id = p_pay and kind <> 'writeoff';
    select coalesce(sum(amount),0) into w from cf_allocations where payable_id = p_pay and kind = 'writeoff';
    update cf_payables p set paid_amount = c, last_paid_date = d,
      status = case when p.status = 'cancelled' then 'cancelled'
                    when c + w >= p.amount - 0.5 then 'paid'
                    when c + w > 0 then 'partial' else 'open' end
    where p.id = p_pay;
  end if;
  if p_poi is not null then
    select coalesce(sum(amount),0), max(alloc_date) into c, d from cf_allocations where po_installment_id = p_poi;
    update cf_po_installments i set paid_amount = c, last_paid_date = d,
      status = case when i.status = 'cancelled' then 'cancelled'
                    when c >= i.amount - 0.5 then 'paid'
                    when c > 0 then 'partial' else 'open' end
    where i.id = p_poi;
  end if;
end $$;

create or replace function cf_alloc_sync() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform cf_recalc_doc(old.receivable_id, old.payable_id, old.po_installment_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform cf_recalc_doc(new.receivable_id, new.payable_id, new.po_installment_id); return new; end if;
  return old;
end $$;

-- Voiding a cash txn releases whatever it settled.
create or replace function cf_txn_void_release() returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'posted' and new.status = 'void' then
    delete from cf_allocations where txn_id = new.id;
  end if;
  return new;
end $$;

-- units_on_hand = Σ movements; last_sale_date = latest sale.
create or replace function cf_invmv_sync() returns trigger language plpgsql set search_path = public as $$
declare s uuid := coalesce(new.sku_id, old.sku_id);
begin
  update cf_skus k set
    units_on_hand  = coalesce((select sum(qty) from cf_inventory_movements where sku_id = s), 0),
    last_sale_date = (select max(mv_date) from cf_inventory_movements where sku_id = s and kind = 'sale')
  where k.id = s;
  return coalesce(new, old);
end $$;

-- PO installment status when a PO is cancelled.
create or replace function cf_po_cancel() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update cf_po_installments set status = 'cancelled' where po_id = new.id and status in ('open','partial');
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['cf_transactions','cf_receivables','cf_payables','cf_purchase_orders','cf_po_installments',
    'cf_daily_updates','cf_daily_sales','cf_skus','cf_bank_accounts','cf_bank_balances','cf_bank_transactions',
    'cf_recurring_expenses','cf_settings','cf_forecast_assumptions','cf_users','cf_categories','cf_alert_rules',
    'cf_mis_adjustments','cf_parties','cf_channels','cf_allocations','cf_imports'] loop
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function cf_audit()', t, t);
  end loop;
end $$;

drop trigger if exists cf_transactions_guard on cf_transactions;
create trigger cf_transactions_guard before update or delete on cf_transactions for each row execute function cf_guard_history();
drop trigger if exists cf_daily_updates_guard on cf_daily_updates;
create trigger cf_daily_updates_guard before update or delete on cf_daily_updates for each row execute function cf_guard_history();
drop trigger if exists cf_transactions_void on cf_transactions;
create trigger cf_transactions_void after update on cf_transactions for each row execute function cf_txn_void_release();
drop trigger if exists cf_allocations_sync on cf_allocations;
create trigger cf_allocations_sync after insert or update or delete on cf_allocations for each row execute function cf_alloc_sync();
drop trigger if exists cf_invmv_sync on cf_inventory_movements;
create trigger cf_invmv_sync after insert or update or delete on cf_inventory_movements for each row execute function cf_invmv_sync();
drop trigger if exists cf_po_cancel on cf_purchase_orders;
create trigger cf_po_cancel after update on cf_purchase_orders for each row execute function cf_po_cancel();

-- ═══════════════════════════════════════════════════════════════════════
-- Convenience views (named after the spec's entities)
-- ═══════════════════════════════════════════════════════════════════════
create or replace view cf_suppliers as select * from cf_parties where kind = 'supplier';
create or replace view cf_collections as select * from cf_transactions where nature = 'cash' and direction = 'in' and status = 'posted';
create or replace view cf_expenses as select * from cf_transactions where nature = 'cash' and direction = 'out' and status = 'posted';
create or replace view cf_payment_gateways as select * from cf_channels where kind = 'gateway';
create or replace view cf_cod_settlements as select * from cf_receivables where kind = 'cod';
create or replace view cf_gateway_settlements as select * from cf_receivables where kind = 'gateway';
create or replace view cf_marketplace_settlements as select * from cf_receivables where kind = 'marketplace';
create or replace view cf_po_payments as
  select a.id, a.book, i.po_id, a.po_installment_id, a.txn_id, a.amount, a.alloc_date, t.bank_account_id
  from cf_allocations a join cf_po_installments i on i.id = a.po_installment_id
  left join cf_transactions t on t.id = a.txn_id;
alter view cf_suppliers set (security_invoker = true);
alter view cf_collections set (security_invoker = true);
alter view cf_expenses set (security_invoker = true);
alter view cf_payment_gateways set (security_invoker = true);
alter view cf_cod_settlements set (security_invoker = true);
alter view cf_gateway_settlements set (security_invoker = true);
alter view cf_marketplace_settlements set (security_invoker = true);
alter view cf_po_payments set (security_invoker = true);

-- ─── RLS: on everywhere, no policies → service role only ───────────────
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'cf\_%' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Bootstrap the founder as admin.
insert into cf_users(email, name, role, created_by)
values ('shivam03299@gmail.com', 'Shivam', 'admin', 'migration')
on conflict (email) do nothing;
