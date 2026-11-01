// GET /my-nda : 303s the current viewer to a 5-minute signed URL for
// their most recent executed NDA PDF.
//
// Requires a session cookie minted by /.netlify/functions/enter. The
// signature row is looked up by person_id; the signed URL carries a
// download= hint so browsers save it with a friendly filename rather
// than treating it inline.

const { supa } = require('./_lib/supa');
const { readSession } = require('./_lib/cookie');
const { jsonResponse, redirectResponse } = require('./_lib/html');

exports.handler = async function (event) {
  const session = await readSession(event.headers || {});
  if (!session || !session.sub || session.sub.startsWith('event:')) {
    return redirectResponse('/');
  }

  const db = supa();

  const { data: sig, error } = await db.from('nda_signatures')
    .select('id, pdf_ref, agreement_version, signed_at')
    .eq('person_id', session.sub)
    .order('signed_at', { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();

  if (error) {
    console.error('nda_signatures lookup failed', error);
    return jsonResponse(500, { error: 'Lookup failed' });
  }
  if (!sig || !sig.pdf_ref) {
    return redirectResponse('/nda');
  }

  const filename = `BlendXR-NDA-${sig.agreement_version}.pdf`;
  const { data: signed, error: signErr } = await db.storage
    .from('agreements')
    .createSignedUrl(sig.pdf_ref, 300, { download: filename });

  if (signErr || !signed || !signed.signedUrl) {
    console.error('signed url failed', signErr);
    return jsonResponse(500, { error: 'Could not generate link' });
  }

  await db.from('events').insert({
    grant_id: session.grant_id || null,
    kind: 'nda_downloaded',
    meta: { pdf_ref: sig.pdf_ref, version: sig.agreement_version }
  }).then(() => {}, () => {});

  return redirectResponse(signed.signedUrl);
};
