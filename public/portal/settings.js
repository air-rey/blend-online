// Settings: rename metric and verdict labels for the tenant (manager only).
// Writes go only through public.set_tenant_label and public.reset_tenant_label,
// which enforce manager-only in the database. Hiding the button for other
// roles is a convenience, not the control.
(function () {
  'use strict';
  var L = window.BlendPortalLabels;
  var MAX = 60;

  function esc (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var sheet, opener, lastFocus;

  function field (key, labels) {
    return '<div class="field" data-key="' + esc(key) + '">' +
      '<div class="field__top">' +
        '<label class="field__key" for="lbl-' + esc(key) + '">' + esc(key) + '</label>' +
      '</div>' +
      '<div class="field__row">' +
        '<input id="lbl-' + esc(key) + '" type="text" maxlength="' + MAX + '" autocomplete="off" spellcheck="true" value="' + esc(labels.get(key)) + '">' +
        '<button class="btn btn--solid" type="button" data-act="save">Save</button>' +
        '<button class="btn btn--ghost" type="button" data-act="reset">Reset</button>' +
      '</div>' +
      '<p class="field__msg" aria-live="polite"></p>' +
    '</div>';
  }

  function render () {
    var labels = window.BlendPortal.state.labels;
    sheet.innerHTML =
      '<div class="sheet__panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">' +
        '<div class="sheet__head">' +
          '<h2 class="sheet__title" id="settingsTitle">Settings</h2>' +
          '<button class="btn btn--ghost" type="button" data-act="close">Close</button>' +
        '</div>' +
        '<p class="sheet__intro">Rename what your team sees. Changes apply to everyone in your organization. Reset restores the default.</p>' +
        '<section class="sheet__group">' +
          '<h3 class="sheet__group-title">Metric names</h3>' +
          labels.metricKeys().map(function (k) { return field(k, labels); }).join('') +
        '</section>' +
        '<section class="sheet__group">' +
          '<h3 class="sheet__group-title">Verdict labels</h3>' +
          '<p class="sheet__group-note">Verdict bands are placeholders pending safety manager review.</p>' +
          labels.verdictKeys().map(function (k) { return field(k, labels); }).join('') +
        '</section>' +
      '</div>';
  }

  function setMsg (row, text, err) {
    var m = row.querySelector('.field__msg');
    m.textContent = text;
    m.classList.toggle('is-err', !!err);
  }

  function handle (res, row) {
    var P = window.BlendPortalSession;
    if (res.status === 401 || (res.error && /jwt/i.test(res.error.message || ''))) { P.end('ended'); return false; }
    if (res.error) {
      setMsg(row, res.error.code === '42501' ? 'Only a manager can change labels.' : 'Could not save. Try again.', true);
      return false;
    }
    var out = Array.isArray(res.data) ? res.data[0] : res.data;
    if (out && typeof out.label === 'string') row.querySelector('input').value = out.label;
    return true;
  }

  function act (btn) {
    var row = btn.closest('.field');
    if (!row) return;
    var key = row.getAttribute('data-key');
    var input = row.querySelector('input');
    var st = window.BlendPortal.state;
    var buttons = row.querySelectorAll('button');
    var p;

    if (btn.getAttribute('data-act') === 'save') {
      var v = input.value.trim();
      if (!v) { setMsg(row, 'Enter a name, or use Reset.', true); input.focus(); return; }
      if (v.length > MAX) { setMsg(row, 'Keep it under ' + MAX + ' characters.', true); return; }
      p = L.set(st.client, st.meta.tenant_id, key, v);
    } else {
      p = L.reset(st.client, st.meta.tenant_id, key);
    }

    buttons.forEach(function (b) { b.disabled = true; });
    setMsg(row, 'Saving.', false);
    Promise.resolve(p).then(function (res) {
      buttons.forEach(function (b) { b.disabled = false; });
      if (!handle(res, row)) return;
      return window.BlendPortal.reloadLabels().then(function () {
        setMsg(row, btn.getAttribute('data-act') === 'save' ? 'Saved.' : 'Reset to default.', false);
      });
    }, function () {
      buttons.forEach(function (b) { b.disabled = false; });
      setMsg(row, 'Could not save. Try again.', true);
    });
  }

  function open () {
    lastFocus = document.activeElement;
    render();
    sheet.hidden = false;
    var first = sheet.querySelector('input');
    if (first) first.focus();
  }
  function close () {
    sheet.hidden = true;
    sheet.innerHTML = '';
    (lastFocus || opener).focus();
  }

  function init () {
    sheet  = document.getElementById('settings');
    opener = document.getElementById('settingsBtn');
    opener.addEventListener('click', open);
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet) { close(); return; }
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      if (btn.getAttribute('data-act') === 'close') close(); else act(btn);
    });
    sheet.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Enter' && e.target.matches('input')) {
        act(e.target.closest('.field').querySelector('[data-act="save"]'));
      }
      if (e.key === 'Tab') { // keep focus inside the dialog
        var f = sheet.querySelectorAll('input, button:not([disabled])');
        if (!f.length) return;
        var a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
  }

  window.BlendPortalSettings = { open: open, close: close };
  init();
})();
