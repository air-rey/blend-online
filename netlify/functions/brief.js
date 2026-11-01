// GET /r : server-renders the Volga brief.
//
// Guards:
//   - Must have a session cookie (set by /.netlify/functions/enter).
//   - Session's resource_slug must match the brief we serve today (volga-test-scene).
//   - The org must have an executed agreement (session.agreement_ok). If not,
//     redirect to /agreement. The real check is server-side via org_agreements.
//
// Rendering:
//   - Markdown converted inline via _lib/markdown.js.
//   - Images and video are rewritten to /media/<path> which hits our signed
//     URL endpoint, so Supabase storage is never public.
//   - Downloads panel + Uploads panel inject where brief.md has HTML comments.
//   - A tiled SVG watermark with the viewer's identity sits over the page
//     and over every image and video (an inner .wm--img overlay).
//
// Logging:
//   - Each render inserts a `brief_viewed` event. The browser-side heartbeat
//     function (event.js) extends this with `time_on_page` and section reads.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { supa } = require('./_lib/supa');
const { readSession } = require('./_lib/cookie');
const { page, htmlResponse, redirectResponse, esc, watermarkCss, watermarkDataUrl } = require('./_lib/html');
const md = require('./_lib/markdown');

const BRIEF_PATH = path.join(__dirname, '..', '..', 'private-content', 'volga-test-scene', 'brief.md');

// Keep in sync with NDA_VERSION in netlify/functions/nda.js.
const CURRENT_NDA_VERSION = '2026-11-02';

// Downloads list drives the panel UI. Each file is stored at
// `volga/<key>` in the `downloads` private bucket. The upload step is a
// one-time admin action; see README.md.
const DOWNLOADS = [
  { label: 'S1 Room hum',        key: 'hum-electric.mp3' },
  { label: 'S2 Spark crackle',   key: 'crackle.mp3' },
  { label: 'S3 App start',       key: 'EnterApp.mp3' },
  { label: 'S4 Door unlock and app quit', key: 'unlocking-metal-door.mp3' }
];

// Checkpoints for the uploads panel. Day 0 is a confirmation checkbox,
// Days 4/9/14 are real uploads. These should match the DB rows created
// by the seed in db/schema.sql.
const CHECKPOINTS = [
  { day: 0,  label: 'Start confirmation', accepts: '',               hint: 'Tick to confirm you can access every asset and the setup works. Emails airem@blendxr.online and starts the clock.' },
  { day: 4,  label: 'Gray box',           accepts: '.mp4,.mov',      hint: 'One headset capture video of the blocked-out room with gaze working on all 4 targets, debug reticle on.' },
  { day: 9,  label: 'First APK',          accepts: '.apk',           hint: 'Full flow fade-in to app exit, pulses and session file working, placeholder art acceptable.' },
  { day: 14, label: 'Final delivery',     accepts: '.apk,.zip,.md,.json', hint: 'Final APK, project zip (with .git and LFS), README, sample session file.' }
];

function fmtDate (d) {
  try { return new Date(d).toUTCString(); } catch (_) { return String(d); }
}

