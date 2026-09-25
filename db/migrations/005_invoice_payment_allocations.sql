create table if not exists net_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references net_invoices(id) on delete restrict,
  payment_id uuid not null references net_payments(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  created_at timestamptz not null default now(),
  unique (invoice_id, payment_id)
);

create index if not exists idx_net_invoice_payments_invoice on net_invoice_payments(invoice_id, created_at desc);
