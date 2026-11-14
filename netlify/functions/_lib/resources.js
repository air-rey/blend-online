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

const path = require('path');

const VOLGA_SLUG = 'volga-test-scene';
const APEX_SLUG  = 'apexdream-confined-space';

const VOLGA_BRIEF = path.join(__dirname, '..', '..', '..', 'private-content', 'volga-test-scene', 'brief.md');
const APEX_BRIEF  = path.join(__dirname, '..', '..', '..', 'private-content', 'apexdream-confined-space', 'brief.md');

const RESOURCES = {
  [VOLGA_SLUG]: {
    slug: VOLGA_SLUG,
    briefPath: VOLGA_BRIEF,
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
    ]
  },
  [APEX_SLUG]: {
    slug: APEX_SLUG,
    briefPath: APEX_BRIEF,
    // Day 0 is not fixed yet for ApexDream (see page-spec.md). Null
    // tells the uploads panel to render "Due date set once Day 0 is
    // ticked" for Day 4 / 9 / 14 instead of concrete calendar dates.
    day0AnchorMs: null,
    storagePrefix: 'apexdream-confined-space/',
    downloads: [
      { label: 'S1 Room hum',                       key: 'hum-electric.mp3' },
      { label: 'S2 Fan off (clunk and wind-down)',  key: 'fan-off.m4a' },
      { label: 'S3 App start',                      key: 'EnterApp.mp3' },
      { label: 'S4 CO detector alarm',              key: 'carbon-monoxide-detector.m4a' }
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