function panelHtml (which, state = {}) {
  const day0TickedAt = state.day0TickedAt || null;
  if (which === 'DOWNLOADS') {
    const rows = DOWNLOADS.map(d => `
      <tr>
        <td>${esc(d.label)}</td>
        <td class="caps" style="color:var(--muted);">${esc(d.key.split('.').pop().toUpperCase())}</td>
        <td style="text-align:right;">
          <a class="btn btn--ghost dl-btn" href="/download/${encodeURIComponent(d.key)}"
             data-key="${esc(d.key)}" data-label="${esc(d.label)}">Download</a>
        </td>
      </tr>`).join('');
    return `
<section class="panel" aria-label="Downloads">
  <h3 style="margin-top:0;">Downloads</h3>
  <p style="color:var(--body); font-size:13px;">Each download is signed to you. Links expire in 10 minutes.</p>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Asset</th><th>Format</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
  }
  if (which === 'UPLOADS') {
    const rows = CHECKPOINTS.map((cp, idx) => {
      if (cp.day === 0) {
        const alreadyTicked = !!day0TickedAt;
        const stampedAt = alreadyTicked ? new Date(day0TickedAt).toUTCString() : '';
        return `
          <tr data-day="0">
            <td><strong>Day 0</strong></td>
            <td>${esc(cp.label)}<div style="color:var(--muted); font-size:12px; margin-top:4px;">${esc(cp.hint)}</div></td>
            <td style="text-align:right;">
              <label class="check" style="justify-content:flex-end;">
                <input type="checkbox" class="day0-check"${alreadyTicked ? ' checked disabled' : ''}>
                <span>We can access every asset and the setup works</span>
              </label>
              <div class="up-status" data-day="0"${alreadyTicked ? ' style="color:var(--success); font-size:12px; margin-top:6px;"' : ''}>${alreadyTicked ? 'Day 0 confirmed on ' + esc(stampedAt) + '. Clock started.' : ''}</div>
            </td>
          </tr>`;
      }
      // After Day 0 is ticked, downstream rows unlock automatically. Before
      // that, Day 4/9/14 start locked and the Day 0 checkbox handler peels
      // the lock off Day 4 on success.
      const locked = (idx > 0) && !day0TickedAt;
      return `
        <tr data-day="${cp.day}" class="up-row"${locked ? ' data-locked="1"' : ''}>
          <td><strong>Day ${cp.day}</strong></td>
          <td>${esc(cp.label)}<div style="color:var(--muted); font-size:12px; margin-top:4px;">${esc(cp.hint)}</div></td>
          <td style="text-align:right;">
            <input type="file" class="up-input" accept="${esc(cp.accepts)}" style="display:none;">
            <button type="button" class="btn btn--ghost up-pick">Choose file…</button>
            <div class="up-status" data-day="${cp.day}" style="margin-top:6px; font-size:12px; color:var(--muted);"></div>
          </td>
        </tr>`;
    }).join('');
    return `
<section class="panel" aria-label="Uploads">
  <h3 style="margin-top:0;">Uploads</h3>
  <p style="color:var(--body); font-size:13px;">Each row unlocks when the previous row has at least one upload (or Day 0 is ticked). Large files resume if your connection drops.</p>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Day</th><th>Checkpoint</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
  }
  return '';
}

function uploadsScript () {
  return `
(function () {
  // Soft copy protection: block clipboard copy/cut, right-click, and image
  // drag inside the brief. Pairs with user-select:none in CSS. Won't stop a
  // determined viewer with devtools, but keeps the brief from being casually
  // selected or dragged out as a screenshot replacement.
  var brief = document.querySelector('.brief');
  if (brief) {
    brief.addEventListener('copy',       function (e) { e.preventDefault(); });
    brief.addEventListener('cut',        function (e) { e.preventDefault(); });
    brief.addEventListener('contextmenu',function (e) { e.preventDefault(); });
    brief.addEventListener('dragstart',  function (e) { e.preventDefault(); });
  }

  var picks = document.querySelectorAll('.up-pick');
  picks.forEach(function (btn) {
    var row = btn.closest('tr');
    var inp = row.querySelector('.up-input');
    btn.addEventListener('click', function () {
      if (row.getAttribute('data-locked') === '1') return;
      inp.click();
    });
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0];
      if (!file) return;
      startUpload(row, file);
    });
  });

  var day0 = document.querySelector('.day0-check');
  if (day0 && !day0.disabled) {
    day0.addEventListener('change', function () {
      if (!day0.checked) return;
      // Lock the input immediately so the viewer can't un-tick between the
      // click and the server response. The server stamps checkpoint_status
      // and emails the BlendXR side; the server-render on next page load
      // will keep it checked/disabled.
      day0.disabled = true;
      fetch('/.netlify/functions/upload-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ day: 0, kind: 'day0-start' })
      }).then(function (r) {
        if (!r.ok) throw new Error('day0 notify failed');
        var s = document.querySelector('.up-status[data-day="0"]');
        if (s) { s.textContent = 'Day 0 confirmed. Clock started.'; s.style.color = 'var(--success)'; }
        var next = document.querySelector('.up-row[data-day="4"]');
        if (next) next.removeAttribute('data-locked');
      }).catch(function () {
        // Server didn't accept — undo the lock and the tick so the viewer
        // can retry.
        day0.checked = false;
        day0.disabled = false;
        var s = document.querySelector('.up-status[data-day="0"]');
        if (s) { s.textContent = 'Could not confirm. Please try again.'; s.style.color = 'var(--muted)'; }
      });
    });
  }

  function startUpload (row, file) {
    var day = row.getAttribute('data-day');
    var status = row.querySelector('.up-status');
    status.textContent = 'Preparing upload…';
    fetch('/.netlify/functions/upload-url', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: day, filename: file.name, size: file.size })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.uploadUrl || !j.token || !j.path) throw new Error('No signed URL');
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', j.uploadUrl, true);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('authorization', 'Bearer ' + j.token);
      xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
      xhr.upload.addEventListener('progress', function (e) {
        if (e.lengthComputable) {
          var pct = Math.round((e.loaded / e.total) * 100);
          status.textContent = 'Uploading ' + pct + '% (' + Math.round(e.loaded / 1024 / 1024) + ' MB of ' + Math.round(e.total / 1024 / 1024) + ' MB)';
        }
      });
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          status.textContent = 'Uploaded. Finalising…';
          fetch('/.netlify/functions/upload-notify', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ day: day, filename: file.name, size: file.size, path: j.path })
          }).then(function () {
            status.textContent = 'Received: ' + file.name + ' (' + Math.round(file.size / 1024 / 1024) + ' MB)';
            status.style.color = 'var(--success)';
            var nextDays = { '4': '9', '9': '14' };
            if (nextDays[day]) {
              var n = document.querySelector('.up-row[data-day="' + nextDays[day] + '"]');
              if (n) n.removeAttribute('data-locked');
            }
          });
        } else {
          status.textContent = 'Upload failed (' + xhr.status + '). Try again.';
          status.style.color = 'var(--error)';
        }
      };
      xhr.onerror = function () {
        status.textContent = 'Upload failed (network). Try again.';
        status.style.color = 'var(--error)';
      };
      xhr.send(file);
    }).catch(function (err) {
      status.textContent = 'Could not start upload. ' + (err && err.message || '');
      status.style.color = 'var(--error)';
    });
  }

  // Download clicks: log via /download/* and open the signed URL.
  var dls = document.querySelectorAll('.dl-btn');
  dls.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var key = a.getAttribute('data-key');
      fetch('/download/' + encodeURIComponent(key), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j.url) window.location.href = j.url; });
    });
  });

  // Lightweight 30s visibility heartbeat.
  var start = Date.now();
  function beat () {
    if (document.hidden) return;
    fetch('/.netlify/functions/event', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'heartbeat', ms: Date.now() - start })
    }).catch(function () {});
  }
  setInterval(beat, 30000);
})();
`;
}

