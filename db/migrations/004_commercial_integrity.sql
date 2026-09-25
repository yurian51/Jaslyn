create table if not exists net_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  customer_id uuid not null references net_customers(id) on delete restrict,
  subscription_id uuid references net_subscriptions(id) on delete restrict,
  invoice_number text not null,
  currency char(3) not null default 'TZS',
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  paid_minor bigint not null default 0 check (paid_minor >= 0),
  status text not null default 'ISSUED' check (status in ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','CANCELLED','REFUNDED')),
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number)
);

create table if not exists net_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references net_invoices(id) on delete restrict,
  plan_id uuid references net_plans(id) on delete restrict,
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  line_total_minor bigint not null check (line_total_minor >= 0),
  created_at timestamptz not null default now()
);

create table if not exists net_wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  customer_id uuid references net_customers(id) on delete restrict,
  reseller_id uuid,
  currency char(3) not null default 'TZS',
  balance_minor bigint not null default 0,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (customer_id is not null or reseller_id is not null),
  unique (organization_id, customer_id),
  unique (organization_id, reseller_id)
);

create table if not exists net_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references net_wallet_accounts(id) on delete restrict,
  correlation_id uuid,
  type text not null check (type in ('CREDIT','DEBIT','REFUND','ADJUSTMENT')),
  amount_minor bigint not null check (amount_minor > 0),
  balance_after_minor bigint not null,
  reference text not null,
  source text not null,
  created_at timestamptz not null default now(),
  unique (wallet_id, reference)
);

create table if not exists net_vouchers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  plan_id uuid not null references net_plans(id) on delete restrict,
  code_hash text not null,
  code_last4 char(4) not null,
  status text not null default 'ISSUED' check (status in ('ISSUED','REDEEMED','EXPIRED','CANCELLED')),
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid references net_customers(id) on delete restrict,
  reseller_id uuid,
  batch_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, code_hash)
);

create index if not exists idx_net_invoices_customer_status on net_invoices(customer_id, status, due_at);
create index if not exists idx_net_invoice_items_invoice on net_invoice_items(invoice_id);
create index if not exists idx_net_wallet_transactions_wallet_created on net_wallet_transactions(wallet_id, created_at desc);
create index if not exists idx_net_vouchers_org_status on net_vouchers(organization_id, status, expires_at);
