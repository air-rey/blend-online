// GET  /agreement : renders the agreement text + contractor fields form
// POST /.netlify/functions/agreement : signs it (generates PDF, emails,
//                                      flips org_agreements.status to executed)
//
// Requires a session cookie minted by /.netlify/functions/enter.
// Does not render for anyone whose agreement is already executed; they go
// straight to /r (brief).

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const { supa } = require('./_lib/supa');
const { readSession, setCookieHeader, makeSession } = require('./_lib/cookie');
const { page, htmlResponse, jsonResponse, redirectResponse, esc } = require('./_lib/html');
const { buildExecutedPdf } = require('./_lib/pdf');
const { send } = require('./_lib/email');

const AGREEMENT_PATH = path.join(__dirname, '..', '..', 'private-content', 'volga-test-scene', 'agreement.txt');
const AGREEMENT_VERSION = '2026-11-01';

function readAgreement () {
  const text = fs.readFileSync(AGREEMENT_PATH, 'utf-8');
  const sha  = crypto.createHash('sha256').update(text).digest('hex');
  return { text, sha };
}

function clientIp (event) {
  const h = event.headers || {};
  return (h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || null;
}
function userAgent (event) { return (event.headers || {})['user-agent'] || null; }

function renderAgreementPage (session, agreementText, agreementVersion) {
  const paragraphs = agreementText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
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

  <h1>Sign the contractor agreement</h1>
  <p class="caps" style="margin-bottom:4px;">Version ${esc(agreementVersion)}</p>
  <p style="color:var(--body);">The agreement text below is live. Please read it in full. The signer must be authorised to bind ${esc(session.name ? '(' + session.name + ') for ' : '')}your organisation. BlendXR has already signed; your signature on the fields below completes the agreement.</p>

  <section class="agreement-body" aria-label="Agreement text">
    ${bodyHtml}
  </section>

  <hr>

  <h2>Your signature and contractor details</h2>
  <form id="signForm" method="POST" action="/.netlify/functions/agreement" novalidate>
    <div class="row2">
      <label class="field"><span>Full legal name of signer</span>
        <input class="input" name="signer_name" required autocomplete="name"></label>
      <label class="field"><span>Title / role</span>
        <input class="input" name="signer_title" required autocomplete="organization-title"></label>
    </div>

    <h3>Contractor entity</h3>
    <div class="row2">
      <label class="field"><span>Company legal name</span>
        <input class="input" name="legal_name" required></label>
      <label class="field"><span>Entity type</span>
        <select class="select" name="entity_type" required>
          <option value="">Select…</option>
          <option>Private limited company</option>
          <option>Limited Liability Partnership</option>
          <option>Partnership firm</option>
          <option>Sole proprietorship</option>
          <option>One Person Company</option>
          <option>Other</option>
        </select></label>
    </div>
    <div class="row2">
      <label class="field"><span>Registration number (CIN, LLPIN, GSTIN or Udyam)</span>
        <input class="input" name="registration_number" required></label>
      <label class="field"><span>PAN</span>
        <input class="input" name="pan" required pattern="[A-Z]{5}[0-9]{4}[A-Z]" title="PAN format: 5 letters, 4 digits, 1 letter"></label>
    </div>
    <label class="field"><span>Principal place of business</span>
      <textarea class="input" name="address" required rows="2"></textarea></label>

    <h3>Exhibit B: prior inventions and Background IP</h3>
    <p style="color:var(--body);">List anything you consider Background IP that may be incorporated into the Work Product. If none, tick the box.</p>
    <label class="check">
      <input type="checkbox" id="exhibitNone" name="exhibit_none" value="1">
      <span>None. The Contractor has no Background IP or prior inventions to list.</span>
    </label>
    <label class="field"><span>Items (one per line)</span>
      <textarea class="input" id="exhibitText" name="exhibit_text" rows="4" placeholder="e.g. Internal Unreal build pipeline (owned by Volga Infosys)"></textarea></label>

    <h3>Authority</h3>
    <label class="check">
      <input type="checkbox" name="authorised" value="1" required>
      <span>I am authorised to sign this agreement on behalf of the Contractor named above.</span>
    </label>

    <div style="display:flex; gap:12px; margin-top:20px;">
      <button type="submit" class="btn" id="signBtn">Sign and continue</button>
      <a class="btn btn--ghost" href="/.netlify/functions/not-signatory">I am not the signatory</a>
    </div>
    <p class="msg" id="signMsg" aria-live="polite"></p>
  </form>

  <p class="footer-note">
    Governed by the laws of India. The Agreement takes effect on execution by both parties and may be executed electronically and in counterparts (Section 21). Blendtobases OU, trading as BlendXR. Confidential.
  </p>
</div>

<script>
  (function () {
    var f = document.getElementById('signForm');
    var btn = document.getElementById('signBtn');
    var msg = document.getElementById('signMsg');
    var none = document.getElementById('exhibitNone');
    var txt  = document.getElementById('exhibitText');
    none.addEventListener('change', function () { txt.disabled = none.checked; if (none.checked) txt.value = ''; });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.className = 'msg'; msg.textContent = '';
      btn.disabled = true; btn.textContent = 'Signing…';
      var body = new URLSearchParams(new FormData(f)).toString();
      fetch('/.netlify/functions/agreement', {
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
    title: 'Sign the agreement',
    bodyHtml: body,
    extraCss: `
      .agreement-body { background: #0a0a0a; border: 1px solid var(--hairline); border-radius: 10px; padding: 24px 26px; max-height: 460px; overflow-y: auto; }
      .agreement-body p { font: 400 13px/1.65 'Rajdhani', sans-serif; color: var(--ink); margin: 0 0 0.9em; }
      .agreement-body h2 { font: 600 14px/1.3 'Sarpanch', sans-serif; margin: 1.3em 0 0.6em; letter-spacing: 1px; text-transform: uppercase; color: var(--text-strong); }
      .sig-line { color: var(--muted); font-size: 12px; }
    `
  });
}

function parseForm (body) {
  const out = {};
  if (!body) return out;
  const params = new URLSearchParams(body);
  for (const [k, v] of params) out[k] = v;
  return out;
}

exports.handler = async function (event) {
  const session = await readSession(event.headers || {});
  if (!session) return redirectResponse('/');

  // Resource must be the Volga brief (we only serve one today).
  if (session.resource_slug !== 'volga-test-scene') return redirectResponse('/');

  const db = supa();

  if (event.httpMethod === 'GET') {
    // If already executed for this org, skip the agreement.
    const { data: existing } = await db.from('org_agreements')
      .select('status').eq('org_id', session.org_id)
      .order('signed_at', { ascending: false }).limit(1).maybeSingle();
    if (existing && existing.status === 'executed') return redirectResponse('/r');

    const { text, sha } = readAgreement();
    return htmlResponse(renderAgreementPage(session, text, AGREEMENT_VERSION));
  }

  if (event.httpMethod === 'POST') {
    const form = parseForm(event.body || '');
    const required = ['signer_name', 'signer_title', 'legal_name', 'entity_type',
                      'registration_number', 'pan', 'address', 'authorised'];
    for (const k of required) {
      if (!form[k] || !String(form[k]).trim()) {
        return jsonResponse(400, { error: 'Please fill every field (and tick authorised).' });
      }
    }
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(form.pan).toUpperCase())) {
      return jsonResponse(400, { error: 'PAN format must be 5 letters, 4 digits, 1 letter.' });
    }
    const exhibitNone  = form.exhibit_none === '1';
    const exhibitText  = (form.exhibit_text || '').trim();
    const exhibitItems = exhibitNone ? [] : exhibitText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const ip  = clientIp(event);
    const ua  = userAgent(event);
    const now = new Date();

    const { text: agreementText, sha: agreementSha } = readAgreement();

    const auditRecord = {
      id:        crypto.randomUUID(),
      email:     session.email,
      signedAt:  now.toISOString(),
      ip, userAgent: ua
    };

    let pdf;
    try {
      pdf = await buildExecutedPdf({
        agreementText,
        agreementVersion: AGREEMENT_VERSION,
        agreementSha256:  agreementSha,
        contractor: {
          legalName:          form.legal_name,
          entityType:         form.entity_type,
          registrationNumber: form.registration_number,
          pan:                String(form.pan).toUpperCase(),
          address:            form.address,
          country:            'India'
        },
        exhibitB: { none: exhibitNone, items: exhibitItems },
        signer:   { name: form.signer_name, title: form.signer_title },
        blendxr:  { name: 'Vedika Bhasin', title: 'Founder', date: now.toUTCString() },
        auditRecord
      });
    } catch (err) {
      console.error('PDF build failed', err);
      return jsonResponse(500, { error: 'Could not generate the executed PDF. Please try again.' });
    }

    // Upload the PDF to the private bucket.
    const storagePath = `executed/${session.org_id}/${AGREEMENT_VERSION}-${auditRecord.id}.pdf`;
    const upload = await db.storage.from('agreements').upload(storagePath, pdf, {
      contentType: 'application/pdf', upsert: false
    });
    if (upload.error) {
      console.error('agreements upload failed', upload.error);
      return jsonResponse(500, { error: 'Could not store the executed PDF.' });
    }

    // Record the org_agreements row as executed.
    const { data: orgAgreement, error: orgErr } = await db.from('org_agreements').insert({
      org_id: session.org_id,
      agreement_version: AGREEMENT_VERSION,
      agreement_sha256:  agreementSha,
      status: 'executed',
      signer_person_id: session.sub,
      signer_name:  form.signer_name,
      signer_title: form.signer_title,
      signed_at:    now.toISOString(),
      ip, user_agent: ua,
      contractor_fields: {
        legal_name:          form.legal_name,
        entity_type:         form.entity_type,
        registration_number: form.registration_number,
        pan:                 String(form.pan).toUpperCase(),
        address:             form.address,
        country:             'India'
      },
      exhibit_b: { none: exhibitNone, items: exhibitItems },
      executed_pdf_ref: storagePath,
      audit_record_id: auditRecord.id
    }).select().single();
    if (orgErr) {
      console.error('org_agreements insert failed', orgErr);
      return jsonResponse(500, { error: 'Could not record the signed agreement.' });
    }

    // Record the per-person acknowledgement at the same time.
    await db.from('acknowledgements').insert({
      person_id: session.sub, org_agreement_id: orgAgreement.id, at: now.toISOString(), ip
    }).then(() => {}, () => {});

    // Email signer + airem@blendxr.online with the PDF.
    try {
      const b64 = pdf.toString('base64');
      await send({
        to: [session.email, 'airem@blendxr.online'],
        subject: `Executed: BlendXR x ${form.legal_name} contractor agreement`,
        text: `Attached: executed copy of the Independent Contractor, Confidentiality and Intellectual Property Assignment Agreement, version ${AGREEMENT_VERSION}, signed by ${form.signer_name} (${form.signer_title}) for ${form.legal_name} on ${now.toUTCString()}.\n\nAccess continues at https://blendxr.online/r`,
        attachments: [{
          filename: `BlendXR-${form.legal_name.replace(/[^A-Za-z0-9]+/g, '_')}-executed-${AGREEMENT_VERSION}.pdf`,
          content:  b64
        }]
      });
    } catch (err) {
      console.warn('agreement email failed', err);
    }

    // Refresh the session cookie with agreement_ok: true.
    const token = await makeSession(Object.assign({}, session, { agreement_ok: true }));

    await db.from('events').insert({ grant_id: session.grant_id, kind: 'agreement_executed',
      meta: { pdf: storagePath, ip } }).then(() => {}, () => {});

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
        'Set-Cookie': setCookieHeader(token)
      },
      body: JSON.stringify({ redirect: '/r' })
    };
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};