exports.handler = async function (event) {
  const session = await readSession(event.headers || {});
  if (!session) return redirectResponse('/');
  if (session.resource_slug !== 'volga-test-scene') return redirectResponse('/');

  const db = supa();

  // Re-check the agreement status against the DB (don't trust the cookie
  // alone, which could be stale after an agreement was voided). Branch
  // on the resource's agreement_type: 'mutual_nda' resources require a
  // nda_signatures row for the current version; 'contractor' resources
  // require org_agreements.status='executed'.
  if (session.org_id && session.resource_id) {
    const { data: resource } = await db.from('resources')
      .select('agreement_type').eq('id', session.resource_id).maybeSingle();
    if (resource && resource.agreement_type === 'mutual_nda') {
      const { data: sig } = await db.from('nda_signatures')
        .select('id')
        .eq('person_id', session.sub)
        .eq('agreement_version', CURRENT_NDA_VERSION)
        .maybeSingle();
      if (!sig) return redirectResponse('/nda');
    } else {
      const { data: oa } = await db.from('org_agreements')
        .select('status')
        .eq('org_id', session.org_id)
        .order('signed_at', { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle();
      if (!oa || oa.status !== 'executed') return redirectResponse('/agreement');
    }
  }

  const justSigned = ((event.queryStringParameters || {}).signed || '') === '1';

  // Load the brief body + frontmatter.
  const briefMd = fs.readFileSync(BRIEF_PATH, 'utf-8');
  const fm = md.frontmatter(briefMd);
  const title = fm.title || 'BlendXR brief';
  const version = fm.version || '';
  const contact = fm.contact || 'airem@blendxr.online';

  // Look up whether this viewer's grant has already ticked Day 0, so the
  // uploads panel can render the checkbox as checked+disabled and unlock
  // downstream rows across page reloads.
  let day0TickedAt = null;
  if (session.grant_id && session.resource_id) {
    const { data: cp0 } = await db.from('checkpoints')
      .select('id').eq('resource_id', session.resource_id).eq('day', 0).maybeSingle();
    if (cp0) {
      const { data: cs } = await db.from('checkpoint_status')
        .select('ticked_at').eq('grant_id', session.grant_id)
        .eq('checkpoint_id', cp0.id).maybeSingle();
      if (cs && cs.ticked_at) day0TickedAt = cs.ticked_at;
    }
  }

  const bodyHtml = md.render(briefMd, {
    onImage: (alt, src) => {
      // media/path.png -> /media/path.png with watermark overlay
      const url = '/media/' + src.replace(/^media\//, '').replace(/^\/+/, '');
      return `<span class="wm-shell"><img alt="${esc(alt)}" src="${esc(url)}" loading="lazy"><span class="wm--img" aria-hidden="true"></span></span>`;
    },
    onVideo: (src) => {
      const url = '/media/' + src.replace(/^media\//, '').replace(/^\/+/, '');
      return `<span class="wm-shell"><video src="${esc(url)}" muted autoplay loop playsinline controlslist="nodownload" disablepictureinpicture></video><span class="wm--img" aria-hidden="true"></span></span>`;
    },
    onPanel: (which) => panelHtml(which, { day0TickedAt })
  });

  // Watermark data URL baked in server-side.
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const wmUrl = watermarkDataUrl(session.name || 'Viewer', session.email || '', session.email || '', when);

  const html = page({
    title: title,
    extraCss: `
      ${watermarkCss()}
      .mast { position: sticky; top: 0; z-index: 60;
        padding: 10px 0; background: var(--canvas);
        border-bottom: 1px solid var(--hairline);
        display: flex; align-items: center; gap: 10px;
      }
      .mast .spacer { flex: 1; }
      .mast .ver { font: 500 11px/1 'Teko', sans-serif; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); }
      .mast .who { font: 500 12px/1 'Rajdhani', sans-serif; color: var(--muted); }
      .mast .mast-link { font: 500 12px/1 'Rajdhani', sans-serif; color: var(--ink); text-decoration: none; padding: 6px 10px; border: 1px solid var(--hairline-strong); border-radius: 6px; letter-spacing: 0.2px; }
      .mast .mast-link:hover { background: rgba(255,255,255,0.06); color: var(--text-strong); }
      .just-signed {
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
        background: rgba(76, 175, 80, 0.08); border: 1px solid rgba(76, 175, 80, 0.35);
        border-radius: 10px; padding: 14px 18px; margin: 24px 0 20px;
        font: 500 14px/1.4 'Rajdhani', sans-serif; color: var(--text-strong);
      }
      @media (max-width: 560px) { .just-signed { flex-direction: column; align-items: stretch; } }
      .brief img, .brief video { max-width: 100%; height: auto; }
      .brief .table-wrap { overflow-x: auto; margin: 0 0 1.4em; }
      .brief h2 { padding-top: 10px; }
      @media print {
        body { background: #fff !important; color: #000 !important; }
        .brief { display: none; }
        body::before { content: 'Not available offline. See blendxr.online/r.'; display: block; padding: 40px; font-family: sans-serif; }
      }
      body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
      .brief { -webkit-user-select: none; user-select: none; }
      .brief img, .brief video { -webkit-user-select: none; user-select: none; pointer-events: auto; -webkit-user-drag: none; user-drag: none; }
    `,
    bodyHtml: `
<div class="layout" style="--wm-url: ${wmUrl};">
  <div class="mast">
    <svg viewBox="0 0 64 64" aria-hidden="true"><g transform="translate(32 32) rotate(-16)" fill="none" stroke="currentColor" stroke-width="1.4">
      <ellipse cx="0" cy="-10" rx="26" ry="3.4" opacity=".45"/>
      <ellipse cx="0" cy="-5"  rx="27" ry="3.8" opacity=".7"/>
      <ellipse cx="0" cy="0"   rx="28" ry="4.2"/>
      <ellipse cx="0" cy="5"   rx="27" ry="3.8" opacity=".7"/>
      <ellipse cx="0" cy="10"  rx="26" ry="3.4" opacity=".45"/>
    </g></svg>
    <span class="ver">BlendXR brief &middot; v${esc(version)}</span>
    <span class="spacer"></span>
    <span class="who">${esc(session.email || 'viewer')}</span>
  </div>

  ${justSigned ? `
  <div class="just-signed" role="status">
    <div>
      <strong>Mutual NDA signed.</strong>
      <span style="color:var(--body);">A countersigned PDF will be sent to your email shortly.</span>
    </div>
  </div>` : ''}

  <article class="brief">
    ${bodyHtml}
  </article>

  <p class="footer-note">
    Key contact: <a href="mailto:${esc(contact)}">${esc(contact)}</a>. The site provides no chat or messaging. Email is the only channel during the test.<br>
    Last updated ${esc(version)}.
  </p>
</div>
<div class="wm" style="--wm-url: ${wmUrl};" aria-hidden="true"></div>
`,
    extraJs: uploadsScript()
  });

  // Log the view.
  if (session.grant_id) {
    const h = event.headers || {};
    const ip = (h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || null;
    await db.from('events').insert({
      grant_id: session.grant_id, kind: 'brief_viewed',
      meta: { version, ip, ua: h['user-agent'] || null }
    }).then(() => {}, () => {});
  }

  return htmlResponse(html);
};
