// Client portal: one session page.
//
// Reads public.client_scores as the signed-in user (RLS decides what is
// visible). Columns are listed explicitly; attention is never requested.
// A session that is known to exist but returns zero rows means the code
// expired or was revoked, so the page signs out and returns to the gate.
// It is never shown as "no data".
(function () {
  'use strict';
  var P = window.BlendPortalSession;
  var L = window.BlendPortalLabels;
  var C = P.config;

  var COLUMNS = [
    'session_id', 'tenant_id', 'trainee_id', 'trainee_display_name', 'trainee_role',
    'scene_id', 'attempt_number', 'start_time_utc', 'data_origin', 'synthetic',
    'observation', 'awareness', 'observation_ratio', 'awareness_ratio',
    'assistance_index', 'reference_assistance_index',
    'verdict_code', 'verdict_ratio', 'ending', 'per_target', 'computed_at'
  ].join(',');

  var $ = function (id) { return document.getElementById(id); };
  var state = { client: null, meta: null, sessionId: null, row: null, labels: L.make([]) };

  function esc (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function n (v) { var x = v == null ? NaN : Number(v); return isFinite(x) ? x : null; }
  function f2 (v) { return v == null ? 'Not available' : v.toFixed(2); }
  function pct (r) { return Math.round(r * 100) + '%'; }
  function signed (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2); }

  function show (which) {
    $('loading').hidden   = which !== 'loading';
    $('loadError').hidden = which !== 'error';
    $('content').hidden   = which !== 'content';
    $('page').setAttribute('aria-busy', which === 'loading' ? 'true' : 'false');
  }

  function sessionIdFromUrl () {
    var q = new URLSearchParams(window.location.search).get('session');
    return q && /^[A-Za-z0-9._-]{1,64}$/.test(q) ? q : C.defaultSession;
  }

  function isAuthFailure (res) {
    var e = res && res.error;
    if (res && (res.status === 401 || res.status === 403)) return true;
    if (!e) return false;
    return e.code === 'PGRST301' || e.code === 'PGRST302' || e.code === 'PGRST303' || /jwt/i.test(e.message || '');
  }

  function isSample (row) {
    return row.synthetic === true || /reconstruct|synthetic|sample/i.test(row.data_origin || '');
  }

  // ---------------------------------------------------------------- render

  function renderMeta (row) {
    var parts = ['Session ' + row.session_id];
    parts.push('Trainee ' + (row.trainee_display_name || row.trainee_id));
    if (row.attempt_number != null) parts.push('Attempt ' + row.attempt_number);
    if (row.start_time_utc) {
      var d = new Date(row.start_time_utc);
      if (!isNaN(d)) {
        parts.push(d.toLocaleString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'UTC'
        }) + ' UTC');
      }
    }
    $('sessionMeta').textContent = parts.join('  /  ');
    $('sampleLabel').hidden = !isSample(row);
    document.title = 'Session ' + row.session_id + (isSample(row) ? ' (reconstructed sample)' : '');
  }

  function renderVerdict (row) {
    var code  = row.verdict_code || 'UNSCORABLE';
    var label = state.labels.get(code);
    var ratio = n(row.verdict_ratio);
    var bar = ratio == null
      ? '<span class="verdict__na">Not available</span>'
      : '<span class="vbar" aria-hidden="true"><i style="width:' + Math.min(100, ratio * 100) + '%"></i></span>' +
        '<span class="verdict__num">' + pct(ratio) + '</span>';
    $('verdict').innerHTML =
      '<p class="verdict__eyebrow">Verdict</p>' +
      '<p class="verdict__label" id="verdictLabel">' + esc(label) + '</p>' +
      '<dl class="verdict__facts">' +
        '<div><dt>Ending</dt><dd>' + esc(row.ending ? L.humanize(row.ending) : 'Not recorded') + '</dd></div>' +
        '<div class="verdict__ratio"><dt>Against reference</dt><dd>' + bar + '</dd></div>' +
      '</dl>' +
      (state.labels.isPlaceholder(code)
        ? '<p class="verdict__note">Placeholder label, pending safety manager review.</p>' : '');
  }

  // 270 degree ring: fill is the trainee value on the metric scale, the
  // tick is the reference value. The gap between them is the shortfall.
  function ring (value, ref) {
    var R = 48, CX = 60, CY = 60, SWEEP = 270, START = 135;
    var circ = 2 * Math.PI * R, arc = circ * SWEEP / 360;
    var max = Math.max(1, value || 0, ref || 0);
    var fill = Math.max(0, Math.min(1, (value || 0) / max)) * arc;
    var tick = '';
    if (ref != null) {
      var a = (START + SWEEP * Math.min(1, ref / max)) * Math.PI / 180;
      var x1 = CX + Math.cos(a) * (R - 9), y1 = CY + Math.sin(a) * (R - 9);
      var x2 = CX + Math.cos(a) * (R + 9), y2 = CY + Math.sin(a) * (R + 9);
      tick = '<line class="ring__ref" x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) +
             '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '"/>';
    }
    var rot = 'rotate(' + START + ' ' + CX + ' ' + CY + ')';
    return '<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">' +
      '<circle class="ring__track" cx="60" cy="60" r="' + R + '" transform="' + rot +
        '" stroke-dasharray="' + arc.toFixed(2) + ' ' + circ.toFixed(2) + '"/>' +
      '<circle class="ring__fill" cx="60" cy="60" r="' + R + '" transform="' + rot +
        '" stroke-dasharray="' + fill.toFixed(2) + ' ' + circ.toFixed(2) + '"/>' +
      tick + '</svg>';
  }

  function renderScore (el, key, value, ratio) {
    var name = state.labels.get(key);
    var ref  = value != null && ratio != null && ratio > 0 ? value / ratio : null;
    var aria = name + ': trainee ' + f2(value) +
      (ratio != null ? ', ' + pct(ratio) + ' of reference' : ', no reference yet') +
      (ref != null ? ', reference ' + ref.toFixed(2) : '') + '.';
    el.setAttribute('aria-label', aria);
    el.innerHTML =
      '<h2 class="score__name">' + esc(name) + '</h2>' +
      '<div class="score__body">' +
        '<div class="score__dial">' + ring(value, ref) +
          '<div class="score__value"><span class="score__num">' + (value == null ? 'n/a' : value.toFixed(2)) + '</span>' +
          '<span class="score__cap">Trainee</span></div>' +
        '</div>' +
        '<div class="score__side">' +
          (ratio != null
            ? '<p class="score__ratio">' + pct(ratio) + '</p><p class="score__ratio-cap">of reference</p>'
            : '<p class="score__ratio-cap">No reference yet</p>') +
          (ref != null
            ? '<p class="score__ref"><span class="refkey" aria-hidden="true"></span>Reference ' + ref.toFixed(2) + '</p>' : '') +
        '</div>' +
      '</div>';
  }

  function renderAssist (row) {
    var name = state.labels.get('assistance_index');
    var ai   = n(row.assistance_index);
    var ref  = n(row.reference_assistance_index);
    var el   = $('assist');
    if (ai == null || ref == null) {
      el.innerHTML = '<h2 class="assist__name">' + esc(name) + '</h2>' +
        '<p class="assist__na">' + (ai == null ? 'Not recorded for this session.' : 'No reference yet.') + '</p>';
      return;
    }
    var diff = ai - ref;
    var same = Math.abs(diff) < 0.005;
    var span = Math.max(0.5, Math.abs(diff) * 1.25);
    var x = 50 + Math.max(-50, Math.min(50, (diff / span) * 50));
    var words = same ? 'Same as reference' : diff > 0 ? 'More help than reference' : 'Less help than reference';
    el.setAttribute('aria-label', name + ': ' + signed(same ? 0 : diff) + ' against reference. ' + words +
      '. Trainee ' + ai.toFixed(2) + ', reference ' + ref.toFixed(2) + '.');
    el.innerHTML =
      '<div class="assist__head"><h2 class="assist__name">' + esc(name) + '</h2>' +
        '<p class="assist__diff">' + signed(same ? 0 : diff) + '</p></div>' +
      '<div class="dbar" aria-hidden="true">' +
        '<span class="dbar__mid"></span>' +
        (same ? '' : '<span class="dbar__span" style="left:' + Math.min(50, x) + '%;width:' + Math.abs(x - 50) + '%"></span>') +
        '<span class="dbar__dot" style="left:' + x + '%"></span>' +
      '</div>' +
      '<div class="dbar__scale" aria-hidden="true"><span>Less help</span><span>Reference</span><span>More help</span></div>' +
      '<p class="assist__words">' + words + '. Trainee ' + ai.toFixed(2) + ', reference ' + ref.toFixed(2) + '.</p>';
  }

  function render () {
    var row = state.row;
    renderMeta(row);
    renderVerdict(row);
    renderScore($('scoreObservation'), 'observation', n(row.observation), n(row.observation_ratio));
    renderScore($('scoreAwareness'),   'awareness',   n(row.awareness),   n(row.awareness_ratio));
    renderAssist(row);
    window.BlendTimeline.render($('timeline'), row.per_target, { label: state.labels.get });
    show('content');
  }

  // ------------------------------------------------------------------ load

  function load () {
    show('loading');
    var q = state.client.from('client_scores').select(COLUMNS)
      .eq('session_id', state.sessionId).limit(1);
    if (state.meta.tenant_id) q = q.eq('tenant_id', state.meta.tenant_id);

    return Promise.all([q, L.load(state.client, state.meta.tenant_id)]).then(function (out) {
      var res = out[0];
      state.labels = out[1];
      if (isAuthFailure(res)) return P.end('ended');
      if (res.error) { show('error'); return; }
      if (!res.data || res.data.length === 0) return P.end('ended'); // expired or revoked code
      state.row = res.data[0];
      render();
    }, function () { show('error'); });
  }

  function clock () {
    var d = new Date(state.meta.expires_at);
    $('sessionClock').textContent = 'Session ends ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function init () {
    var m = P.meta();
    if (!m) { window.location.replace('/'); return; }
    if (P.expired(m)) { P.end('ended'); return; }
    state.meta = m;
    state.sessionId = sessionIdFromUrl();

    try { state.client = P.getClient(); }
    catch (_) { show('error'); return; }

    state.client.auth.getSession().then(function (r) {
      if (!r.data || !r.data.session) { P.end('ended'); return; }
      state.client.auth.onAuthStateChange(function (event) {
        if (event === 'SIGNED_OUT') P.end('ended');
      });
      P.watchExpiry();
      clock();
      if (m.role === 'manager' && C.labelsView && window.BlendPortalSettings) {
        $('settingsBtn').hidden = false;
      }
      load();
    }, function () { P.end('ended'); });

    $('signOutBtn').addEventListener('click', function () { P.end('signout'); });
    $('retryBtn').addEventListener('click', load);
  }

  window.BlendPortal = {
    state: state,
    rerender: function () { if (state.row) render(); },
    reloadLabels: function () {
      return L.load(state.client, state.meta.tenant_id).then(function (l) { state.labels = l; if (state.row) render(); });
    }
  };

  init();
})();
