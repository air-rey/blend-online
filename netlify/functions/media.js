// GET /media/<filename>
// Returns a 303 redirect to a short-lived (5 min) signed Supabase URL for
// the image or video inside the `media` private bucket. Session cookie
// required; the resource_slug on the session scopes which media path can
// be fetched (volga-test-scene/<filename>).

const { supa } = require('./_lib/supa');
const { readSession } = require('./_lib/cookie');
const { jsonResponse, redirectResponse } = require('./_lib/html');

exports.handler = async function (event) {
  const session = await readSession(event.headers || {});
  if (!session) return redirectResponse('/');
  if (session.resource_slug !== 'volga-test-scene') return redirectResponse('/');

  // Path after /media/
  const raw = (event.path || '').replace(/^\/.netlify\/functions\/media\/?/, '').replace(/^\/media\/?/, '');
  const name = decodeURIComponent(raw).replace(/\\/g, '').replace(/\.\./g, '');
  if (!name) return jsonResponse(400, { error: 'missing filename' });

  // All media for this resource lives at media/<slug>/<file>
  const key = `${session.resource_slug}/${name}`;
  const db  = supa();
  const { data, error } = await db.storage.from('media').createSignedUrl(key, 5 * 60);
  if (error || !data || !data.signedUrl) {
    console.error('media signed-url failed', error, key);
    return jsonResponse(404, { error: 'not found' });
  }
  return redirectResponse(data.signedUrl, { 'Cache-Control': 'private, no-store' });
};
