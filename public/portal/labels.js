// Display names, read only from public.client_labels
// (tenant_id, key, label, updated_at). No label words are hard-coded here.
//
// Writes go only through public.set_tenant_label / public.reset_tenant_label,
// which allow managers only in the database.
//
// A key missing from the view shows as its raw key, so a gap is visible
// rather than papered over. Verdict keys are the upper-case keys.
(function () {
  'use strict';

  function has (o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isVerdictKey (key) { return /^[A-Z][A-Z0-9_]*$/.test(key); }

  function make (rows) {
    var map = {};
    var order = [];
    (rows || []).forEach(function (r) {
      if (r && typeof r.key === 'string' && typeof r.label === 'string' && r.label.trim()) {
        if (!has(map, r.key)) order.push(r.key);
        map[r.key] = { label: r.label.trim(), updated_at: r.updated_at || null };
      }
    });
    return {
      get: function (key) { return has(map, key) ? map[key].label : String(key); },
      has: function (key) { return has(map, key); },
      metricKeys:  function () { return order.filter(function (k) { return !isVerdictKey(k); }); },
      verdictKeys: function () { return order.filter(isVerdictKey); },
      isVerdictKey: isVerdictKey
    };
  }

  // Resolves { labels } or { error, status } so the page can tell an ended
  // session from a network failure.
  function load (client, tenantId) {
    var q = client.from('client_labels').select('key,label,updated_at').order('key');
    if (tenantId) q = q.eq('tenant_id', tenantId);
    return q.then(function (res) {
      if (res.error) return { error: res.error, status: res.status };
      return { labels: make(res.data || []), count: (res.data || []).length };
    }, function (e) { return { error: e || {}, status: 0 }; });
  }

  function set (client, tenantId, key, label) {
    return client.rpc('set_tenant_label', { p_tenant_id: tenantId, p_key: key, p_label: label });
  }
  function reset (client, tenantId, key) {
    return client.rpc('reset_tenant_label', { p_tenant_id: tenantId, p_key: key });
  }

  window.BlendPortalLabels = { make: make, load: load, set: set, reset: reset, isVerdictKey: isVerdictKey };
})();
