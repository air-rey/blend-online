// Per-resource config for the deal-room functions. One row per `slug`.
//
// brief.js / media.js / download-url.js all look up a resource here by
// `session.resource_slug` and derive what to render and where to fetch
// files from. Volga (the first resource shipped) stores its media and
// download objects at the ROOT of each Supabase bucket, which was fine
// for a single-tenant MVP. When a second resource was added, the serving
// code was given a per-resource `storagePrefix` so each new resource
// gets its own folder under the bucket (e.g.
// `media/apexdream-confined-space/...`) while Volga keeps its existing
// root keys. See media.js and download-url.js for how `storagePrefix`
// is applied.
//
// `briefPath` is a local filesystem path. Netlify's function bundler
// auto-includes any file referenced by `fs.readFileSync(path.join(
// __dirname, '..', '..', <static string>))`, which is why this config
// keeps those paths as static string literals rather than a single
// `path.join(__dirname, '..', '..', 'private-content', slug, 'brief.md')`
// template.
//
// `downloads` drives the downloads panel UI AND the per-resource
// allowlist used by download-url.js. Keeping a single source of truth
// here avoids drift between the two.
//
// `checkpoints` drives the uploads panel UI (one row per entry). It is
// per-resource because resources can have different checkpoint shapes:
// Volga runs a 14-day build with gray-box + first-APK + final rows;
// ApexDream's reduced scope has just Day 0 + a single demo-APK
// delivery. Each entry carries the `day` integer used by upload-url.js
// / upload-notify.js to look up the matching `checkpoints` row in the
// DB, plus optional `dueText` for entries whose due date is not a
// simple "Day 0 + N days" offset.

const path = require('path');

const VOLGA_SLUG = 'volga-test-scene';
const APEX_SLUG  = 'apexdream-confined-space';

const VOLGA_BRIEF = path.join(__dirname, '..', '..', '..', 'private-content', 'volga-test-scene', 'brief.md');
const APEX_BRIEF  = path.join(__dirname, '..', '..', '..', 'private-content', 'apexdream-confined-space', 'brief.md');

// Shared contractor-agreement template with {{VERSION}}, {{BRIEF_TITLE}}
// and {{DELIVERY_PHRASE}} placeholders. Each resource below supplies its
// own values; agreement.js substitutes at render time so one legal text
// serves every contractor brief without a partner-specific file.
const SHARED_AGREEMENT_TEMPLATE = path.join(__dirname, '..', '..', '..', 'private-content', '_shared', 'agreement.txt.template');

const RESOURCES = {
  [VOLGA_SLUG]: {
    slug: VOLGA_SLUG,
    title: 'BlendXR x Volga — Test Scene Brief',
    briefPath: VOLGA_BRIEF,
    // Contractor-agreement version this resource requires an executed
    // org_agreements row for. The gate in brief.js / agreement.js
    // compares against this exact string.
    agreementVersion: '2026-11-03',
    agreementPath:    SHARED_AGREEMENT_TEMPLATE,
    agreementBriefTitle:     'BlendXR x Volga — Test Scene Brief',
    agreementDeliveryPhrase: 'including the complete source project',
    // Day 0 for Volga is anchored to 2026-11-14 UTC until Shivam ticks
    // Day 0 in the uploads panel. See brief.js for the recompute-on-tick
    // behaviour.
    day0AnchorMs: Date.UTC(2026, 10, 14),
    // Empty prefix: Volga files live at the root of each Supabase bucket
    // (legacy single-tenant layout). Don't change this without migrating
    // the storage objects first.
    storagePrefix: '',
    downloads: [
      { label: 'S1 Room hum',              key: 'hum-electric.mp3' },
      { label: 'S2 Spark crackle',         key: 'crackle.mp3' },
      { label: 'S3 App start',             key: 'EnterApp.mp3' },
      { label: 'S4 Fire alarm (app exit)', key: 'fire-alarm.mp3' }
    ],
    checkpoints: [
      { day: 0,  label: 'Start confirmation', accepts: '',                     hint: 'Tick to confirm you can access every asset and the setup works. Emails airem@blendxr.online and starts the clock.' },
      { day: 4,  label: 'Gray box',           accepts: '.mp4,.mov',            hint: 'One headset capture video of the blocked-out scene with gaze working on all targets, debug reticle on.' },
      { day: 9,  label: 'First APK',          accepts: '.apk',                 hint: 'Full flow fade-in to app exit, pulses and session file working, placeholder art acceptable.' },
      { day: 14, label: 'Final delivery',     accepts: '.apk,.zip,.md,.json',  hint: 'Final APK, project zip (with .git and LFS), README, sample session file.' }
    ]
  },
  [APEX_SLUG]: {
    slug: APEX_SLUG,
    title: 'BlendXR x ApexDream: Confined Space Test Brief',
    briefPath: APEX_BRIEF,
    // ApexDream's reduced-scope revision needs the signer to re-execute
    // the agreement under this version. Any older row for ApexDream's
    // org (e.g. the 2026-11-03 copy Aashish signed on Nov 15) stays as
    // history but no longer satisfies the brief gate.
    agreementVersion: '2026-11-17',
    agreementPath:    SHARED_AGREEMENT_TEMPLATE,
    agreementBriefTitle:     'BlendXR x ApexDream: Confined Space Test Brief',
    agreementDeliveryPhrase: 'the demo APK',
    // Day 0 is not fixed yet for ApexDream (brief sets the deadline as
    // end of 2026-11-19 IST but the clock itself starts on the tick).
    // null tells the uploads panel to render "Due date is set once Day
    // 0 is ticked" for delivery rows instead of concrete dates.
    day0AnchorMs: null,
    storagePrefix: 'apexdream-confined-space/',
    downloads: [
      { label: 'S1 Room hum',  key: 'hum-electric.mp3' },
      { label: 'S2 Air duct',  key: 'fan-off.m4a' },
      { label: 'S3 App start', key: 'EnterApp.mp3' },
      { label: 'S4 Gas alarm', key: 'carbon-monoxide-detector.m4a' }
    ],
    // Reduced scope: Day 0 + one demo-APK delivery. dueBusinessDays
    // tells the panel to compute (Day 0 tick + N business days, Mon-
    // Fri) after the tick lands. Before the tick, the panel shows the
    // dueText placeholder.
    checkpoints: [
      { day: 0, label: 'Start confirmation', accepts: '',    hint: 'Tick to confirm you can access every asset and the setup works. Emails airem@blendxr.online and starts the clock.' },
      { day: 7, label: 'Demo APK',           accepts: '.apk', hint: 'Full flow from fade-in to app quit with all three gaze targets, pulses, timings and both exits.',
        dueBusinessDays: 7,
        dueText: 'Due Day 0 + 7 business days (Mon–Fri)' }
    ]
  }
};

function getResource (slug) {
  return RESOURCES[slug] || null;
}

function isKnownSlug (slug) {
  return Object.prototype.hasOwnProperty.call(RESOURCES, slug);
}

function allowedDownloadKeys (slug) {
  const r = RESOURCES[slug];
  if (!r) return new Set();
  return new Set(r.downloads.map(d => d.key));
}

module.exports = {
  VOLGA_SLUG,
  APEX_SLUG,
  RESOURCES,
  getResource,
  isKnownSlug,
  allowedDownloadKeys
};
