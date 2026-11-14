// GET /download/<key>
// Returns a 302 redirect to a 24-hour signed Supabase URL for the file
// in the `downloads` private bucket. Also logs the download in `events`.
// Per-resource allowlist and storagePrefix come from _lib/resources.js
// so each resource exposes only its own download set and reads from its
// own folder under the bucket (Volga's prefix is the empty string for
// the legacy root layout).

const { supa } = require('./_lib/supa');
const { readSession } = require('./_lib/cookie');
const { jsonResponse, redirectResponse } = require('./_lib/html');
const { getResource, allowedDownloadKeys } = require('./_lib/resources');

exports.handler = async function (event) {
  const session = await readSession(event.headers || {});
  if (!session) return redirectResponse('/');
  const resource = getResource(session.resource_slug);
  if (!resource) return redirectResponse('/');

  const raw = (event.path || '').replace(/^\/.netlify\/functions\/download-url\/?/, '').replace(/^\/download\/?/, '');
  const name = decodeURIComponent(raw).replace(/\\/g, '').replace(/\.\./g, '');
  if (!name || !allowedDownloadKeys(session.resource_slug).has(name)) {
    return jsonResponse(404, { error: 'not found' });
  }

  const db = supa();
  const key = resource.storagePrefix + name;
  const { data, error } = await db.storage.from('downloads').createSignedUrl(key, 24 * 60 * 60);
  if (error || !data || !data.signedUrl) {
    console.error('download signed-url failed', error, key);
    return jsonResponse(404, { error: 'not found' });
  }

  if (session.grant_id) {
    const h = event.headers || {};
    const ip = (h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || null;
    await db.from('events').insert({
      grant_id: session.grant_id, kind: 'asset_downloaded',
      meta: { file: name, ip, ua: h['user-agent'] || null }
    }).then(() => {}, () => {});
  }
  return jsonResponse(200, { url: data.signedUrl, expires_in: 24 * 60 * 60 });
};
