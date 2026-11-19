// GET /r : server-renders the brief for the viewer's current resource.
//
// Guards:
//   - Must have a session cookie (set by /.netlify/functions/enter).
//   - The session's `resource_slug` must resolve to a known resource via
//     _lib/resources.js. Resources are configured there (brief path,
//     per-resource downloads list, Day-0 anchor, storage prefix).
//   - The org must have an executed agreement (contractor resources) or
//     the person must have an NDA signature (mutual-NDA resources). The
//     real check is server-side via org_agreements / nda_signatures, not
//     the cookie's `agreement_ok` flag alone.
//
// Rendering:
//   - Markdown converted inline via _lib/markdown.js.
//   - Images and video are rewritten to /media/<path> which hits our
//     signed URL endpoint, so Supabase storage is never public.
//   - Downloads panel + Uploads panel inject where brief.md has HTML
//     comments. Per-resource panel content comes from the resource's
//     config in _lib/resources.js.
//   - A tiled SVG watermark with the viewer's identity sits over the
//     page and over every image and video.
//
// Logging:
//   - Each render inserts a `brief_viewed` event. The browser-side
//     heartbeat function (event.js) extends this with `time_on_page`
//     and section reads.

const fs = require('fs');
const path = require('path');

const { supa } = require('./_lib/supa');
const { readSession } = require('./_lib/cookie');
const { page, htmlResponse, redirectResponse, esc, watermarkCss, watermarkDataUrl } = require('./_lib/html');
const md = require('./_lib/markdown');
const { getResource } = require('./_lib/resources');

// Netlify's function bundler auto-includes files referenced by
// fs.readFileSync with __dirname and a static string. Keep these
// explicit so the bundler ships every brief alongside the function:
//   require.resolve-like inclusion for private-content/<slug>/brief.md
const BRIEF_PATHS = {
  'volga-test-scene':       path.join(__dirname, '..', '..', 'private-content', 'volga-test-scene', 'brief.md'),
  'apexdream-confined-space': path.join(__dirname, '..', '..', 'private-content', 'apexdream-confined-space', 'brief.md')
};

// Checkpoints for the uploads panel come from the per-resource config
// in _lib/resources.js. The first resource shipped uses a Day 0 + Day
// 4/9/14 upload shape; ApexDream's reduced scope is Day 0 + one demo-
// APK delivery row with `dueBusinessDays` + a `dueText` placeholder
// (its due date is "Day 0 + 7 business days (Mon–Fri)", not a calendar
// offset). The Day 0 row always behaves the same way; the rest are
// rendered as upload rows with the per-row `accepts` filter.

function fmtDate (d) {
  try { return new Date(d).toUTCString(); } catch (_) { return String(d); }
}

// Add N business days (Mon–Fri) in India Standard Time (UTC+5:30).
// The input is a UTC ISO timestamp (the Day 0 tick as stored). We shift
// it by +5:30 so the resulting Date's UTC fields represent the IST
// calendar date and weekday; we advance one day at a time and skip
// Saturday (6) / Sunday (0) in IST. Doing the math in IST matters at
// the day boundary: a tick at 03:00 UTC is already 08:30 IST the same
// day, but a tick at 20:00 UTC is 01:30 IST the next day. The returned
// Date carries IST-shifted fields and the formatter below prints them
// as "Day, DD Mon YYYY" + an explicit (IST) suffix on the dueCell.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function addBusinessDaysIst (startUtc, n) {
  const ist = new Date(new Date(startUtc).getTime() + IST_OFFSET_MS);
  let added = 0;
  while (added < n) {
    ist.setUTCDate(ist.getUTCDate() + 1);
    const dow = ist.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return ist;
}

// Format an IST-shifted Date's UTC fields as a date-only string.
// "Sun, 29 Nov 2026" rather than "Sun, 29 Nov 2026 00:00:00 GMT".
function fmtIstDate (istShifted) {
  return istShifted.toUTCString().replace(/\s\d{2}:\d{2}:\d{2}\sGMT$/, '');
}

