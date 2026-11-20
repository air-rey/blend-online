// Per-target timeline. Stands in the replay slot until replay and the
// heatmap exist. Built so a replay can drive it later: render() returns the
// time scale and a playhead you can move with setPlayhead(ms), and every
// marker carries its time in data-t (ms from session start).
(function () {
  'use strict';

  var ASSIST_STEPS = { none: 0, slow: 1, rapid: 2 };

  function esc (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cap (s) { s = String(s || '').replace(/[_-]+/g, ' ').trim().toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
  function num (v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function secs (ms) {
    var s = ms / 1000;
    return (Math.abs(s) >= 10 ? s.toFixed(0) : s.toFixed(1)) + ' s';
  }

  function normalize (perTarget) {
    var out = [];
    if (!perTarget || typeof perTarget !== 'object') return out;
    Object.keys(perTarget).forEach(function (key) {
      var t = perTarget[key] || {};
      var unlock = num(t.unlocked_ms);
      var ttfl   = num(t.time_to_first_look_ms);
      out.push({
        key:      key,
        observed: t.observed === true,
        tunnel:   t.tunnel_flag === true,
        unlock:   unlock,
        ttfl:     ttfl,
        look:     unlock != null && ttfl != null ? unlock + ttfl : null,
        assist:   typeof t.assist_level === 'string' ? t.assist_level : null,
        totalLook:   num(t.total_look_ms),
        longestLook: num(t.longest_look_ms)
      });
    });
    // Order by unlock time; targets that never unlocked go last.
    out.sort(function (a, b) {
      if (a.unlock == null && b.unlock == null) return a.key < b.key ? -1 : 1;
      if (a.unlock == null) return 1;
      if (b.unlock == null) return -1;
      return a.unlock - b.unlock;
    });
    return out;
  }

  function niceDomain (rows) {
    var max = 0;
    rows.forEach(function (r) {
      if (r.unlock != null) max = Math.max(max, r.unlock);
      if (r.look   != null) max = Math.max(max, r.look);
    });
    var step = max > 60000 ? 10000 : 5000;
    var domain = Math.max(step * 2, Math.ceil((max + 1500) / step) * step);
    return { max: domain, step: step };
  }

  function render (el, perTarget, opts) {
    opts = opts || {};
    // Target names and assist levels are data values, formatted for reading.
    var label = opts.label || cap;
    var rows = normalize(perTarget);

    if (!rows.length) {
      el.innerHTML = '<p class="tl__none">No per-target data in this session.</p>';
      return { scale: function () { return 0; }, setPlayhead: function () {}, domainMs: 0 };
    }

    var d = niceDomain(rows);
    var pct = function (ms) { return Math.max(0, Math.min(100, (ms / d.max) * 100)); };

    var ticks = '';
    for (var t = 0; t <= d.max; t += d.step) {
      // The unit sits on the last tick, right-aligned, so no label spills
      // into the neighbouring columns.
      ticks += '<span class="tl__tick" style="left:' + pct(t) + '%"><span>' + (t / 1000) +
               (t + d.step > d.max ? ' s' : '') + '</span></span>';
    }

    var html = '<div class="tl" role="table" aria-label="Per-target timeline">' +
      '<div class="tl__row tl__row--head" role="row">' +
        '<span class="tl__name" role="columnheader">Target</span>' +
        '<div class="tl__track tl__axis" role="columnheader" aria-label="Seconds from session start">' + ticks + '</div>' +
        '<span class="tl__assist" role="columnheader">Help</span>' +
        '<span class="tl__first" role="columnheader">First look</span>' +
      '</div>';

    rows.forEach(function (r) {
      var name = label(r.key);
      var marks = '';
      if (r.unlock != null) {
        marks += '<span class="tl__unlock" data-t="' + r.unlock + '" style="left:' + pct(r.unlock) + '%"></span>';
      }
      if (r.look != null) {
        marks += '<span class="tl__lat" style="left:' + pct(r.unlock) + '%;width:' + (pct(r.look) - pct(r.unlock)) + '%"></span>';
        // Gap label, centred over the bar. No label when the first look came at unlock.
        if (r.ttfl > 0) {
          marks += '<span class="tl__gap" style="left:' + ((pct(r.unlock) + pct(r.look)) / 2) + '%">' + secs(r.ttfl) + '</span>';
        }
        marks += '<span class="tl__look' + (r.observed ? ' is-observed' : ' is-miss') + (r.tunnel ? ' is-tunnel' : '') +
                 '" data-t="' + r.look + '" style="left:' + pct(r.look) + '%"></span>';
      }

      var step = r.assist && Object.prototype.hasOwnProperty.call(ASSIST_STEPS, r.assist) ? ASSIST_STEPS[r.assist] : 0;
      var assistTxt = r.assist ? cap(r.assist) : 'Not recorded';
      var assist = '<span class="meter" data-level="' + step + '" aria-hidden="true"><i></i><i></i></span>' +
                   '<span>' + esc(assistTxt) + '</span>';

      var first;
      if (r.unlock == null) first = 'Not unlocked';
      else if (r.ttfl == null) first = 'No look';
      else first = '+' + secs(r.ttfl);

      var summary = name + '. ' +
        (r.unlock != null ? 'Unlocked at ' + secs(r.unlock) + '. ' : 'Not unlocked. ') +
        (r.ttfl != null ? 'First look ' + secs(r.ttfl) + ' after unlock. ' : 'No first look. ') +
        (r.observed ? 'Observed. ' : 'Not observed. ') +
        'Help: ' + assistTxt + '.' + (r.tunnel ? ' Tunnel flag.' : '');

      var dwell = [];
      if (r.totalLook != null)   dwell.push('looked ' + secs(r.totalLook));
      if (r.longestLook != null) dwell.push('longest ' + secs(r.longestLook));

      html += '<div class="tl__row' + (r.tunnel ? ' is-tunnel' : '') + '" role="row" aria-label="' + esc(summary) + '">' +
        '<span class="tl__name" role="cell">' +
          '<strong>' + esc(name) + '</strong>' +
          '<span class="tl__status">' + (r.observed ? 'Observed' : 'Not observed') +
            (r.tunnel ? ' <em class="flag">Tunnel</em>' : '') + '</span>' +
          (dwell.length ? '<span class="tl__dwell">' + dwell.map(function (d) { return '<span>' + esc(d) + '</span>'; }).join(', ') + '</span>' : '') +
        '</span>' +
        '<div class="tl__track" role="cell">' + marks + '</div>' +
        '<span class="tl__assist" role="cell">' + assist + '</span>' +
        '<span class="tl__first" role="cell">' + esc(first) + '</span>' +
      '</div>';
    });

    html += '<div class="tl__playhead-layer" aria-hidden="true"><span></span><span class="tl__phcol"><span class="tl__playhead" hidden></span></span></div></div>';
    el.innerHTML = html;

    var layer = el.querySelector('.tl__playhead-layer');
    var head  = el.querySelector('.tl__playhead');
    return {
      domainMs: d.max,
      scale: pct,
      rows: rows,
      // Replay hook: move a playhead across every track. null hides it.
      setPlayhead: function (ms) {
        if (ms == null) { head.hidden = true; return; }
        head.hidden = false;
        layer.style.setProperty('--x', pct(ms) + '%');
      }
    };
  }

  window.BlendTimeline = { render: render, normalize: normalize };
})();
