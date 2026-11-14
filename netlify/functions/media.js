// GET /media/<filename>
// Returns a 303 redirect to a 24-hour signed Supabase URL for the image
// or video inside the `media` private bucket. Session cookie required;
// the session's resource_slug picks the per-resource storagePrefix so
// each resource serves its own set of media objects out of the same
// bucket. Volga's prefix is the empty string (legacy root layout);
// new resources live under `<slug>/`. See _lib/resources.js.

const { supa } = require('./_lib/supa');
const { readSession } = require('./_lib/cookie');
const { jsonResponse, redirectResponse } = require('./_lib/html');
const { getResource } = require('./_lib/resources');

exports.handler = async function (event) {
  const session = await readSession(event.headers || {});
  if (!session) return redirectResponse('/');
  const resource = getResource(session.resource_slug);
  if (!resource) return redirectResponse('/');

  // Path after /media/
  const raw = (event.path || '').replace(/^\/.netlify\/functions\/media\/?/, '').replace(/^\/media\/?/, '');
  const name = decodeURIComponent(raw).replace(/\\/g, '').replace(/\.\./g, '');
  if (!name) return jsonResponse(400, { error: 'missing filename' });

  const key = resource.storagePrefix + name;
  const db  = supa();
  const { data, error } = await db.storage.from('media').createSignedUrl(key, 24 * 60 * 60);
  if (error || !data || !data.signedUrl) {
    console.error('media signed-url failed', error, key);
    return jsonResponse(404, { error: 'not found' });
  }
  return redirectResponse(data.signedUrl, { 'Cache-Control': 'private, no-store' });
};