function panelHtml (which, state = {}) {
  const day0TickedAt       = state.day0TickedAt || null;
  const day0AnchorOverride = state.day0AnchorOverride || null;
  const downloads          = state.downloads || [];
  const day0AnchorMs       = state.day0AnchorMs; // null allowed
  const checkpoints        = state.checkpoints || [];
  if (which === 'DOWNLOADS') {
    const rows = downloads.map(d => `
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
    const rows = checkpoints.map((cp, idx) => {
      if (cp.day === 0) {
        const alreadyTicked = !!day0TickedAt;
        // Day 0 status line. When Day 0 is admin-pinned (an off-platform
        // agreed date that differs from the partner's actual tick
        // timestamp), show the pinned date as the authoritative Day 0 in
        // IST plus the tick date as "Confirmed <D Mon>", so the panel
        // matches the clock the partner sees. When there's no pin, keep
        // the original "Day 0 confirmed on <tick>. Clock started." line.
        let statusText = '';
        if (alreadyTicked && day0AnchorOverride) {
          const overrideIst = fmtIstDate(new Date(new Date(day0AnchorOverride).getTime() + IST_OFFSET_MS));
          const tickIstFull = fmtIstDate(new Date(new Date(day0TickedAt).getTime() + IST_OFFSET_MS));
          const tickDayMon  = tickIstFull.replace(/^[^,]+,\s*/, '').replace(/\s*\d{4}$/, '');
          statusText = 'Day 0: ' + esc(overrideIst) + ' (IST). Confirmed ' + esc(tickDayMon) + '.';
        } else if (alreadyTicked) {
          const stampedAt = new Date(day0TickedAt).toUTCString();
          statusText = 'Day 0 confirmed on ' + esc(stampedAt) + '. Clock started.';
        }
        return `
          <tr data-day="0">
            <td><strong>Day 0</strong></td>
            <td>${esc(cp.label)}<div style="color:var(--muted); font-size:12px; margin-top:4px;">${esc(cp.hint)}</div></td>
            <td style="text-align:right;">
              <label class="check" style="justify-content:flex-end;">
                <input type="checkbox" class="day0-check"${alreadyTicked ? ' checked disabled' : ''}>
                <span>We can access every asset and the setup works</span>
              </label>
              <div class="up-status" data-day="0"${alreadyTicked ? ' style="color:var(--success); font-size:12px; margin-top:6px;"' : ''}>${statusText}</div>
            </td>
          </tr>`;
      }
      // Upload rows are locked until Day 0 is ticked. Due-date display
      // picks the first rule that fits:
      //   1. cp.dueBusinessDays set AND we have an effective Day 0:
      //      compute Day 0 + N business days (Mon-Fri), render that
      //      calendar date.
      //   2. cp.dueText set (e.g. "Due Day 0 + 7 business days"): show
      //      that string. Used pre-tick for business-days rows, and
      //      for any row whose due date is not a numeric offset.
      //   3. Effective Day 0 known (admin-set override OR partner tick
      //      OR per-resource fixed anchor): render Day 0 + cp.day
      //      calendar days.
      //   4. Nothing known: "set on Day 0" placeholder.
      //
      // "Effective Day 0" prefers an admin-set grants.day0_anchor_override
      // over the partner's actual checkpoint_status.ticked_at, so dates
      // agreed off-platform drive the clock even when the tick lands
      // later.
      const locked = (idx > 0) && !day0TickedAt;
      const effectiveDay0 = day0AnchorOverride
        || day0TickedAt
        || (typeof day0AnchorMs === 'number' ? new Date(day0AnchorMs).toISOString() : null);
      const anchor = effectiveDay0 ? new Date(effectiveDay0).getTime() : null;
      let dueCell;
      if (cp.dueBusinessDays && effectiveDay0) {
        const istDue = addBusinessDaysIst(effectiveDay0, cp.dueBusinessDays);
        const dueLabel = fmtIstDate(istDue);
        dueCell = `<div style="color:var(--muted); font-size:12px; margin-top:4px;">Due by end of ${esc(dueLabel)} (IST)</div>`;
      } else if (cp.dueText) {
        dueCell = `<div style="color:var(--muted); font-size:12px; margin-top:4px;">${esc(cp.dueText)}</div>`;
      } else if (anchor === null) {
        dueCell = `<div style="color:var(--muted); font-size:12px; margin-top:4px;">Due date is set once Day 0 is ticked.</div>`;
      } else {
        const dueAt = new Date(anchor + cp.day * 24 * 60 * 60 * 1000);
        const dueLabel = dueAt.toUTCString().replace(/\s\d{2}:\d{2}:\d{2}\sGMT$/, '');
        dueCell = `<div style="color:var(--muted); font-size:12px; margin-top:4px;">Due by end of ${esc(dueLabel)}</div>`;
      }
      return `
        <tr data-day="${cp.day}" class="up-row"${locked ? ' data-locked="1"' : ''}>
          <td><strong>Day ${cp.day}</strong></td>
          <td>${esc(cp.label)}<div style="color:var(--muted); font-size:12px; margin-top:4px;">${esc(cp.hint)}</div>${dueCell}</td>
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
        // Unlock every upload row now that Day 0 is confirmed. The
        // server-rendered page does the same on next load; this keeps
        // the UI in sync before a refresh for both the 4-row Volga
        // sequence and the 2-row ApexDream (Day 0 + Demo APK) layout.
        document.querySelectorAll('.up-row').forEach(function (n) { n.removeAttribute('data-locked'); });
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
  const resource = getResource(session.resource_slug);
  const briefPath = BRIEF_PATHS[session.resource_slug];
  if (!resource || !briefPath) return redirectResponse('/');

  const db = supa();

  // Server-side agreement gate: shared checker so every endpoint runs
  // the same version-aware check against the live DB on each hit (not
  // against the session cookie, which can be stale after a version
  // bump or a void/superseded update).
  const { checkAgreement } = require('./_lib/agreement-guard');
  const gate = await checkAgreement(session);
  if (!gate.ok) return redirectResponse(gate.redirect || '/agreement');

  const justSigned = ((event.queryStringParameters || {}).signed || '') === '1';

  // Load the brief body + frontmatter.
  const briefMd = fs.readFileSync(briefPath, 'utf-8');
  const fm = md.frontmatter(briefMd);
  const title = fm.title || 'BlendXR brief';
  const version = fm.version || '';
  const contact = fm.contact || 'airem@blendxr.online';

  // Look up whether this viewer's grant has already ticked Day 0, so the
  // uploads panel can render the checkbox as checked+disabled and unlock
  // downstream rows across page reloads.
  //
  // Also read grants.day0_anchor_override: an admin-set pin used when Day
  // 0 was agreed off-platform and the partner's actual tick timestamp
  // should not drive due-date math (e.g. Volga agreed Day 0 = 2026-11-14
  // by email on Nov 13; Shivam could only tick on Nov 17). The override
  // only affects the due-date math passed to panelHtml; the tick row
  // stays as history, the checkbox still shows "Day 0 confirmed on
  // <tick>", and the clock the partner sees lines up with the agreed
  // Day 0.
  let day0TickedAt = null;
  let day0AnchorOverride = null;
  if (session.grant_id && session.resource_id) {
    const { data: g } = await db.from('grants')
      .select('day0_anchor_override').eq('id', session.grant_id).maybeSingle();
    if (g && g.day0_anchor_override) day0AnchorOverride = g.day0_anchor_override;

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
    onPanel: (which) => panelHtml(which, {
      day0TickedAt,
      day0AnchorOverride,
      downloads:    resource.downloads,
      day0AnchorMs: resource.day0AnchorMs,
      checkpoints:  resource.checkpoints
    })
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
      <strong>Agreement signed.</strong>
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
      meta: { version, slug: session.resource_slug, ip, ua: h['user-agent'] || null }
    }).then(() => {}, () => {});
  }

  return htmlResponse(html);
};
