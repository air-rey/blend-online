-- BlendXR deal room schema. Paste this into the Supabase SQL editor.
-- All tables have RLS enabled and NO row-level policies: only the service
-- role key can read or write. The browser never queries Supabase directly.

-- =====================================================================
-- Core
-- =====================================================================
create table if not exists orgs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  legal_name      text,
  entity_type     text,
  registration_no text,
  pan             text,
  address         text,
  country         text default 'India',
  created_at      timestamptz default now()
);

create table if not exists people (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  name       text not null,
  email      text not null unique,
  created_at timestamptz default now()
);
create index if not exists people_email_idx on people (lower(email));

create table if not exists resources (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  type            text not null check (type in ('brief','case_study','demo')),
  title           text not null,
  agreement_type  text not null check (agreement_type in ('contractor','mutual_nda')),
  contact_email   text not null,
  active          boolean default true,
  created_at      timestamptz default now()
);

create table if not exists content_versions (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  version     text not null,
  hash        text not null,
  change_note text,
  published_at timestamptz default now()
);

create table if not exists grants (
  id                   uuid primary key default gen_random_uuid(),
  resource_id          uuid not null references resources(id) on delete cascade,
  person_id            uuid not null references people(id) on delete cascade,
  token_hash           text,
  token_prefix         text,
  agreement_required   boolean default true,
  expires_at           timestamptz not null,
  revoked_at           timestamptz,
  created_at           timestamptz default now()
);
create index if not exists grants_person_idx on grants (person_id);
create index if not exists grants_live_idx   on grants (resource_id, expires_at) where revoked_at is null;

create table if not exists event_codes (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  code_hash   text not null,
  event_label text,
  valid_on    date not null,
  revoked_at  timestamptz,
  created_at  timestamptz default now()
);

-- =====================================================================
-- Agreements
-- =====================================================================
create table if not exists org_agreements (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  agreement_version  text not null,
  agreement_sha256   text not null,
  status             text not null default 'sent' check (status in ('sent','executed','void')),
  signer_person_id   uuid references people(id),
  signer_name        text,
  signer_title       text,
  signed_at          timestamptz,
  ip                 text,
  user_agent         text,
  contractor_fields  jsonb,
  exhibit_b          jsonb,
  executed_pdf_ref   text,
  audit_record_id    uuid,
  fab_login_sent_at         timestamptz,
  fab_password_changed_at   timestamptz,
  created_at         timestamptz default now()
);
create index if not exists org_agreements_org_idx on org_agreements (org_id, signed_at desc);

create table if not exists acknowledgements (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid not null references people(id) on delete cascade,
  org_agreement_id  uuid not null references org_agreements(id) on delete cascade,
  at                timestamptz default now(),
  ip                text
);

create table if not exists nda_signatures (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid not null references people(id) on delete cascade,
  agreement_version text not null,
  signer_name       text,
  signed_at         timestamptz default now(),
  ip                text,
  user_agent        text,
  pdf_ref           text
);

-- =====================================================================
-- Assets, uploads, downloads
-- =====================================================================
create table if not exists assets (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  label       text not null,
  storage_path text not null,
  size_bytes  bigint,
  kind        text not null check (kind in ('media','download')),
  paid_license boolean default false,
  created_at  timestamptz default now()
);

create table if not exists checkpoints (
  id            uuid primary key default gen_random_uuid(),
  resource_id   uuid not null references resources(id) on delete cascade,
  day           int  not null,
  label         text not null,
  accepts       text,
  expected_files text,
  manual        boolean default false,
  position      int
);

create table if not exists checkpoint_status (
  id             uuid primary key default gen_random_uuid(),
  grant_id       uuid not null references grants(id) on delete cascade,
  checkpoint_id  uuid not null references checkpoints(id) on delete cascade,
  ticked_at      timestamptz,
  ticked_by      text check (ticked_by in ('partner','admin')),
  due_at         timestamptz
);
create unique index if not exists checkpoint_status_unq on checkpoint_status (grant_id, checkpoint_id);

