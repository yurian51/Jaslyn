create extension if not exists pgcrypto;

create table if not exists net_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists net_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  name text not null,
  timezone text not null default 'Africa/Dar_es_Salaam',
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists net_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  external_ref text,
  name text not null,
  phone text,
  email text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_ref)
);

create table if not exists net_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  name text not null,
  currency char(3) not null default 'TZS',
  price_minor bigint not null check (price_minor >= 0),
  download_mbps numeric(12,3) not null check (download_mbps > 0),
  upload_mbps numeric(12,3) not null check (upload_mbps > 0),
  quota_bytes bigint check (quota_bytes is null or quota_bytes >= 0),
  validity_seconds integer not null check (validity_seconds > 0),
  device_limit integer not null default 1 check (device_limit > 0),
  version integer not null default 1 check (version > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name, version)
);

create table if not exists net_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references net_customers(id) on delete restrict,
  plan_id uuid not null references net_plans(id) on delete restrict,
  status text not null check (status in ('PENDING','ACTIVE','EXPIRED','SUSPENDED','CANCELLED')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  entitlement_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

create table if not exists net_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  customer_id uuid not null references net_customers(id) on delete restrict,
  subscription_id uuid references net_subscriptions(id) on delete restrict,
  provider text not null,
  provider_transaction_id text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null default 'TZS',
  status text not null check (status in ('INITIATED','PENDING','VERIFIED','SETTLED','FAILED','REVERSED','REFUNDED')),
  provider_reference text,
  received_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_transaction_id)
);

create table if not exists net_devices (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references net_sites(id) on delete restrict,
  vendor text not null,
  model text,
  hostname text,
  management_url text,
  state text not null default 'UNKNOWN' check (state in ('ONLINE','OFFLINE','DEGRADED','UNKNOWN')),
  last_heartbeat_at timestamptz,
  last_health jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists net_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references net_customers(id) on delete restrict,
  device_id uuid references net_devices(id) on delete restrict,
  nas_identifier text not null,
  acct_session_id text not null,
  username text,
  mac_address text,
  ip_address inet,
  state text not null check (state in ('REQUESTED','AUTHENTICATED','ACTIVE','STALE','TERMINATING','TERMINATED')),
  started_at timestamptz,
  last_accounting_at timestamptz,
  ended_at timestamptz,
  input_octets bigint not null default 0 check (input_octets >= 0),
  output_octets bigint not null default 0 check (output_octets >= 0),
  termination_cause text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nas_identifier, acct_session_id)
);

create table if not exists net_commands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  actor_id text not null,
  target_type text not null,
  target_id text not null,
  provider text not null,
  command text not null,
  request jsonb not null default '{}'::jsonb,
  response jsonb,
  verification jsonb,
  error text,
  attempts integer not null default 0 check (attempts >= 0),
  status text not null check (status in ('QUEUED','SENT','ACCEPTED','EXECUTED','VERIFIED','FAILED','RETRYING','ABANDONED')),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table if not exists net_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references net_organizations(id) on delete restrict,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  correlation_id text,
  version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (aggregate_type, aggregate_id, event_type, version, occurred_at)
);

create table if not exists net_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references net_organizations(id) on delete restrict,
  actor_id text,
  action text not null,
  target_type text,
  target_id text,
  correlation_id text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_net_customers_org_status on net_customers(organization_id, status);
create index if not exists idx_net_subscriptions_customer_status on net_subscriptions(customer_id, status, expires_at);
create index if not exists idx_net_payments_customer_created on net_payments(customer_id, created_at desc);
create index if not exists idx_net_payments_status on net_payments(status, created_at desc);
create index if not exists idx_net_devices_site_state on net_devices(site_id, state, last_heartbeat_at desc);
create index if not exists idx_net_sessions_customer_state on net_sessions(customer_id, state, last_accounting_at desc);
create index if not exists idx_net_sessions_nas_state on net_sessions(nas_identifier, state, last_accounting_at desc);
create index if not exists idx_net_commands_status on net_commands(status, created_at);
create index if not exists idx_net_events_correlation on net_events(correlation_id, occurred_at);
create index if not exists idx_net_audit_target on net_audit_log(target_type, target_id, created_at desc);
