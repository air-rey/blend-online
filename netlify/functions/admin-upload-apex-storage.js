// One-shot admin HTTP function to seed the Supabase Storage objects for
// the ApexDream confined-space brief. Reads the files that ship bundled
// alongside this function (see netlify.toml included_files for this
// function) and uploads each one to the exact per-resource path the
// media + downloads functions expect:
//
//   media/apexdream-confined-space/highlight-pulse-ref.mp4
//   downloads/apexdream-confined-space/hum-electric.mp3
//   downloads/apexdream-confined-space/fan-off.m4a
//   downloads/apexdream-confined-space/EnterApp.mp3
//   downloads/apexdream-confined-space/carbon-monoxide-detector.m4a
//
// Idempotent: each upload passes `upsert: true` so re-running overwrites
// the existing object with the same content. Returns a JSON array of
// per-file results. Does not touch Volga's objects.
//
// Guarded by a trivial token hardcoded below — not a secret, just a
// nuisance barrier so a random caller doesn't trigger a redundant
// upload. The function is removed in a follow-up commit right after
// the seed runs; the window where this endpoint is live is minutes.
//
//   curl -i -X POST 'https://blendxr.online/.netlify/functions/admin-upload-apex-storage?token=apex-seed-20261114'
//
// Safe to delete this function (and its netlify.toml entry) once the
// seed is complete.

const SEED_TOKEN = 'apex-seed-20261114';

const fs = require('fs');
const path = require('path');
const { supa } = require('./_lib/supa');

const ROOT = path.join(__dirname, '..', '..');

// Static path literals so Netlify's bundler is sure to include each
// binary. Keep each absolute path to a unique file, nothing glob'd.
const MEDIA_FILES = [
  { local: path.join(ROOT, 'private-content', 'apexdream-confined-space', 'media', 'highlight-pulse-ref.mp4'),
    bucket: 'media',     remote: 'apexdream-confined-space/highlight-pulse-ref.mp4', contentType: 'video/mp4' }
];
const DOWNLOAD_FILES = [
  { local: path.join(ROOT, 'private-downloads', 'apexdream-confined-space', 'hum-electric.mp3'),
    bucket: 'downloads', remote: 'apexdream-confined-space/hum-electric.mp3',             contentType: 'audio/mpeg' },
  { local: path.join(ROOT, 'private-downloads', 'apexdream-confined-space', 'fan-off.m4a'),
    bucket: 'downloads', remote: 'apexdream-confined-space/fan-off.m4a',                  contentType: 'audio/mp4' },
  { local: path.join(ROOT, 'private-downloads', 'apexdream-confined-space', 'EnterApp.mp3'),
    bucket: 'downloads', remote: 'apexdream-confined-space/EnterApp.mp3',                 contentType: 'audio/mpeg' },
  { local: path.join(ROOT, 'private-downloads', 'apexdream-confined-space', 'carbon-monoxide-detector.m4a'),
    bucket: 'downloads', remote: 'apexdream-confined-space/carbon-monoxide-detector.m4a', contentType: 'audio/mp4' }
];
const ALL_FILES = MEDIA_FILES.concat(DOWNLOAD_FILES);

function tokenGate (event) {
  const q = (event.queryStringParameters || {}).token || '';
  if (q !== SEED_TOKEN) return { ok: false, status: 403, body: { error: 'bad token' } };
  return { ok: true };
}

exports.handler = async function (event) {
  const gate = tokenGate(event);
  if (!gate.ok) {
    return { statusCode: gate.status, body: JSON.stringify(gate.body) };
  }

  const db = supa();
  const results = [];
  for (const f of ALL_FILES) {
    let buf;
    try {
      buf = fs.readFileSync(f.local);
    } catch (err) {
      results.push({ bucket: f.bucket, remote: f.remote, ok: false, step: 'read', error: String(err && err.message || err) });
      continue;
    }
    const { error } = await db.storage.from(f.bucket).upload(f.remote, buf, {
      contentType: f.contentType, upsert: true
    });
    if (error) {
      results.push({ bucket: f.bucket, remote: f.remote, ok: false, step: 'upload',
                     size: buf.length, error: String(error.message || error) });
    } else {
      results.push({ bucket: f.bucket, remote: f.remote, ok: true, size: buf.length });
    }
  }
  const okAll = results.every(r => r.ok);
  return {
    statusCode: okAll ? 200 : 500,
    body: JSON.stringify({ ok: okAll, results })
  };
};
