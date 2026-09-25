create extension if not exists pgcrypto;

create table if not exists net_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  email text not null,
  full_name text not null,
  password_hash text not null,
  role text not null default 'ISP_ADMIN' check (role in ('SUPER_ADMIN','ISP_ADMIN','NETWORK_ADMIN','FINANCE','SUPPORT','RESELLER','AGENT','TECHNICIAN','SUBSCRIBER','VIEWER')),
  status text not null default 'ACTIVE' check (status in ('PENDING','ACTIVE','SUSPENDED','DISABLED')),
  email_verified_at timestamptz,
  failed_login_count integer not null default 0 check (failed_login_count >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table if not exists net_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references net_users(id) on delete cascade,
  organization_id uuid not null references net_organizations(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists net_auth_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references net_organizations(id) on delete set null,
  user_id uuid references net_users(id) on delete set null,
  email text,
  event_type text not null check (event_type in ('REGISTER','LOGIN_SUCCESS','LOGIN_FAILURE','LOGOUT','SESSION_REVOKED','PASSWORD_RESET_REQUEST','PASSWORD_RESET')),
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_net_users_org_status on net_users(organization_id, status);
create index if not exists idx_net_auth_sessions_user on net_auth_sessions(user_id, expires_at);
create index if not exists idx_net_auth_sessions_active on net_auth_sessions(token_hash, expires_at, revoked_at);
create index if not exists idx_net_auth_events_email on net_auth_events(email, created_at desc);
