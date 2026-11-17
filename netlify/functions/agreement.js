// GET  /agreement : renders the agreement text + contractor fields form
// POST /.netlify/functions/agreement : signs it (generates PDF, stores
//                                      it, inserts the executed row,
//                                      marks older rows superseded,
//                                      flips the brief gate)
//
// Requires a session cookie minted by /.netlify/functions/enter.
// Does not render for anyone whose agreement is already executed FOR
// THE CURRENT RESOURCE'S CURRENT VERSION; they go straight to /r. Older
// executed rows (e.g. a 2026-11-03 copy when the resource now requires
// 2026-11-17) do not satisfy the gate and the form is re-presented with
// the signer's previous details pre-filled.
//
// Vedika sends the executed PDF to the signer herself. This function
// does not email anyone (no partner-facing automation).

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const { supa } = require('./_lib/supa');
const { readSession, setCookieHeader, makeSession } = require('./_lib/cookie');
const { page, htmlResponse, jsonResponse, redirectResponse, esc } = require('./_lib/html');
const { buildExecutedPdf } = require('./_lib/pdf');
const { getResource } = require('./_lib/resources');

// BlendXR's side of the contractor agreement is dated to the day that
// version of the agreement went live (= the version string, which is a
// YYYY-MM-DD date). Each new agreement version carries its own
// BlendXR-side date on its executed PDF; the contractor's date still
// comes from their actual signing time.
function blendxrDateFromVersion (version) {
  const [y, m, d] = String(version).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // "Tue, 17 Nov 2026" — same date-only format as the signer's date line.
  return dt.toUTCString().replace(/\s\d{2}:\d{2}:\d{2}\sGMT$/, '');
}

// Netlify's function bundler auto-includes files referenced by a static
// __dirname path. The shared template is bundled here because
// agreement.js reads it on every GET and POST.
const SHARED_TEMPLATE = path.join(__dirname, '..', '..', 'private-content', '_shared', 'agreement.txt.template');

function renderAgreementText (resource) {
  const raw = fs.readFileSync(SHARED_TEMPLATE, 'utf-8');
  const text = raw
    .replace(/\{\{VERSION\}\}/g,         resource.agreementVersion)
    .replace(/\{\{BRIEF_TITLE\}\}/g,     resource.agreementBriefTitle)
    .replace(/\{\{DELIVERY_PHRASE\}\}/g, resource.agreementDeliveryPhrase);
  const sha = crypto.createHash('sha256').update(text).digest('hex');
  return { text, sha };
}