create table if not exists uploads (
  id            uuid primary key default gen_random_uuid(),
  grant_id      uuid not null references grants(id) on delete cascade,
  checkpoint_id uuid not null references checkpoints(id) on delete cascade,
  filename      text not null,
  size_bytes    bigint,
  sha256        text,
  storage_path  text not null,
  upload_id     text,
  status        text not null default 'received' check (status in ('received','reviewed','changes_requested')),
  at            timestamptz default now()
);
create index if not exists uploads_grant_idx on uploads (grant_id, at desc);

create table if not exists deletion_certificates (
  id                uuid primary key default gen_random_uuid(),
  org_agreement_id  uuid not null references org_agreements(id) on delete cascade,
  requested_at      timestamptz default now(),
  pdf_ref           text,
  received_at       timestamptz
);

-- =====================================================================
-- Events + access requests
-- =====================================================================
create table if not exists events (
  id             uuid primary key default gen_random_uuid(),
  grant_id       uuid references grants(id) on delete cascade,
  event_code_id  uuid references event_codes(id) on delete cascade,
  kind           text not null,
  meta           jsonb,
  at             timestamptz default now()
);
create index if not exists events_grant_at_idx on events (grant_id, at desc);

create table if not exists access_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  message     text,
  ip          text,
  user_agent  text,
  status      text not null default 'open' check (status in ('open','contacted','closed')),
  at          timestamptz default now()
);

-- =====================================================================
-- RLS: enabled everywhere, no public policies. Service role only.
-- =====================================================================
alter table orgs                   enable row level security;
alter table people                 enable row level security;
alter table resources              enable row level security;
alter table content_versions       enable row level security;
alter table grants                 enable row level security;
alter table event_codes            enable row level security;
alter table org_agreements         enable row level security;
alter table acknowledgements       enable row level security;
alter table nda_signatures         enable row level security;
alter table assets                 enable row level security;
alter table checkpoints            enable row level security;
alter table checkpoint_status      enable row level security;
alter table uploads                enable row level security;
alter table deletion_certificates  enable row level security;
alter table events                 enable row level security;
alter table access_requests        enable row level security;

-- =====================================================================
-- Volga seed
-- =====================================================================
insert into orgs (id, name, legal_name, country)
values ('00000000-0000-0000-0000-00000000v01g'::uuid, 'Volga Infosys', 'Volga Infosys', 'India')
on conflict (id) do nothing;

insert into resources (id, slug, type, title, agreement_type, contact_email)
values ('00000000-0000-0000-0000-000000resource'::uuid, 'volga-test-scene', 'brief',
        'BlendXR x Volga: Test Scene Brief', 'mutual_nda', 'airem@blendxr.online')
on conflict (slug) do update set agreement_type = excluded.agreement_type;

-- Replace :volga_contact_email with the real address before running:
-- insert into people (org_id, name, email)
--   values ('00000000-0000-0000-0000-00000000v01g'::uuid, 'Volga Contact', ':volga_contact_email');
-- insert into grants (resource_id, person_id, expires_at)
--   select '00000000-0000-0000-0000-000000resource'::uuid, id, '2026-11-24T23:59:59Z'::timestamptz
--   from people where email = ':volga_contact_email';
--
-- insert into checkpoints (resource_id, day, label, accepts, position) values
--   ('00000000-0000-0000-0000-000000resource'::uuid, 0,  'Start confirmation', 'none', 0),
--   ('00000000-0000-0000-0000-000000resource'::uuid, 4,  'Gray box',           '.mp4,.mov', 1),
--   ('00000000-0000-0000-0000-000000resource'::uuid, 9,  'First APK',          '.apk', 2),
--   ('00000000-0000-0000-0000-000000resource'::uuid, 14, 'Final delivery',     '.apk,.zip,.md,.json', 3);
