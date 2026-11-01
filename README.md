# blendxr.online — private deal room

Private per-person deal room. Not a public site. Every visitor lands on
the "Private preview" gate and sees only the one resource they were
granted. Serves one resource today: the Volga test scene brief.

## Repo layout

```
public/              Netlify publish directory. Static gate page + fonts + icon.
netlify/functions/   Server code. Node 20. One function per endpoint.
  _lib/              Shared helpers (supabase, cookie, email, pdf, html, markdown).
  enter.js           POST handler for the gate (code or email).
  nda.js             GET renders mutual NDA + signer form; POST signs it.
  agreement.js       GET renders contractor agreement form; POST signs it.
  brief.js           Server-renders the brief with watermark + panels.
  media.js           Redirect to short-lived signed media URL.
  download-url.js    JSON signed URL for a downloadable asset + log.
  upload-url.js      Signed upload URL (direct browser -> Supabase).
  upload-notify.js   Record the completed upload + email airem@.
  event.js           Lightweight event log (heartbeats, section_reached).
  not-signatory.js   "I'm not the signatory" page + email.
private-content/     Server-only source of truth (brief.md, page-spec.md, agreement.txt, mutual-nda/nda.txt, media/).
private-downloads/   Server-only files Volga downloads via the panel.
db/                  Supabase SQL (schema.sql, seed-volga.sql).
scripts/             Post-build check that greps `public/` for leaked private files.
netlify.toml         publish=public, functions=netlify/functions, URL rewrites.
```

## One-time setup (Vedika)

### 1. Supabase project
- Create a new Supabase project (Pro plan, so resumable uploads up to 50 GB work).
- Project settings -> Data API -> copy the Project URL and the service_role key.
- Settings -> Auth -> make sure email auth is enabled (used later for /admin).
- Storage: create three private buckets, exact names, all without public access:
  - `agreements`
  - `media`
  - `downloads`
  - `uploads`

Upload the current media + download files to the right buckets. The paths
are keyed by the resource slug `volga-test-scene`.

```
media/volga-test-scene/switchgear-panel-failing.png
media/volga-test-scene/switchgear-panel-failing-vrhands.png
media/volga-test-scene/highlight-pulse-ref.mp4

downloads/volga-test-scene/hum-electric.mp3
downloads/volga-test-scene/crackle.mp3
downloads/volga-test-scene/EnterApp.mp3
downloads/volga-test-scene/unlocking-metal-door.mp3
```

Files live in this repo at `private-content/volga-test-scene/media/` and
`private-downloads/volga-test-scene/`. Use the dashboard uploader or
`supabase storage` CLI. Nothing in these folders is ever uploaded to
Netlify (publish directory is `public/`).

### 2. Schema + seed
In the Supabase SQL editor, run `db/schema.sql`, then `db/seed-volga.sql`.
The seed inserts Volga Infosys, Shivam's person row and his grant (expiry
2026-11-24, agreement required), plus the four checkpoints.

### 3. Resend (optional for MVP)
Email sending is skipped silently when `RESEND_API_KEY` is absent (see
`_lib/email.js`); the signed-NDA PDF is still uploaded to the `agreements`
bucket, so you can fetch it from Supabase Storage. Add Resend when you
want copies in your inbox:
- Create a Resend account and a verified sender for `blendxr.online`.
- Create an API key.

### 4. Netlify env vars
In Netlify -> Project -> Site settings -> Environment variables, add:

