// POST /.netlify/functions/enter
// Body (application/x-www-form-urlencoded):
//   code      optional 5-digit event code
//   email     optional invite email
//   bot-field honeypot (must be empty)
//
// Decision order:
//   1. Honeypot filled   -> pretend-accept (202).
//   2. Code typed        -> hash + check event_codes for today. If valid,
//                           mint event-scoped session, redirect. If not,
//                           return 403 "not quite". No fallthrough to email.
//   3. Email typed only  -> look up a live grant on `people` + `grants`.
//                           If found, mint person-scoped session, redirect
//                           to /agreement (first time) or /r (if their org
//                           already executed the agreement).
//                           If none, record access_request + 202.
//
// Rate-limiting on event codes: we count failed `gate_code_bad` events for
// the same IP in the last 15 minutes. Five failures locks that IP out of
// the code path for 15 minutes.

const crypto = require('crypto');
const { supa } = require('./_lib/supa');
const { makeSession, setCookieHeader } = require('./_lib/cookie');
const { jsonResponse } = require('./_lib/html');

// Keep in sync with NDA_VERSION in netlify/functions/nda.js.
const CURRENT_NDA_VERSION = '2026-11-01';

function parseForm (body) {
  const out = {};
  if (!body) return out;
  const params = new URLSearchParams(body);
  for (const [k, v] of params) out[k] = v;
  return out;
}
function clientIp (event) {
  const h = event.headers || {};
  return (h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || null;
}
function userAgent (event) { return (event.headers || {})['user-agent'] || null; }

function hashCode (code) {
  const salt = process.env.CODE_SALT || 'blendxr-code-salt-v1';
  return crypto.createHmac('sha256', salt).update(String(code).trim()).digest('hex');
}

async function tooManyCodeFails (db, ip) {
  if (!ip) return false;
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count } = await db.from('events')
    .select('*', { count: 'exact', head: true })
    .eq('kind', 'gate_code_bad')
    .gt('at', since)
    .contains('meta', { ip });
  return (count || 0) >= 5;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'POST only' });

  const form  = parseForm(event.body || '');
  const code  = (form.code  || '').trim();
  const email = (form.email || '').trim().toLowerCase();

  // Honeypot. Silent pass to make the bot think they got through.
  if (form['bot-field']) return jsonResponse(202, { ok: true });

  if (!code && !email) {
    return jsonResponse(400, { error: 'Type a code, or your email to request access.' });
  }

  const db  = supa();
  const ip  = clientIp(event);
  const ua  = userAgent(event);
  const now = new Date().toISOString();

  // --- Code path --------------------------------------------------------
  if (code) {
    if (!/^\d{5}$/.test(code)) {
      await db.from('events').insert({
        kind: 'gate_code_bad', meta: { ip, ua, reason: 'format' }
      }).then(() => {}, () => {});
      return jsonResponse(403, { error: 'Not quite.' });
    }

    if (await tooManyCodeFails(db, ip)) {
      return jsonResponse(429, { error: 'Too many attempts. Try again in 15 minutes.' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const h     = hashCode(code);
    const { data: ec } = await db.from('event_codes')
      .select('id, resource_id, valid_on, revoked_at')
      .eq('code_hash', h)
      .is('revoked_at', null)
      .eq('valid_on', today)
      .maybeSingle();

    if (!ec) {
      await db.from('events').insert({
        kind: 'gate_code_bad', meta: { ip, ua }
      }).then(() => {}, () => {});
      return jsonResponse(403, { error: 'Not quite.' });
    }

    const { data: resource } = await db.from('resources')
      .select('id, slug, agreement_type').eq('id', ec.resource_id).single();

    const token = await makeSession({
      sub:            `event:${ec.id}`,
      name:           'In-person viewer',
      email:          null,
      org_id:         null,
      resource_id:    String(ec.resource_id),
      resource_slug:  resource.slug,
      event_code_id:  String(ec.id),
      agreement_ok:   false  // buyer NDA signed on iPad before content unlocks
    });

    await db.from('events').insert({
      event_code_id: ec.id, kind: 'gate_code_ok', meta: { ip, ua }
    }).then(() => {}, () => {});

    return {
      statusCode: 200,
      headers: {
        'Content-Type':  'application/json',
        'Cache-Control': 'private, no-store',
        'Set-Cookie':    setCookieHeader(token)
      },
      body: JSON.stringify({ redirect: '/agreement' })
    };
  }

  // --- Email path -------------------------------------------------------
  if (email.indexOf('@') < 1) {
    return jsonResponse(400, { error: 'Enter a valid email.' });
  }

  // Find the person first, then look for their live grant.
  const { data: person } = await db.from('people')
    .select('id, name, email, org_id')
    .ilike('email', email)
    .maybeSingle();

  let live = null;
  if (person) {
    const { data: grants } = await db.from('grants')
      .select('id, resource_id, expires_at, revoked_at, agreement_required')
      .eq('person_id', person.id)
      .is('revoked_at', null)
      .gt('expires_at', now)
      .order('created_at', { ascending: false });
    live = (grants || [])[0] || null;
  }

  if (!live) {
    await db.from('access_requests').insert({ email, ip, user_agent: ua })
      .catch(err => console.warn('access_requests insert failed', err));
    await db.from('events').insert({
      kind: 'gate_email_unknown', meta: { email, ip, ua }
    }).then(() => {}, () => {});
    return jsonResponse(202, { ok: true });
  }

  const { data: resource } = await db.from('resources')
    .select('id, slug, agreement_type').eq('id', live.resource_id).single();

  let agreementOk = false;
  let signTarget  = '/agreement';
  if (resource.agreement_type === 'mutual_nda') {
    signTarget = '/nda';
    const { data: ndaSig } = await db.from('nda_signatures')
      .select('id')
      .eq('person_id', person.id)
      .eq('agreement_version', CURRENT_NDA_VERSION)
      .maybeSingle();
    agreementOk = !!ndaSig;
  } else {
    const { data: orgAgreement } = await db.from('org_agreements')
      .select('id, status')
      .eq('org_id', person.org_id)
      .order('signed_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    agreementOk = !!(orgAgreement && orgAgreement.status === 'executed');
  }

  const token = await makeSession({
    sub:            String(person.id),
    name:           person.name,
    email:          person.email,
    org_id:         String(person.org_id),
    resource_id:    String(live.resource_id),
    resource_slug:  resource.slug,
    grant_id:       String(live.id),
    agreement_ok:   agreementOk
  });

  await db.from('events').insert({
    grant_id: live.id, kind: 'gate_entered',
    meta: { ip, ua, agreement_ok: agreementOk, agreement_type: resource.agreement_type }
  }).then(() => {}, () => {});

  const target = agreementOk ? '/r' : signTarget;
  return {
    statusCode: 200,
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'private, no-store',
      'Set-Cookie':    setCookieHeader(token)
    },
    body: JSON.stringify({ redirect: target })
  };
};
