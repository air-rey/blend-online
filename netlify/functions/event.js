// POST /.netlify/functions/event
// Lightweight event logger used by the client (heartbeats, section-reached
// pings, media_play). Writes to `events` with grant_id from the session.

const { supa } = require('./_lib/supa');
const { readSession } = require('./_lib/cookie');
const { jsonResponse } = require('./_lib/html');

const ALLOWED_KINDS = new Set([
  'heartbeat', 'section_reached', 'media_played', 'print_attempted'
]);

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'POST only' });
  const session = await readSession(event.headers || {});
  if (!session || !session.grant_id) return jsonResponse(204, {});

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch (_) { return jsonResponse(400, { error: 'bad json' }); }
  const kind = String(payload.kind || '');
  if (!ALLOWED_KINDS.has(kind)) return jsonResponse(400, { error: 'bad kind' });

  // Strip anything that could be used as a serialisation vector.
  const meta = {};
  for (const k of Object.keys(payload)) {
    if (k === 'kind') continue;
    const v = payload[k];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') meta[k] = v;
  }
  await supa().from('events').insert({ grant_id: session.grant_id, kind, meta }).catch(() => {});
  return jsonResponse(204, {});
};
