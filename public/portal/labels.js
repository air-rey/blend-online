// Display names.
//
// Read: public.client_labels (tenant_id, key, label, updated_at), 9 keys:
// observation, awareness, assistance_index and the six verdict codes.
// Write: public.set_tenant_label / public.reset_tenant_label only. Both are
// manager-only in the database; the UI hides Settings for other roles but
// the database is the control.
//
// The fallbacks below are used only when a key is missing from the view.
// Verdict labels count as placeholders (pending safety manager review)
// while they still read as one of the known default texts.
(function () {
  'use strict';

  var METRIC_KEYS  = ['observation', 'awareness', 'assistance_index'];
  var VERDICT_KEYS = ['SAFE_ASSISTED', 'EXPERT', 'NOT_SAFE', 'ALARM', 'UNSCORABLE', 'NO_BASELINE'];

  var FALLBACK = {
    observation:      'Observation',
    awareness:        'Awareness',
    assistance_index: 'Assistance index',
    SAFE_ASSISTED:    'Completed with assistance',
    EXPERT:           'At reference level',
    NOT_SAFE:         'Needs review',
    ALARM:            'Alarm reached',
    UNSCORABLE:       'Not scorable',
    NO_BASELINE:      'No reference yet',
    // Not tenant-editable; timeline wording only.
    assist_none:      'None',
    assist_slow:      'Slow',
    assist_rapid:     'Rapid'
  };

  // Default verdict texts known today: the neutral fallbacks above plus the
  // server defaults in scoring.label_defaults, which reset writes back.
  var PLACEHOLDER_TEXT = {
    SAFE_ASSISTED: ['Completed with assistance', 'Safe (assisted)'],
    EXPERT:        ['At reference level', 'Expert'],
    NOT_SAFE:      ['Needs review', 'Not safe'],
    ALARM:         ['Alarm reached', 'Alarm triggered'],
    UNSCORABLE:    ['Not scorable', 'Unscorable'],
    NO_BASELINE:   ['No reference yet', 'No expert baseline yet']
  };

  function has (o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function humanize (key) {
    var s = String(key || '').replace(/[_-]+/g, ' ').trim().toLowerCase();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  function make (rows) {
    var map = {};
    (rows || []).forEach(function (r) {
      if (r && typeof r.key === 'string' && typeof r.label === 'string' && r.label.trim()) {
        map[r.key] = { label: r.label.trim(), updated_at: r.updated_at || null };
      }
    });
    function get (key) {
      if (has(map, key)) return map[key].label;
      if (has(FALLBACK, key)) return FALLBACK[key];
      return humanize(key);
    }
    return {
      get: get,
      fromTenant: function (key) { return has(map, key); },
      isPlaceholder: function (key) {
        if (!has(PLACEHOLDER_TEXT, key)) return false;
        return PLACEHOLDER_TEXT[key].indexOf(get(key)) !== -1;
      },
      rows: map
    };
  }

  // Never blocks the page: any failure falls back.
  function load (client, tenantId) {
    var view = (window.BLENDXR_PORTAL_CONFIG || {}).labelsView;
    if (!view || !client) return Promise.resolve(make([]));
    var q = client.from(view).select('key,label,updated_at');
    if (tenantId) q = q.eq('tenant_id', tenantId);
    return q.then(function (res) {
      return make(res.error || !Array.isArray(res.data) ? [] : res.data);
    }, function () { return make([]); });
  }

  function set (client, tenantId, key, label) {
    return client.rpc('set_tenant_label', { p_tenant_id: tenantId, p_key: key, p_label: label });
  }
  function reset (client, tenantId, key) {
    return client.rpc('reset_tenant_label', { p_tenant_id: tenantId, p_key: key });
  }

  window.BlendPortalLabels = {
    METRIC_KEYS: METRIC_KEYS, VERDICT_KEYS: VERDICT_KEYS, FALLBACK: FALLBACK,
    humanize: humanize, make: make, load: load, set: set, reset: reset
  };
})();
