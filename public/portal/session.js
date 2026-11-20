// Portal session helper, shared by the portal login (/portal) and the
// session page (/portal/session).
//
// Login: /portal posts the 5-digit code to the portal-login Edge Function.
// The function checks the code server side and returns a Supabase session
// plus session_hard_expires_at. We hand the tokens to supabase-js and keep
// the hard expiry, tenant and role next to them.
//
// Expiry: at session_hard_expires_at the browser signs out locally and
// returns to /portal with "Your session ended. Enter your code again."
// The database enforces the same limit (scoring.portal_session_ok), so this
// timer is a courtesy, not the control.
(function () {
  'use strict';
  var C = window.BLENDXR_PORTAL_CONFIG || {};
  var META_KEY  = 'bx_portal_meta';
  var ENDED_KEY = 'bx_portal_ended';
  var AUTH_KEY  = 'bx-portal-auth';
  var MAX_TIMER = 2147483000; // setTimeout ceiling
  var client = null;
  var timer  = null;

  function store () { try { return window.localStorage; } catch (_) { return null; } }
  function tab ()   { try { return window.sessionStorage; } catch (_) { return null; } }

  function getClient () {
    if (client) return client;
    if (!window.supabase || !C.supabaseUrl || !C.publishableKey) {
      throw new Error('portal_not_configured');
    }
    client = window.supabase.createClient(C.supabaseUrl, C.publishableKey, {
      auth: {
        persistSession:     true,
        autoRefreshToken:   true,
        detectSessionInUrl: false,
        storageKey:         AUTH_KEY
      }
    });
    return client;
  }

  // POST the code to portal-login. Returns { status, body }. The code is
  // never stored, logged or kept beyond this request.
  function login (code) {
    if (!C.supabaseUrl || !C.publishableKey) {
      return Promise.resolve({ status: 0, body: { error: 'portal_not_configured' } });
    }
    return fetch(C.supabaseUrl + C.loginPath, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': C.publishableKey },
      body:    JSON.stringify({ code: code }),
      credentials: 'omit',
      cache:   'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; })
        .then(function (j) { return { status: r.status, body: j }; });
    });
  }

  function begin (res) {
    var hard = res && res.session_hard_expires_at;
    if (!hard || isNaN(Date.parse(hard))) return Promise.reject(new Error('no_hard_expiry'));
    return getClient().auth.setSession({
      access_token:  res.access_token,
      refresh_token: res.refresh_token
    }).then(function (out) {
      if (out.error || !out.data || !out.data.session) throw out.error || new Error('no_session');
      var s = store();
      if (s) {
        s.setItem(META_KEY, JSON.stringify({
          expires_at: hard,
          tenant_id:  res.tenant_id,
          role:       res.role
        }));
      }
    });
  }

  function meta () {
    var s = store();
    if (!s) return null;
    try {
      var m = JSON.parse(s.getItem(META_KEY) || 'null');
      if (!m || !m.expires_at || isNaN(Date.parse(m.expires_at))) return null;
      return m;
    } catch (_) { return null; }
  }

  function expired (m) { return !m || Date.parse(m.expires_at) <= Date.now(); }

  // End the portal session and go back to /portal. reason 'ended' shows
  // "Your session ended. Enter your code again."; 'signout' shows nothing.
  // scope 'local' revokes only this browser's session: several viewers can
  // share one code (one auth user), so a global sign-out would end theirs.
  var ending = false;
  function end (reason) {
    if (ending) return Promise.resolve();
    ending = true;
    if (timer) { clearTimeout(timer); timer = null; }
    var s = store();
    if (s) s.removeItem(META_KEY);
    var t = tab();
    if (t && reason === 'ended') t.setItem(ENDED_KEY, '1');
    var done = function () {
      if (s) s.removeItem(AUTH_KEY);
      window.location.replace('/portal');
    };
    var p;
    try { p = getClient().auth.signOut({ scope: 'local' }); }
    catch (_) { p = Promise.resolve(); }
    return Promise.race([
      Promise.resolve(p).catch(function () {}),
      new Promise(function (r) { setTimeout(r, 2500); })
    ]).then(done, done);
  }

  // Arm the sign-out timer. Background tabs throttle timers, so also check
  // whenever the tab becomes visible or regains focus.
  function armExpiry () {
    var m = meta();
    if (expired(m)) { end('ended'); return; }
    var ms = Date.parse(m.expires_at) - Date.now();
    if (timer) clearTimeout(timer);
    timer = setTimeout(armExpiry, Math.min(ms, MAX_TIMER));
  }
  function watchExpiry () {
    armExpiry();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') armExpiry();
    });
    window.addEventListener('focus', armExpiry);
  }

  // Login side: read and clear the "session ended" flag.
  function takeEndedFlag () {
    var t = tab();
    if (!t) return false;
    var v = t.getItem(ENDED_KEY);
    t.removeItem(ENDED_KEY);
    return v === '1';
  }

  window.BlendPortalSession = {
    config: C,
    getClient: getClient,
    login: login,
    begin: begin,
    meta: meta,
    expired: expired,
    end: end,
    watchExpiry: watchExpiry,
    takeEndedFlag: takeEndedFlag
  };
})();
