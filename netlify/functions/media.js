// GET /media/<filename>
// Returns a 303 redirect to a 24-hour signed Supabase URL for the image or
// video inside the `media` private bucket. Session cookie required; the
// session's resource_slug gates which brief can request media at all.
// Files live at the bucket root (no slug subfolder) in this single-resource
// MVP; add a prefix here when a second resource is onboarded.

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

  // Files are stored at the bucket root for this MVP (see upload-content.js).
  const key = name;
  const db  = supa();
  const { data, error } = await db.storage.from('media').createSignedUrl(key, 24 * 60 * 60);
  if (error || !data || !data.signedUrl) {
    console.error('media signed-url failed', error, key);
    return jsonResponse(404, { error: 'not found' });
  }
  return redirectResponse(data.signedUrl, { 'Cache-Control': 'private, no-store' });
};
