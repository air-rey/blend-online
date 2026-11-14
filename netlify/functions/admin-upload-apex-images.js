// One-shot admin HTTP function to seed the two reference images for
// the ApexDream confined-space brief. Idempotent (upsert=true). Reads
// the two images bundled alongside this function (see netlify.toml
// included_files for this function) and uploads each one to
// media/apexdream-confined-space/<name>.
//
//   curl -i -X POST 'https://blendxr.online/.netlify/functions/admin-upload-apex-images?token=apex-images-20261114'
//
// Guarded by a trivial token hardcoded below — not a secret, just a
// nuisance barrier. The function is removed in a follow-up commit right
// after the seed runs.

const fs = require('fs');
const path = require('path');
const { supa } = require('./_lib/supa');

const SEED_TOKEN = 'apex-images-20261114';

const ROOT = path.join(__dirname, '..', '..');
const FILES = [
  { local: path.join(ROOT, 'private-content', 'apexdream-confined-space', 'media', 'confined-space-start.jpg'),
    bucket: 'media', remote: 'apexdream-confined-space/confined-space-start.jpg',  contentType: 'image/jpeg' },
  { local: path.join(ROOT, 'private-content', 'apexdream-confined-space', 'media', 'confined-space-ladder.jpg'),
    bucket: 'media', remote: 'apexdream-confined-space/confined-space-ladder.jpg', contentType: 'image/jpeg' }
];

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
  for (const f of FILES) {
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
      results.push({ bucket: f.bucket, remote: f.remote, ok: false, step: 'upload', size: buf.length, error: String(error.message || error) });
    } else {
      results.push({ bucket: f.bucket, remote: f.remote, ok: true, size: buf.length });
    }
  }
  const okAll = results.every(r => r.ok);
  return { statusCode: okAll ? 200 : 500, body: JSON.stringify({ ok: okAll, results }) };
};
