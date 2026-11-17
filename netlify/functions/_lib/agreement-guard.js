// Shared server-side gate: does the session's org (or person, for NDA
// resources) hold a signed agreement for the resource's CURRENT required
// version? The cookie's `agreement_ok` flag is advisory only — every
// gated endpoint calls this against the live DB so a version bump, a
// revoked grant or a voided/superseded agreement takes effect on the
// very next request without waiting for the cookie to refresh.
//
// Returns { ok: true } if the gate passes.
// Returns { ok: false, redirect: '/agreement' | '/nda' | '/' } otherwise.
// Callers map `redirect` to the response shape they need (303 redirect
// for GETs like /r and /media, 403 JSON for XHR endpoints like /download
// and /upload-*). Resource-type branching lives here so a new NDA-gated
// resource does not need to touch every endpoint.

const { supa } = require('./supa');
const { getResource } = require('./resources');

// Keep in sync with NDA_VERSION in netlify/functions/nda.js. The NDA
// path is dormant for Volga and ApexDream (both are contractor-gated),
// but the guard covers it so adding an NDA-gated resource later works
// without editing every endpoint.
const CURRENT_NDA_VERSION = '2026-11-02';

async function checkAgreement (session) {
  if (!session || !session.resource_slug || !session.resource_id) {
    return { ok: false, redirect: '/' };
  }
  const resource = getResource(session.resource_slug);
  if (!resource) return { ok: false, redirect: '/' };

  const db = supa();
  const { data: dbResource } = await db.from('resources')
    .select('agreement_type').eq('id', session.resource_id).maybeSingle();
  if (!dbResource) return { ok: false, redirect: '/' };

  if (dbResource.agreement_type === 'mutual_nda') {
    const { data: sig } = await db.from('nda_signatures')
      .select('id')
      .eq('person_id', session.sub)
      .eq('agreement_version', CURRENT_NDA_VERSION)
      .limit(1).maybeSingle();
    return sig ? { ok: true } : { ok: false, redirect: '/nda' };
  }

  // Contractor resources: require an executed org_agreements row whose
  // agreement_version matches the resource's CURRENT required version
  // from _lib/resources.js. Older executed rows (e.g. a signer's prior
  // version before a scope revision) are kept as history and stay in
  // the table as `status='superseded'` after the re-sign lands, but
  // they do not satisfy the gate.
  const { data: oa } = await db.from('org_agreements')
    .select('id')
    .eq('org_id', session.org_id)
    .eq('agreement_version', resource.agreementVersion)
    .eq('status', 'executed')
    .limit(1).maybeSingle();
  return oa ? { ok: true } : { ok: false, redirect: '/agreement' };
}

module.exports = { checkAgreement, CURRENT_NDA_VERSION };
