create table if not exists net_customer_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  customer_id uuid not null references net_customers(id) on delete restrict,
  device_id uuid not null references net_devices(id) on delete restrict,
  label text,
  mac_address macaddr,
  state text not null default 'UNKNOWN' check (state in ('ONLINE','OFFLINE','UNKNOWN')),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, device_id),
  unique (organization_id, mac_address)
);

create table if not exists net_device_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  source_device_id uuid not null references net_devices(id) on delete restrict,
  target_device_id uuid not null references net_devices(id) on delete restrict,
  relationship text not null check (relationship in ('UPLINK','DOWNLINK','MANAGES','SERVES','BACKHAUL','PEER','OTHER')),
  interface_name text,
  desired_state text not null default 'ACTIVE' check (desired_state in ('ACTIVE','INACTIVE')),
  observed_state text not null default 'UNKNOWN' check (observed_state in ('UP','DOWN','DEGRADED','UNKNOWN')),
  last_observed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_device_id <> target_device_id),
  unique (source_device_id, target_device_id, relationship)
);

create table if not exists net_incident_impacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  incident_id uuid not null references net_incidents(id) on delete cascade,
  device_id uuid references net_devices(id) on delete restrict,
  customer_id uuid references net_customers(id) on delete restrict,
  session_id uuid references net_sessions(id) on delete restrict,
  subscription_id uuid references net_subscriptions(id) on delete restrict,
  impact_type text not null check (impact_type in ('INFRASTRUCTURE','CUSTOMER','SESSION','SERVICE','REVENUE')),
  impact_state text not null default 'AFFECTED' check (impact_state in ('AFFECTED','RECOVERED','UNKNOWN')),
  estimated_revenue_minor bigint check (estimated_revenue_minor is null or estimated_revenue_minor >= 0),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  recovered_at timestamptz,
  check (device_id is not null or customer_id is not null or session_id is not null or subscription_id is not null)
);

create index if not exists idx_net_customer_devices_customer on net_customer_devices(customer_id, state, updated_at desc);
create index if not exists idx_net_customer_devices_device on net_customer_devices(device_id, state, updated_at desc);
create index if not exists idx_net_device_links_source on net_device_links(source_device_id, observed_state);
create index if not exists idx_net_device_links_target on net_device_links(target_device_id, observed_state);
create index if not exists idx_net_incident_impacts_incident on net_incident_impacts(incident_id, impact_state, impact_type);
create index if not exists idx_net_incident_impacts_customer on net_incident_impacts(customer_id, impact_state);
create index if not exists idx_net_incident_impacts_device on net_incident_impacts(device_id, impact_state);
