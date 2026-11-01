// POST /.netlify/functions/upload-notify
// Body JSON for a completed file upload:
//   { day, filename, size, path }
// Body JSON for the Day 0 checkbox:
//   { day: 0, kind: 'day0-start' }
//
// Writes to `uploads` or marks the day-0 checkpoint_status row, then
// emails airem@blendxr.online.

const { supa } = require('./_lib/supa');
const { readSession } = require('./_lib/cookie');
const { jsonResponse, redirectResponse } = require('./_lib/html');
const { send } = require('./_lib/email');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'POST only' });
  const session = await readSession(event.headers || {});
  if (!session || !session.grant_id) return redirectResponse('/');
  if (session.resource_slug !== 'volga-test-scene') return redirectResponse('/');

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (_) { return jsonResponse(400, { error: 'bad json' }); }

  const db = supa();
  const day = String(payload.day || '');

  // Resolve checkpoint id.
  const { data: cp } = await db.from('checkpoints')
    .select('id, day, label').eq('resource_id', session.resource_id)
    .eq('day', Number(day)).maybeSingle();
  if (!cp) return jsonResponse(400, { error: 'unknown checkpoint' });

  // Day 0: no file; just stamp a checkpoint_status and start the clock.
  if (day === '0' || payload.kind === 'day0-start') {
    const now = new Date().toISOString();
    await db.from('checkpoint_status').upsert({
      grant_id: session.grant_id, checkpoint_id: cp.id,
      ticked_at: now, ticked_by: 'partner'
    }, { onConflict: 'grant_id,checkpoint_id' });

    await db.from('events').insert({
      grant_id: session.grant_id, kind: 'day0_started', meta: { at: now }
    }).then(() => {}, () => {});

    try {
      await send({
        to: ['airem@blendxr.online', 'vedika@blendxr.online'],
        subject: `BlendXR x Volga — Day 0 started by ${session.email}`,
        text: `${session.name || session.email} ticked the Day 0 confirmation at ${now}.\nDay 4 is now unlocked.`
      });
    } catch (err) { console.warn('day0 email failed', err); }
    return jsonResponse(200, { ok: true });
  }

  // Day N file upload.
  const filename = String(payload.filename || '').slice(0, 300);
  const size     = Number(payload.size || 0);
  const storagePath = String(payload.path || '');
  if (!filename || !storagePath) return jsonResponse(400, { error: 'missing fields' });

  const { data: row, error } = await db.from('uploads').insert({
    grant_id:     session.grant_id,
    checkpoint_id: cp.id,
    filename,
    size_bytes:   size,
    storage_path: storagePath,
    status:       'received'
  }).select().single();
  if (error) {
    console.error('uploads insert failed', error);
    return jsonResponse(500, { error: 'could not record upload' });
  }

  await db.from('events').insert({
    grant_id: session.grant_id, kind: 'upload_received',
    meta: { day, filename, size, path: storagePath, upload_id: row.id }
  }).then(() => {}, () => {});

  try {
    await send({
      to: 'airem@blendxr.online',
      subject: `BlendXR x Volga: Day ${day} upload from ${session.email}`,
      text: `From: ${session.name || session.email}\nCheckpoint: Day ${day} ${cp.label}\nFile: ${filename}\nSize: ${Math.round(size / 1024 / 1024)} MB\nPath: ${storagePath}\nUpload id: ${row.id}`
    });
  } catch (err) { console.warn('upload email failed', err); }

  return jsonResponse(200, { ok: true, id: row.id });
};
