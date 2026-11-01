// GET  /nda : renders the mutual NDA text + signer form
// POST /.netlify/functions/nda : signs it (generates PDF, uploads, emails,
//                                 inserts nda_signatures, flips session's
//                                 agreement_ok to true, redirects to /r)
//
// Requires a session cookie minted by /.netlify/functions/enter. The gate
// should only route to /nda when the session's resource has
// agreement_type = 'mutual_nda'. If someone with an already-signed NDA for
// the current version hits GET, they're bounced to /r.

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const { supa } = require('./_lib/supa');
const { readSession, setCookieHeader, makeSession } = require('./_lib/cookie');
const { page, htmlResponse, jsonResponse, redirectResponse, esc } = require('./_lib/html');
const { buildMutualNdaPdf } = require('./_lib/pdf');
const { send } = require('./_lib/email');

const NDA_PATH    = path.join(__dirname, '..', '..', 'private-content', 'mutual-nda', 'nda.txt');
const NDA_VERSION = '2026-11-01';

function readNda () {
  const text = fs.readFileSync(NDA_PATH, 'utf-8');
  const sha  = crypto.createHash('sha256').update(text).digest('hex');
  return { text, sha };
}

function clientIp (event) {
  const h = event.headers || {};
  return (h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || null;
}
function userAgent (event) { return (event.headers || {})['user-agent'] || null; }

function parseForm (body) {
  const out = {};
  if (!body) return out;
  const params = new URLSearchParams(body);
  for (const [k, v] of params) out[k] = v;
  return out;
}

function renderNdaPage (session, counterpartyName, ndaText, ndaVersion) {
  const paragraphs = ndaText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const bodyHtml = paragraphs.map(p => {
    if (/^PART [A-Z]:/.test(p)) return `<h2>${esc(p)}</h2>`;
    if (/^On behalf of /.test(p)) return `<p class="sig-line">${esc(p)}</p>`;
    return `<p>${esc(p)}</p>`;
  }).join('\n');

  const body = `
<div class="layout layout--wide">
  <div class="mast">
    <svg viewBox="0 0 64 64" aria-hidden="true"><g transform="translate(32 32) rotate(-16)" fill="none" stroke="currentColor" stroke-width="1.4">
      <ellipse cx="0" cy="-10" rx="26" ry="3.4" opacity=".45"/>
      <ellipse cx="0" cy="-5"  rx="27" ry="3.8" opacity=".7"/>
      <ellipse cx="0" cy="0"   rx="28" ry="4.2"/>
      <ellipse cx="0" cy="5"   rx="27" ry="3.8" opacity=".7"/>
      <ellipse cx="0" cy="10"  rx="26" ry="3.4" opacity=".45"/>
    </g></svg>
    <span>BlendXR deal room</span>
    <span style="margin-left:auto;color:var(--muted-soft);">${esc(session.email)}</span>
  </div>

  <h1>Sign the mutual NDA</h1>
  <p class="caps" style="margin-bottom:4px;">Version ${esc(ndaVersion)}</p>
  <p style="color:var(--body);">Read the agreement in full. The signer must be authorised to bind ${esc(counterpartyName || 'your organisation')}. BlendXR has already signed; your signature below completes the agreement, and a countersigned PDF is emailed to you.</p>

  <section class="agreement-body" aria-label="NDA text">
    ${bodyHtml}
  </section>

  <hr>

  <h2>Your signature</h2>
  <form id="signForm" method="POST" action="/.netlify/functions/nda" novalidate>
    <div class="row2">
      <label class="field"><span>Full legal name of signer</span>
        <input class="input" name="signer_name" required autocomplete="name"></label>
      <label class="field"><span>Title / role</span>
        <input class="input" name="signer_title" required autocomplete="organization-title"></label>
    </div>
    <label class="field"><span>Counterparty legal name</span>
      <input class="input" name="counterparty_legal_name" required value="${esc(counterpartyName || '')}"></label>

    <label class="check">
      <input type="checkbox" name="authorised" value="1" required>
      <span>I am authorised to sign this agreement on behalf of the Counterparty named above.</span>
    </label>

    <div style="display:flex; gap:12px; margin-top:20px;">
      <button type="submit" class="btn" id="signBtn">Sign and continue</button>
      <a class="btn btn--ghost" href="/.netlify/functions/not-signatory">I am not the signatory</a>
    </div>
    <p class="msg" id="signMsg" aria-live="polite"></p>
  </form>

  <p class="footer-note">
    Governed by the laws of India. The Agreement takes effect on execution by both parties and may be executed electronically and in counterparts (Section 14). Blendtobases OU, trading as BlendXR. Confidential.
  </p>
</div>

<script>
  (function () {
    var f = document.getElementById('signForm');
    var btn = document.getElementById('signBtn');
    var msg = document.getElementById('signMsg');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.className = 'msg'; msg.textContent = '';
      btn.disabled = true; btn.textContent = 'Signing…';
      var body = new URLSearchParams(new FormData(f)).toString();
      fetch('/.netlify/functions/nda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: body, credentials: 'same-origin'
      }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        btn.disabled = false; btn.textContent = 'Sign and continue';
        if (res.status === 200 && res.body.redirect) { window.location.href = res.body.redirect; return; }
        msg.className = 'msg is-err'; msg.textContent = (res.body && res.body.error) || 'Could not sign. Try again.';
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'Sign and continue';
        msg.className = 'msg is-err'; msg.textContent = 'Network error. Try again.';
      });
    });
  })();
</script>
`;
  return page({
    title: 'Sign the NDA',
    bodyHtml: body,
    extraCss: `
      .agreement-body { background: #0a0a0a; border: 1px solid var(--hairline); border-radius: 10px; padding: 24px 26px; max-height: 460px; overflow-y: auto; }
      .agreement-body p { font: 400 13px/1.65 'Rajdhani', sans-serif; color: var(--ink); margin: 0 0 0.9em; }
      .agreement-body h2 { font: 600 14px/1.3 'Sarpanch', sans-serif; margin: 1.3em 0 0.6em; letter-spacing: 1px; text-transform: uppercase; color: var(--text-strong); }
      .sig-line { color: var(--muted); font-size: 12px; }
    `
  });
}

exports.handler = async function (event) {
  const session = await readSession(event.headers || {});
  if (!session || !session.sub || session.sub.startsWith('event:')) {
    // Email path only; event-code sessions have no person_id to attach a
    // signature to in the current schema. (If we later need buyer in-person
    // NDA signing from an iPad, this is where that branch would go.)
    return redirectResponse('/');
  }

  const db = supa();

  if (event.httpMethod === 'GET') {
    const { data: existing } = await db.from('nda_signatures')
      .select('id, agreement_version')
      .eq('person_id', session.sub)
      .eq('agreement_version', NDA_VERSION)
      .maybeSingle();
    if (existing) return redirectResponse('/r');

    const { data: org } = await db.from('orgs')
      .select('name, legal_name').eq('id', session.org_id).maybeSingle();
    const counterpartyName = (org && (org.legal_name || org.name)) || '';

    const { text } = readNda();
    return htmlResponse(renderNdaPage(session, counterpartyName, text, NDA_VERSION));
  }

  if (event.httpMethod === 'POST') {
    const form = parseForm(event.body || '');
    const required = ['signer_name', 'signer_title', 'counterparty_legal_name', 'authorised'];
    for (const k of required) {
      if (!form[k] || !String(form[k]).trim()) {
        return jsonResponse(400, { error: 'Please fill every field (and tick authorised).' });
      }
    }

    const ip  = clientIp(event);
    const ua  = userAgent(event);
    const now = new Date();
    const { text: ndaText, sha: ndaSha } = readNda();

    const auditRecord = {
      id:        crypto.randomUUID(),
      email:     session.email,
      signedAt:  now.toISOString(),
      ip, userAgent: ua
    };

    let pdf;
    try {
      pdf = await buildMutualNdaPdf({
        ndaText,
        ndaVersion: NDA_VERSION,
        ndaSha256:  ndaSha,
        counterparty: {
          legalName: form.counterparty_legal_name,
          country:   'India'
        },
        signer:  { name: form.signer_name, title: form.signer_title },
        blendxr: { name: 'Vedika Bhasin', title: 'Founder', date: now.toUTCString() },
        auditRecord
      });
    } catch (err) {
      console.error('NDA PDF build failed', err);
      return jsonResponse(500, { error: 'Could not generate the executed PDF. Please try again.' });
    }

    const safeName = String(form.counterparty_legal_name).replace(/[^A-Za-z0-9]+/g, '_');
    const storagePath = `nda/${session.org_id}/${NDA_VERSION}-${auditRecord.id}.pdf`;
    const upload = await db.storage.from('agreements').upload(storagePath, pdf, {
      contentType: 'application/pdf', upsert: false
    });
    if (upload.error) {
      console.error('agreements upload failed', upload.error);
      return jsonResponse(500, { error: 'Could not store the executed PDF.' });
    }

    const { error: sigErr } = await db.from('nda_signatures').insert({
      person_id:         session.sub,
      agreement_version: NDA_VERSION,
      signer_name:       form.signer_name,
      signed_at:         now.toISOString(),
      ip, user_agent:    ua,
      pdf_ref:           storagePath
    });
    if (sigErr) {
      console.error('nda_signatures insert failed', sigErr);
      return jsonResponse(500, { error: 'Could not record the signed NDA.' });
    }

    // Also persist the counterparty's legal name on the org row if blank.
    await db.from('orgs').update({ legal_name: form.counterparty_legal_name })
      .eq('id', session.org_id).is('legal_name', null).then(() => {}, () => {});

    try {
      const b64 = pdf.toString('base64');
      await send({
        to: [session.email, 'airem@blendxr.online'],
        subject: `Executed: BlendXR x ${form.counterparty_legal_name} mutual NDA`,
        text: `Attached: executed copy of the BlendXR mutual NDA, version ${NDA_VERSION}, signed by ${form.signer_name} (${form.signer_title}) for ${form.counterparty_legal_name} on ${now.toUTCString()}.\n\nAccess continues at https://blendxr.online/r`,
        attachments: [{
          filename: `BlendXR-${safeName}-NDA-${NDA_VERSION}.pdf`,
          content:  b64
        }]
      });
    } catch (err) {
      console.warn('NDA email failed', err);
    }

    const token = await makeSession(Object.assign({}, session, { agreement_ok: true }));

    await db.from('events').insert({
      grant_id: session.grant_id || null,
      kind: 'nda_executed',
      meta: { pdf: storagePath, ip, version: NDA_VERSION }
    }).then(() => {}, () => {});

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
        'Set-Cookie': setCookieHeader(token)
      },
      body: JSON.stringify({ redirect: '/r?signed=1' })
    };
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};
