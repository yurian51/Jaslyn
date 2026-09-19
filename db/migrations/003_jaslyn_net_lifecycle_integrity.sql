alter table net_payments
  add column if not exists correlation_id uuid;

update net_payments
set correlation_id = gen_random_uuid()
where correlation_id is null;

alter table net_payments
  alter column correlation_id set not null;

alter table net_subscriptions
  add column if not exists correlation_id uuid;

update net_subscriptions s
set correlation_id = p.correlation_id
from net_payments p
where p.subscription_id = s.id
  and s.correlation_id is null
  and p.correlation_id is not null;

update net_subscriptions
set correlation_id = gen_random_uuid()
where correlation_id is null;

alter table net_subscriptions
  alter column correlation_id set not null;

create index if not exists idx_net_payments_correlation on net_payments(correlation_id);
create index if not exists idx_net_subscriptions_correlation on net_subscriptions(correlation_id);

create table if not exists net_accounting_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references net_organizations(id) on delete restrict,
  correlation_id uuid,
  nas_identifier text not null,
  acct_session_id text not null,
  event_fingerprint text not null,
  acct_status_type text not null check (acct_status_type in ('Start','Interim-Update','Stop')),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (nas_identifier, acct_session_id, event_fingerprint)
);

create index if not exists idx_net_accounting_events_correlation
  on net_accounting_events(correlation_id, received_at desc);

create index if not exists idx_net_accounting_events_session
  on net_accounting_events(nas_identifier, acct_session_id, received_at desc);