| Key                           | Value |
|---                            |---    |
| `SUPABASE_URL`                | Supabase Project URL (e.g. https://xxxxx.supabase.co) |
| `SUPABASE_SERVICE_ROLE_KEY`   | Supabase service_role key |
| `SESSION_SECRET`              | 48+ random chars (openssl rand -hex 32) |
| `CODE_SALT`                   | 32+ random chars (openssl rand -hex 32), only used by the event-code path |
| `RESEND_API_KEY`              | Resend API key (optional for MVP) |
| `RESEND_FROM`                 | `BlendXR <noreply@blendxr.online>` (optional, defaults match) |

Session cookie is signed with HS256 using `SESSION_SECRET`. Event-code hashes
are HMAC-SHA256 with `CODE_SALT`.

### 5. Deploy
From the repo:

```
npm install
netlify deploy --prod --dir=public --functions=netlify/functions
```

### 6. Smoke test (Volga MVP)
- Visit `blendxr.online`.
- Type `shivam@volgainfosys.com` into the email field and press Enter.
- You should land on `/nda`. The NDA body is scrollable; the signer fields
  are below it (signer name, title, counterparty legal name, authorised
  checkbox).
- Fill the fields and submit. The signed PDF is uploaded to the private
  `agreements` bucket at `nda/<org_id>/<version>-<record>.pdf`; a row is
  written to `nda_signatures`; the session cookie is refreshed; the browser
  is redirected to `/r`. If `RESEND_API_KEY` is set, you and
  airem@blendxr.online also receive the PDF by email.
- `/r` renders the brief with:
  - Two inline images and the pulse reference video (all watermarked).
  - Downloads panel: 4 audio files, each via a 10-minute signed URL.
  - Uploads panel: Day 0 checkbox, then Day 4/9/14 upload rows that
    unlock in order.
- To get the retained PDF without Resend: Supabase dashboard -> Storage ->
  `agreements` -> `nda/<org_id>/` -> download.

### 7. First grant for Shivam
Nothing else to do; the seed inserted it. Just email him
`https://blendxr.online` and tell him to enter his email.

## Volga flow (what ships today)
- Volga resource is seeded with `agreement_type = 'mutual_nda'`
  (`db/seed-volga.sql`); the gate routes email entries to `/nda`
  instead of `/agreement`.
- A signed NDA for the current `NDA_VERSION` (see `netlify/functions/nda.js`)
  flips the session's `agreement_ok` to true. Entering again from the gate
  with the same email reads the existing signature and goes straight to `/r`.
- To rotate the NDA (new version), bump `NDA_VERSION` in `nda.js` AND the
  `CURRENT_NDA_VERSION` constant in `enter.js`; next visit forces re-sign.
- The retained PDF is at Supabase Storage, bucket `agreements`, path
  `nda/<org_id>/<version>-<record>.pdf`. The DB row is in
  `nda_signatures` with `pdf_ref` set to that path.

## Changing the 5-digit code behaviour
The code field exists on the gate (visuals requirement) but no event codes
are seeded today, so any code typed returns "Not quite." To add an in-person
event code later, insert into `event_codes` with:

```sql
insert into event_codes (resource_id, code_hash, event_label, valid_on)
values (
  '00000000-0000-0000-0000-000000000002'::uuid,
  encode(hmac('CODE_HERE', 'YOUR_CODE_SALT', 'sha256'), 'hex'),
  'Austin demo 2026-11-14',
  '2026-11-14'
);
```

## What's not built yet (follow-ups)
- `/admin` dashboard. Today, admin lives in the Supabase table editor and
  Storage browser. Everything you need is there (orgs, people, grants,
  org_agreements, nda_signatures, uploads, events, access_requests).
- Contractor agreement path (`/agreement`) is wired but not the active flow
  for Volga; it is kept so a future resource can switch
  `agreement_type` to `contractor` and reuse it.
- Event-code (iPad) buyer path — gate accepts codes and mints a session,
  but there is no dedicated in-person NDA surface for a session with no
  `person_id` yet. The current `/nda` surface requires an email-path
  session (person_id resolved).
- End-of-engagement deletion certificate flow.
- The uploads client currently uses single-shot signed PUT. Supabase Pro
  single-shot cap is ~5 GiB per file; Day 14 project zips may exceed that
  and need TUS resumable (we have `tus-js-client` on the roadmap).

## Working rules (do not change without a note)
- Never use em dashes in UI copy, comments, or docs. Use periods, commas or colons.
- Legal entity: Blendtobases OU, trading as BlendXR.
- `public/` is the only directory that ships. `scripts/post-build-check.sh`
  fails the build if a private filename slips in.
- Session cookies are HttpOnly, Secure, SameSite=Lax, resource-scoped. One
  cookie never grants access to a different resource.
- All DB access is via `_lib/supa.js` and the service_role key, server side only.
