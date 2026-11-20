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
  // Formats a data value (not a label), e.g. 'ladder' -> 'Ladder'.
  function cap (s) { s = String(s || '').replace(/[_-]+/g, ' ').trim().toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }

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

  // "Help needed: same as reference" (or more / less), from the assistance
  // index against the reference assistance index.
  function helpLine (row) {
    var ai = n(row.assistance_index), ref = n(row.reference_assistance_index);
    if (ai == null) return '';
    var words = ref == null ? 'no reference yet'
      : Math.abs(ai - ref) < 0.005 ? 'same as reference'
      : ai > ref ? 'more than reference' : 'less than reference';
    return '<p class="verdict__help">Help needed: ' + words + '</p>';
  }

  function renderVerdict (row) {
    var code  = row.verdict_code || 'UNSCORABLE';
    var label = state.labels.get(code);
    var ratio = n(row.verdict_ratio);
    var obsR = n(row.observation_ratio), awR = n(row.awareness_ratio);
    var both = [];
    if (obsR != null) both.push(state.labels.get('observation') + ' ' + pct(obsR));
    if (awR  != null) both.push(state.labels.get('awareness') + ' ' + pct(awR));
    var bar = ratio == null
      ? (both.length ? '<span class="verdict__ratios">' + esc(both.join(', ')) + '</span>'
                     : '<span class="verdict__na">Not available</span>')
      : '<span class="vbar" aria-hidden="true"><i style="width:' + Math.min(100, ratio * 100) + '%"></i></span>' +
        '<span class="verdict__num">' + pct(ratio) + '</span>';
    $('verdict').innerHTML =
      '<p class="verdict__eyebrow">Verdict</p>' +
      '<p class="verdict__label" id="verdictLabel">' + esc(label) + '</p>' +
      '<dl class="verdict__facts">' +
        '<div><dt>Ending</dt><dd>' + esc(row.ending ? cap(row.ending) : 'Not recorded') + '</dd></div>' +
        '<div class="verdict__ratio"><dt>Against reference</dt><dd>' + bar + '</dd></div>' +
      '</dl>' + helpLine(row);
  }

  // Full ring = the reference. The arc is the trainee's share of the
  // reference, so it matches the percentage. Capped at 100% for now.
  function ring (ratio) {
    var R = 48, circ = 2 * Math.PI * R;
    var fill = ratio == null ? 0 : Math.max(0, Math.min(1, ratio)) * circ;
    return '<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">' +
      '<circle class="ring__track" cx="60" cy="60" r="' + R + '"/>' +
      '<circle class="ring__fill" cx="60" cy="60" r="' + R + '" transform="rotate(-90 60 60)"' +
        ' stroke-dasharray="' + fill.toFixed(2) + ' ' + circ.toFixed(2) + '"/>' +
      '</svg>';
  }

  function renderScore (el, key, value, ratio) {
    var name = state.labels.get(key);
    var ref  = value != null && ratio != null && ratio > 0 ? value / ratio : null;
    el.setAttribute('aria-label', name + ': ' +
      (ratio != null ? pct(ratio) + ' of reference' : 'no reference yet') +
      '. Trainee ' + f2(value) + (ref != null ? ', reference ' + ref.toFixed(2) : '') + '.');
    el.innerHTML =
      '<div class="score__dial">' + ring(ratio) +
        '<div class="score__value">' +
          '<span class="score__num' + (ratio != null && ratio >= 0.995 ? ' score__num--long' : '') + '">' + (ratio != null ? pct(ratio) : 'n/a') + '</span>' +
          '<span class="score__cap">' + (ratio != null ? 'of reference' : 'No reference yet') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="score__side">' +
        '<h2 class="score__name">' + esc(name) + '</h2>' +
        '<p class="score__abs">Trainee ' + f2(value) + '</p>' +
        (ref != null ? '<p class="score__abs">Reference ' + ref.toFixed(2) + '</p>' : '') +
      '</div>';
  }

  function render () {
    var row = state.row;
    renderMeta(row);
    renderVerdict(row);
    renderScore($('scoreObservation'), 'observation', n(row.observation), n(row.observation_ratio));
    renderScore($('scoreAwareness'),   'awareness',   n(row.awareness),   n(row.awareness_ratio));
    window.BlendTimeline.render($('timeline'), row.per_target);
    show('content');
  }

  // ------------------------------------------------------- session switcher
  // Lists the tenant's sessions from client_scores; the URL parameter
  // ?session= decides which one is shown.
  function loadSessions () {
    var q = state.client.from('client_scores')
      .select('session_id,trainee_id,trainee_display_name,verdict_code,start_time_utc')
      .order('start_time_utc', { ascending: true }).order('session_id', { ascending: true });
    if (state.meta.tenant_id) q = q.eq('tenant_id', state.meta.tenant_id);
    return q.then(function (res) { return res; }, function (e) { return { error: e || {} }; });
  }

  function renderSwitcher (res) {
    var wrap = $('switchWrap'), sel = $('sessionSwitch');
    if (!res || res.error || !Array.isArray(res.data) || res.data.length < 2) { wrap.hidden = true; return; }
    sel.innerHTML = res.data.map(function (r) {
      var who = r.trainee_display_name || r.trainee_id;
      var verdict = r.verdict_code ? state.labels.get(r.verdict_code) : 'No verdict';
      return '<option value="' + esc(r.session_id) + '"' + (r.session_id === state.sessionId ? ' selected' : '') + '>' +
        esc(who + ' / ' + verdict) + '</option>';
    }).join('');
    wrap.hidden = false;
  }

  // ------------------------------------------------------------------ load

  function load () {
    show('loading');
    var q = state.client.from('client_scores').select(COLUMNS)
      .eq('session_id', state.sessionId).limit(1);
    if (state.meta.tenant_id) q = q.eq('tenant_id', state.meta.tenant_id);

    return Promise.all([q, L.load(state.client, state.meta.tenant_id), loadSessions()]).then(function (out) {
      var res = out[0], lab = out[1], list = out[2];
      if (isAuthFailure(res) || isAuthFailure(lab) || isAuthFailure(list)) return P.end('ended');
      if (res.error || lab.error) { show('error'); return; }
      state.labels = lab.labels;
      renderSwitcher(list);
      if (!res.data || res.data.length === 0) return P.end('ended'); // expired or revoked code
      state.row = res.data[0];
      render();
    }, function () { show('error'); });
  }

  function clock () {
    var d = new Date(state.meta.expires_at);
    $('sessionClock').textContent = 'Session ends ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  }

  function init () {
    var m = P.meta();
    if (!m) { window.location.replace('/portal'); return; }
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
      if (m.role === 'manager' && window.BlendPortalSettings) {
        $('settingsBtn').hidden = false;
      }
      load();
    }, function () { P.end('ended'); });

    $('signOutBtn').addEventListener('click', function () { P.end('signout'); });
    $('sessionSwitch').addEventListener('change', function (e) {
      var id = e.target.value;
      if (id && id !== state.sessionId) window.location.assign('/portal/session?session=' + encodeURIComponent(id));
    });
    $('retryBtn').addEventListener('click', load);
  }

  window.BlendPortal = {
    state: state,
    rerender: function () { if (state.row) render(); },
    reloadLabels: function () {
      return L.load(state.client, state.meta.tenant_id).then(function (lab) {
        if (isAuthFailure(lab)) { P.end('ended'); return; }
        if (!lab.error) { state.labels = lab.labels; if (state.row) render(); }
      });
    }
  };

  init();
})();
