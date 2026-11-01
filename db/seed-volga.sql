-- Volga seed. Run AFTER schema.sql has been applied.
-- Safe to re-run: all inserts are idempotent via `on conflict do nothing`.

-- Volga Infosys as the org and the resource row.
insert into orgs (id, name, legal_name, country)
values ('00000000-0000-0000-0000-000000000001'::uuid, 'Volga Infosys', 'Volga Infosys', 'India')
on conflict (id) do nothing;

insert into resources (id, slug, type, title, agreement_type, contact_email)
values ('00000000-0000-0000-0000-000000000002'::uuid, 'volga-test-scene', 'brief',
        'BlendXR x Volga — Test Scene Brief', 'contractor', 'airem@blendxr.online')
on conflict (slug) do update set agreement_type = excluded.agreement_type;

insert into content_versions (resource_id, version, hash, change_note)
values ('00000000-0000-0000-0000-000000000002'::uuid, '2026-11-01',
        'initial', 'Initial Volga brief; gloves pack sourced from Fab.')
on conflict do nothing;

-- Shivam at Volga Infosys.
insert into people (org_id, name, email)
values ('00000000-0000-0000-0000-000000000001'::uuid, 'Shivam', 'shivam@volgainfosys.com')
on conflict (email) do nothing;

-- Shivam's grant.
--   Start:   2026-11-01 (today)
--   Expiry:  2026-11-14 end of day (14 days, Day 0 .. Day 14 inclusive)
-- Once Shivam ticks Day 0 to confirm he has everything and can start, we
-- can update expires_at to be exactly 14 days from his tick timestamp.
-- Until then, keep the hard 2026-11-14 ceiling.
insert into grants (resource_id, person_id, expires_at, agreement_required)
select '00000000-0000-0000-0000-000000000002'::uuid, id,
       '2026-11-14T23:59:59Z'::timestamptz, true
from people where email = 'shivam@volgainfosys.com'
and not exists (
  select 1 from grants
  where resource_id = '00000000-0000-0000-0000-000000000002'::uuid
    and person_id = people.id
    and revoked_at is null
);

-- Checkpoints for the uploads panel. Day numbers are offsets from the
-- start (Day 0 = 2026-11-01, Day 4 = 2026-11-05, Day 9 = 2026-11-10,
-- Day 14 = 2026-11-14). Due dates are tracked per-grant in
-- checkpoint_status.due_at once Day 0 is confirmed.
insert into checkpoints (resource_id, day, label, accepts, position) values
  ('00000000-0000-0000-0000-000000000002'::uuid, 0,  'Start confirmation', '',                     0),
  ('00000000-0000-0000-0000-000000000002'::uuid, 4,  'Gray box',           '.mp4,.mov',            1),
  ('00000000-0000-0000-0000-000000000002'::uuid, 9,  'First APK',          '.apk',                 2),
  ('00000000-0000-0000-0000-000000000002'::uuid, 14, 'Final delivery',     '.apk,.zip,.md,.json',  3)
on conflict do nothing;
