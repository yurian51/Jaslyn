create table if not exists net_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  type text not null check (type in ('DIRECT','GROUP','CHANNEL','SUPPORT','INCIDENT','COMMAND','AI')),
  title text,
  customer_id uuid references net_customers(id) on delete restrict,
  created_by uuid references net_users(id) on delete set null,
  last_message_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists net_conversation_members (
  conversation_id uuid not null references net_conversations(id) on delete cascade,
  user_id uuid not null references net_users(id) on delete cascade,
  role text not null default 'MEMBER' check (role in ('OWNER','ADMIN','MEMBER','OBSERVER')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_at timestamptz,
  notifications_enabled boolean not null default true,
  primary key (conversation_id, user_id)
);

create table if not exists net_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  conversation_id uuid not null references net_conversations(id) on delete cascade,
  sender_user_id uuid references net_users(id) on delete set null,
  sender_customer_id uuid references net_customers(id) on delete set null,
  kind text not null default 'TEXT' check (kind in ('TEXT','SYSTEM','COMMAND','BOT','AI','POLL')),
  body text not null check (length(body) <= 20000),
  reply_to_message_id uuid references net_messages(id) on delete set null,
  forwarded_from_message_id uuid references net_messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  sequence bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, sequence)
);

create table if not exists net_message_reactions (
  message_id uuid not null references net_messages(id) on delete cascade,
  user_id uuid not null references net_users(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction)
);

create table if not exists net_saved_messages (
  user_id uuid not null references net_users(id) on delete cascade,
  message_id uuid not null references net_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create table if not exists net_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references net_organizations(id) on delete restrict,
  user_id uuid not null references net_users(id) on delete cascade,
  category text not null check (category in ('SUCCESS','INFO','WARNING','CRITICAL')),
  title text not null,
  body text not null,
  resource_type text,
  resource_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_net_conversations_org_updated
  on net_conversations(organization_id, updated_at desc);

create index if not exists idx_net_conversation_members_user
  on net_conversation_members(user_id, joined_at desc);

create index if not exists idx_net_messages_conversation_sequence
  on net_messages(conversation_id, sequence desc);

create index if not exists idx_net_messages_org_created
  on net_messages(organization_id, created_at desc);

create index if not exists idx_net_messages_reply
  on net_messages(reply_to_message_id);

create index if not exists idx_net_notifications_user_unread
  on net_notifications(user_id, read_at, created_at desc);

create or replace function net_next_message_sequence(p_conversation_id uuid)
returns bigint
language sql
as $$
  select coalesce(max(sequence), 0) + 1
  from net_messages
  where conversation_id = p_conversation_id
$$;
