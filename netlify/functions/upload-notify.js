// POST /.netlify/functions/upload-notify
// Body JSON for a completed file upload:
//   { day, filename, size, path }
// Body JSON for the Day 0 checkbox:
//   { day: 0, kind: 'day0-start' }
//
// Writes to `uploads` or marks the day-0 checkpoint_status row, then
// emails airem@blendxr.online and vedika@blendxr.online (both BlendXR,
// never a partner). On the Day 0 tick we also bump the grant's
// expires_at to Day 0 + 14 calendar days so the expiry tracks the
// actual clock start rather than the default pre-tick date.

const { supa } = require('./_lib/supa');
const { readSession } = require('./_lib/cookie');
const { jsonResponse, redirectResponse } = require('./_lib/html');
const { send } = require('./_lib/email');
const { getResource } = require('./_lib/resources');

// Day 0 + 14 calendar days. Keep this in sync with the pre-tick grant
// seed and the admin docs: the grant expiry should always equal Day 0
// + 14, whether Day 0 is still in the future (the seed's default) or
// has already been ticked (this function recomputes).
const EXPIRES_DAYS_AFTER_DAY0 = 14;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'POST only' });
  const session = await readSession(event.headers || {});
  if (!session || !session.grant_id) return redirectResponse('/');
  const resource = getResource(session.resource_slug);
  if (!resource) return redirectResponse('/');

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
    const now = new Date();
    const nowIso = now.toISOString();
    await db.from('checkpoint_status').upsert({
      grant_id: session.grant_id, checkpoint_id: cp.id,
      ticked_at: nowIso, ticked_by: 'partner'
    }, { onConflict: 'grant_id,checkpoint_id' });

    // Bump the grant's expiry to Day 0 + 14 calendar days from the
    // tick timestamp. If this update fails the tick still stands; the
    // grant's pre-tick expiry remains valid.
    const expiresAt = new Date(now.getTime() + EXPIRES_DAYS_AFTER_DAY0 * 24 * 60 * 60 * 1000).toISOString();
    await db.from('grants')
      .update({ expires_at: expiresAt })
      .eq('id', session.grant_id)
      .then(() => {}, err => console.warn('grant expires_at bump failed', err));

    await db.from('events').insert({
      grant_id: session.grant_id, kind: 'day0_started',
      meta: { at: nowIso, slug: session.resource_slug, expires_at: expiresAt }
    }).then(() => {}, () => {});

    try {
      await send({
        to: ['airem@blendxr.online', 'vedika@blendxr.online'],
        subject: `${resource.title} — Day 0 started by ${session.email}`,
        text: `${session.name || session.email} ticked the Day 0 confirmation at ${nowIso}.\nResource: ${resource.title} (${session.resource_slug}).\nGrant expiry bumped to ${expiresAt} (Day 0 + ${EXPIRES_DAYS_AFTER_DAY0} days).`
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
    meta: { day, filename, size, path: storagePath, upload_id: row.id, slug: session.resource_slug }
  }).then(() => {}, () => {});

  try {
    await send({
      to: ['airem@blendxr.online', 'vedika@blendxr.online'],
      subject: `${resource.title}: Day ${day} upload from ${session.email}`,
      text: `From: ${session.name || session.email}\nResource: ${resource.title} (${session.resource_slug})\nCheckpoint: Day ${day} ${cp.label}\nFile: ${filename}\nSize: ${Math.round(size / 1024 / 1024)} MB\nPath: ${storagePath}\nUpload id: ${row.id}`
    });
  } catch (err) { console.warn('upload email failed', err); }

  return jsonResponse(200, { ok: true, id: row.id });
};
