// Portal login. Calls only the portal-login Edge Function; the code is
// checked there, never in the browser, and is not stored anywhere.
(function () {
  'use strict';
  var P      = window.BlendPortalSession;
  var form   = document.getElementById('portalForm');
  var codeIn = document.getElementById('portalCode');
  var submit = document.getElementById('portalSubmit');
  var msg    = document.getElementById('portalMsg');

  function setMsg (text, err) {
    msg.textContent = text || '';
    msg.classList.toggle('is-err', !!err);
  }

  if (P.takeEndedFlag()) setMsg('Your session ended. Enter your code again.', true);

  // Already signed in with time left: go straight to the session page.
  var m = P.meta();
  if (m && !P.expired(m)) {
    try {
      P.getClient().auth.getSession().then(function (r) {
        if (r.data && r.data.session) window.location.replace('/portal/session');
      });
    } catch (_) {}
  }

  setTimeout(function () { try { codeIn.focus(); } catch (_) {} }, 180);
  codeIn.addEventListener('input', function () {
    codeIn.value = codeIn.value.replace(/\D+/g, '').slice(0, 5);
    if (codeIn.value.length === 5) submit.focus();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = (codeIn.value || '').trim();
    if (!/^\d{5}$/.test(code)) {
      setMsg('Enter your 5-digit code.', true);
      codeIn.focus();
      return;
    }
    submit.disabled = true; setMsg('');

    P.login(code).then(function (res) {
      if (res.status === 200 && res.body && res.body.access_token) {
        return P.begin(res.body).then(function () {
          window.location.replace('/portal/session');
        });
      }
      submit.disabled = false;
      // Only the function's own answer means a wrong code. A gateway 401
      // (bad API key) is a configuration fault, not the visitor's code.
      if (res.status === 401 && res.body && res.body.error === 'invalid_code') {
        setMsg('Not quite. Try again.', true); codeIn.select(); return;
      }
      if (res.status === 429) { setMsg('Too many attempts. Try again in 15 minutes.', true); return; }
      setMsg('Something went wrong. Try again.', true);
    }).catch(function () {
      submit.disabled = false;
      setMsg('Something went wrong. Try again.', true);
    });
  });
})();