function clientIp (event) {
  const h = event.headers || {};
  return (h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || null;
}
function userAgent (event) { return (event.headers || {})['user-agent'] || null; }

function renderAgreementPage (session, resource, agreementText, prefill) {
  const paragraphs = agreementText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const bodyHtml = paragraphs.map(p => {
    if (/^(PART [A-Z]\b|[A-Z][A-Z0-9 ,.()\-]{10,})$/.test(p)) {
      return `<h2>${esc(p)}</h2>`;
    }
    if (/^On behalf of /.test(p) || /^For (Blendtobases|the Contractor)/.test(p)) {
      return `<p class="sig-line">${esc(p)}</p>`;
    }
    return `<p>${esc(p)}</p>`;
  }).join('\n');

  const prior = prefill || {};
  const priorLegal = prior.legal_name || '';
  const priorName  = prior.signer_name || '';
  const priorTitle = prior.signer_title || '';
  const priorEmail = prior.signer_email || session.email || '';
  const priorBanner = prior.priorVersion
    ? `<p class="prior-banner" role="status">We've updated the agreement to reflect the new scope. Please re-sign to continue. Your details are pre-filled.</p>`
    : '';

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

  <h1>Sign the test agreement</h1>
  <p class="caps" style="margin-bottom:4px;">Version ${esc(resource.agreementVersion)}</p>
  <p style="color:var(--body);">The agreement text below is live. Please read it in full. BlendXR has already signed; your signature on the fields below completes the agreement.</p>
  ${priorBanner}

  <section class="agreement-body" aria-label="Agreement text">
    ${bodyHtml}
  </section>

  <hr>

  <h2>Your signature</h2>
  <form id="signForm" method="POST" action="/.netlify/functions/agreement" novalidate>
    <label class="field"><span>Company name</span>
      <input class="input" name="legal_name" required value="${esc(priorLegal)}"></label>
    <div class="row2">
      <label class="field"><span>Signer name</span>
        <input class="input" name="signer_name" required autocomplete="name" value="${esc(priorName)}"></label>
      <label class="field"><span>Title</span>
        <input class="input" name="signer_title" required autocomplete="organization-title" value="${esc(priorTitle)}"></label>
    </div>
    <label class="field"><span>Email</span>
      <input class="input" type="email" name="signer_email" required autocomplete="email" value="${esc(priorEmail)}"></label>

    <label class="check" style="margin-top:14px;">
      <input type="checkbox" name="authorised" value="1" required>
      <span>I am authorised to sign for this company.</span>
    </label>

    <div style="display:flex; gap:12px; margin-top:20px;">
      <button type="submit" class="btn" id="signBtn">Sign and continue</button>
      <a class="btn btn--ghost" href="/.netlify/functions/not-signatory">I am not the signatory</a>
    </div>
    <p class="msg" id="signMsg" aria-live="polite"></p>
  </form>

  <p class="footer-note">
    Governed by the laws of India. The Agreement takes effect on execution by both parties and may be executed electronically and in counterparts (Section 14).
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
      .prior-banner { background: rgba(255,213,120,0.08); border: 1px solid rgba(255,213,120,0.35); border-radius: 10px; padding: 12px 16px; margin: 12px 0 18px; color: var(--text-strong); font: 500 13px/1.5 'Rajdhani', sans-serif; }
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

  const resource = getResource(session.resource_slug);
  if (!resource) return redirectResponse('/');

  const db = supa();

  if (event.httpMethod === 'GET') {
    // Already executed for THIS resource's CURRENT version? Skip the form.
    const { data: current } = await db.from('org_agreements')
      .select('id')
      .eq('org_id', session.org_id)
      .eq('agreement_version', resource.agreementVersion)
      .eq('status', 'executed')
      .limit(1).maybeSingle();
    if (current) return redirectResponse('/r');

    // Pre-fill from the most recent prior row for this org (any version,
    // any status). Keeps the re-sign flow painless for a signer whose
    // only change is the version bump.
    const { data: prior } = await db.from('org_agreements')
      .select('agreement_version, signer_name, signer_title, contractor_fields')
      .eq('org_id', session.org_id)
      .order('signed_at', { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle();

    const prefill = prior ? {
      legal_name:   (prior.contractor_fields && prior.contractor_fields.legal_name) || '',
      signer_name:  prior.signer_name || '',
      signer_title: prior.signer_title || '',
      signer_email: (prior.contractor_fields && prior.contractor_fields.signer_email) || '',
      priorVersion: prior.agreement_version || ''
    } : null;

    const { text } = renderAgreementText(resource);
    return htmlResponse(renderAgreementPage(session, resource, text, prefill));
  }

  if (event.httpMethod === 'POST') {
    const form = parseForm(event.body || '');
    const required = ['legal_name', 'signer_name', 'signer_title', 'signer_email', 'authorised'];
    for (const k of required) {
      if (!form[k] || !String(form[k]).trim()) {
        return jsonResponse(400, { error: 'Please fill every field (and tick authorised).' });
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.signer_email).trim())) {
      return jsonResponse(400, { error: 'Enter a valid email address.' });
    }
    const ip  = clientIp(event);
    const ua  = userAgent(event);
    const now = new Date();

    const { text: agreementText, sha: agreementSha } = renderAgreementText(resource);

    const auditRecord = {
      id:        crypto.randomUUID(),
      email:     String(form.signer_email).trim(),
      signedAt:  now.toISOString(),
      ip, userAgent: ua
    };

    let pdf;
    try {
      pdf = await buildExecutedPdf({
        agreementText,
        agreementVersion: resource.agreementVersion,
        agreementSha256:  agreementSha,
        contractor: { legalName: form.legal_name },
        signer:   { name: form.signer_name, title: form.signer_title },
        blendxr:  { name: 'Vedika Bhasin', title: 'Founder', date: blendxrDateFromVersion(resource.agreementVersion) },
        auditRecord
      });
    } catch (err) {
      console.error('PDF build failed', err);
      return jsonResponse(500, { error: 'Could not generate the executed PDF. Please try again.' });
    }

    // Upload the PDF to the private bucket, keyed by org + version +
    // audit record so re-signs under a new version don't collide with
    // the older executed copy.
    const storagePath = `executed/${session.org_id}/${resource.agreementVersion}-${auditRecord.id}.pdf`;
    const upload = await db.storage.from('agreements').upload(storagePath, pdf, {
      contentType: 'application/pdf', upsert: false
    });
    if (upload.error) {
      console.error('agreements upload failed', upload.error);
      return jsonResponse(500, { error: 'Could not store the executed PDF.' });
    }

    // Record the new org_agreements row as executed.
    const { data: orgAgreement, error: orgErr } = await db.from('org_agreements').insert({
      org_id: session.org_id,
      agreement_version: resource.agreementVersion,
      agreement_sha256:  agreementSha,
      status: 'executed',
      signer_person_id: session.sub,
      signer_name:  form.signer_name,
      signer_title: form.signer_title,
      signed_at:    now.toISOString(),
      ip, user_agent: ua,
      contractor_fields: {
        legal_name:   form.legal_name,
        signer_email: auditRecord.email
      },
      executed_pdf_ref: storagePath,
      audit_record_id: auditRecord.id
    }).select().single();
    if (orgErr) {
      console.error('org_agreements insert failed', orgErr);
      return jsonResponse(500, { error: 'Could not record the signed agreement.' });
    }

    // Mark older executed rows for this org as superseded. They stay in
    // the table as history (their PDF and audit record are unchanged)
    // but no longer satisfy the brief gate.
    await db.from('org_agreements')
      .update({ status: 'superseded' })
      .eq('org_id', session.org_id)
      .eq('status', 'executed')
      .neq('id', orgAgreement.id)
      .then(() => {}, err => console.warn('mark superseded failed', err));

    // Record the per-person acknowledgement at the same time.
    await db.from('acknowledgements').insert({
      person_id: session.sub, org_agreement_id: orgAgreement.id, at: now.toISOString(), ip
    }).then(() => {}, () => {});

    // No auto-email. Vedika sends the executed PDF to the signer
    // herself. The PDF lives in Supabase Storage at `storagePath`.

    // Refresh the session cookie with agreement_ok: true.
    const token = await makeSession(Object.assign({}, session, { agreement_ok: true }));

    await db.from('events').insert({ grant_id: session.grant_id, kind: 'agreement_executed',
      meta: { pdf: storagePath, version: resource.agreementVersion, ip } }).then(() => {}, () => {});

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
