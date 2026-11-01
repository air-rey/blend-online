// POST /.netlify/functions/upload-url
// Body JSON: { day, filename, size }
// Returns:   { uploadUrl, token, path }
//
// The client does a single PUT (xhr) to the signed Supabase upload URL
// with Authorization: Bearer <token> and x-upsert: false. Supabase accepts
// files up to the plan's cap (Pro: 5 GiB per file single-shot; larger
// needs TUS resumable, which the client-side code wires in later).

const crypto = require('crypto');
const { supa } = require('./_lib/supa');
const { readSession } = require('./_lib/cookie');
const { jsonResponse, redirectResponse } = require('./_lib/html');

const CHECKPOINT_DAYS = new Set(['0', '4', '9', '14']);

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'POST only' });
  const session = await readSession(event.headers || {});
  if (!session || !session.grant_id) return redirectResponse('/');
  if (session.resource_slug !== 'volga-test-scene') return redirectResponse('/');

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (_) { return jsonResponse(400, { error: 'bad json' }); }
  const day = String(payload.day || '');
  const filename = String(payload.filename || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180);
  if (!CHECKPOINT_DAYS.has(day) || day === '0') return jsonResponse(400, { error: 'bad checkpoint' });
  if (!filename) return jsonResponse(400, { error: 'missing filename' });

  const db = supa();
  const id = crypto.randomUUID();
  const path = `${session.resource_slug}/${session.grant_id}/day-${day}/${id}_${filename}`;

  const { data, error } = await db.storage.from('uploads').createSignedUploadUrl(path);
  if (error || !data) {
    console.error('createSignedUploadUrl failed', error, path);
    return jsonResponse(500, { error: 'could not sign upload' });
  }

  await db.from('events').insert({
    grant_id: session.grant_id, kind: 'upload_started',
    meta: { day, path, filename, size: payload.size || null }
  }).catch(() => {});

  return jsonResponse(200, {
    uploadUrl: data.signedUrl,
    token:     data.token,
    path:      path
  });
};
