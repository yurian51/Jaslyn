create table if not exists net_networks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references net_sites(id) on delete restrict,
  name text not null,
  network_type text not null default 'WIFI' check (network_type in ('WIFI','LAN','WAN','HOTSPOT','GUEST','ENTERPRISE','OTHER')),
  status text not null default 'UNKNOWN' check (status in ('ONLINE','DEGRADED','OFFLINE','UNKNOWN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, name)
);

alter table net_devices
  add column if not exists network_id uuid references net_networks(id) on delete restrict;

alter table net_devices
  add column if not exists role text not null default 'GATEWAY' check (role in ('GATEWAY','ROUTER','SWITCH','ACCESS_POINT','RADIUS','OTHER'));

alter table net_payments
  add column if not exists activation_applied_at timestamptz;

create index if not exists idx_net_networks_site_status on net_networks(site_id, status);
create index if not exists idx_net_devices_network_role on net_devices(network_id, role, state);
create index if not exists idx_net_payments_activation on net_payments(activation_applied_at, status);

create table if not exists net_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  customer_id uuid not null references net_customers(id) on delete restrict,
  subscription_id uuid not null references net_subscriptions(id) on delete restrict,
  state text not null check (state in ('PENDING','ACTIVE','SUSPENDED','EXPIRED','REVOKED','UNKNOWN')),
  policy jsonb not null default '{}'::jsonb,
  policy_version integer not null default 1 check (policy_version > 0),
  source text not null default 'jaslyn-billing',
  desired_at timestamptz not null default now(),
  applied_at timestamptz,
  last_verified_at timestamptz,
  verification jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id)
);

create index if not exists idx_net_authorizations_org_state on net_authorizations(organization_id, state, updated_at desc);
create index if not exists idx_net_authorizations_customer_state on net_authorizations(customer_id, state, updated_at desc);

create table if not exists net_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references net_organizations(id) on delete restrict,
  site_id uuid references net_sites(id) on delete restrict,
  device_id uuid references net_devices(id) on delete restrict,
  category text not null,
  severity text not null check (severity in ('INFO','WARNING','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  fingerprint text not null,
  title text not null,
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (fingerprint, status)
);

create index if not exists idx_net_incidents_org_status on net_incidents(organization_id, status, severity, last_seen_at desc);
create index if not exists idx_net_incidents_device_status on net_incidents(device_id, status, last_seen_at desc);
