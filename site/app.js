/* Iron Compare
   Reads data/iron-sets.json and builds a comparison of any two sets in it.
   Nothing here knows about a particular brand or model: all values, labels,
   wording and photo paths come from the data file. */

(function () {
  'use strict';

  var DASH = '—';
  var app = document.getElementById('app');
  var data = null;
  var state = { a: null, b: null, group: {} };

  /* ---------- small helpers ---------- */

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(node, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(node, k); }); return; }
    node.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }

  function setById(id) {
    for (var i = 0; i < data.sets.length; i++) if (data.sets[i].id === id) return data.sets[i];
    return null;
  }

  function fullName(set) { return set.brand + ' ' + set.name; }
  function shortName(set) { return set.shortName || set.brand; }

  function clubName(club) {
    return /^\d+$/.test(club) ? club + ' iron' : club;
  }

  function clubIndex(club) {
    var i = data.clubOrder.indexOf(club);
    return i === -1 ? 999 : i;
  }

  function findClub(set, club) {
    for (var i = 0; i < set.clubs.length; i++) if (set.clubs[i].club === club) return set.clubs[i];
    return null;
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function fmtNum(v, field) {
    var s = v.toFixed(field.decimals == null ? 1 : field.decimals);
    if (!field.fixed && s.indexOf('.') !== -1) s = s.replace(/\.?0+$/, '');
    return s;
  }

  function fmtValue(v, field) {
    if (v == null || v === '') return DASH;
    if (field.type === 'number' && isNum(v)) return fmtNum(v, field) + (field.unit || '');
    return String(v);
  }

  function roundTo(v, decimals) {
    var m = Math.pow(10, decimals);
    return Math.round(v * m) / m;
  }

  /* Swing weight "D2", "D2.0", "E4" to points on one scale (A0 = 0, ten per letter). */
  function swingPoints(v) {
    var m = /^\s*([A-G])\s*(\d+(?:\.\d+)?)\s*$/i.exec(String(v));
    if (!m) return null;
    return (m[1].toUpperCase().charCodeAt(0) - 65) * 10 + parseFloat(m[2]);
  }

  /* Signed difference B minus A for one field, or null if it cannot be worked out. */
  function numericDiff(va, vb, field) {
    if (field.type === 'number') {
      if (!isNum(va) || !isNum(vb)) return null;
      return roundTo(vb - va, field.decimals == null ? 1 : field.decimals);
    }
    if (field.type === 'swingweight') {
      var pa = swingPoints(va), pb = swingPoints(vb);
      if (pa == null || pb == null) return null;
      return roundTo(pb - pa, 1);
    }
    return null;
  }

  function diffAmount(d, field) {
    var abs = Math.abs(d);
    if (field.type === 'swingweight') {
      var n = String(roundTo(abs, 1));
      return n + (abs === 1 ? ' pt' : ' pts');
    }
    return fmtNum(abs, field) + (field.diffUnit || field.unit || '');
  }

  /* How set B differs from set A for one value.
     kind: 'diff' | 'same' | 'none' (nothing to compare). */
  function describeDiff(va, vb, field) {
    if (va == null || vb == null || va === '' || vb === '') return { kind: 'none' };
    if (field.type === 'text') {
      return String(va).trim().toLowerCase() === String(vb).trim().toLowerCase()
        ? { kind: 'same', text: 'Same' } : { kind: 'diff', text: 'Different' };
    }
    var d = numericDiff(va, vb, field);
    if (d == null) return { kind: 'none' };
    if (d === 0) return { kind: 'same', text: 'Same' };
    return { kind: 'diff', text: diffAmount(d, field) + ' ' + (d < 0 ? field.lower : field.higher) };
  }

  function chip(diff) {
    if (diff.kind === 'none') return null;
    return el('span', { class: 'chip ' + (diff.kind === 'same' ? 'chip-same' : 'chip-diff'), text: diff.text });
  }

  function clubTags(entry, set, side) {
    if (!entry) return null;
    var bits = [];
    if (entry.head) bits.push(entry.head);
    if (entry.stamp) bits.push('stamped ' + entry.stamp);
    if (entry.label && entry.label !== entry.club) bits.push('listed as ' + entry.label);
    if (!bits.length) return null;
    return el('span', { class: 'tag tag-' + side, text: bits.join(' · ') });
  }

  /* ---------- sections ---------- */

  function heroCard(set, side) {
    var group = currentGroup(set);
    var photo = group && (group.photos.back || group.photos.address || firstPhoto(group));
    var lofts = set.clubs.map(function (c) { return c.specs.loft; }).filter(isNum);
    var loftField = fieldByKey('loft');
    var facts = [];
    if (set.clubs.length) {
      facts.push(set.clubs.length + ' clubs: ' + clubName(set.clubs[0].club).replace(' iron', '') +
        '–' + set.clubs[set.clubs.length - 1].club);
    }
    if (lofts.length && loftField) {
      facts.push('Lofts ' + fmtValue(Math.min.apply(null, lofts), loftField) + ' to ' +
        fmtValue(Math.max.apply(null, lofts), loftField));
    }
    if (set.details && set.details.shaft) facts.push(set.details.shaft);

    return el('article', { class: 'hero-card side-' + side },
      el('div', { class: 'hero-text' },
        el('p', { class: 'eyebrow' }, el('span', { class: 'dot' }), 'Set ' + side.toUpperCase() + ' · ' + set.brand),
        el('h2', { class: 'hero-name', text: set.name }),
        set.tagline ? el('p', { class: 'hero-tag', text: set.tagline }) : null,
        el('ul', { class: 'facts' }, facts.map(function (f) { return el('li', { text: f }); }))
      ),
      photo
        ? el('div', { class: 'hero-photo' },
            el('img', { src: photo.file, alt: fullName(set) + (group.label ? ' (' + group.label + ')' : '') + ', manufacturer photo', width: 600, height: 600 }))
        : el('div', { class: 'hero-photo empty-slot' }, el('span', { text: 'No real photo found' }))
    );
  }

  function firstPhoto(group) {
    var keys = Object.keys(group.photos);
    for (var i = 0; i < keys.length; i++) if (group.photos[keys[i]]) return group.photos[keys[i]];
    return null;
  }

  function currentGroup(set) {
    var groups = set.photoGroups || [];
    if (!groups.length) return null;
    return groups[state.group[set.id] || 0] || groups[0];
  }

  function fieldByKey(key) {
    for (var i = 0; i < data.specFields.length; i++) if (data.specFields[i].key === key) return data.specFields[i];
    return null;
  }

  function unionClubs(A, B) {
    var seen = {};
    var out = [];
    A.clubs.concat(B.clubs).forEach(function (c) {
      if (!seen[c.club]) { seen[c.club] = true; out.push(c.club); }
    });
    out.sort(function (x, y) { return clubIndex(x) - clubIndex(y); });
    return out;
  }

  function sharedClubs(A, B) {
    return unionClubs(A, B).filter(function (c) { return findClub(A, c) && findClub(B, c); });
  }

  function rangeLabel(clubs) {
    if (!clubs.length) return '';
    if (clubs.length === 1) return clubs[0];
    return clubs[0] + '–' + clubs[clubs.length - 1];
  }

  /* Headline differences, worked out from the data for whichever two sets are picked. */
  function glance(A, B) {
    var shared = sharedClubs(A, B);
    var cards = [];
    var blocked = [];

    data.specFields.forEach(function (field) {
      if (field.type === 'text') return;
      var diffs = [];
      var anyValue = false;
      shared.forEach(function (c) {
        var va = findClub(A, c).specs[field.key], vb = findClub(B, c).specs[field.key];
        if (va != null || vb != null) anyValue = true;
        var d = numericDiff(va, vb, field);
        if (d != null) diffs.push(d);
      });
      if (!diffs.length) { if (anyValue) blocked.push(field.label.toLowerCase()); return; }

      var min = Math.min.apply(null, diffs), max = Math.max.apply(null, diffs);
      var headline, sub;
      var n = diffs.length;
      var where = n === shared.length
        ? 'in all ' + n + ' shared clubs (' + rangeLabel(shared) + ')'
        : 'in the ' + n + ' shared clubs that have a number for both';
      if (min === 0 && max === 0) {
        headline = 'Same';
        sub = where;
      } else if (max <= 0 || min >= 0) {
        var word = max <= 0 ? field.lower : field.higher;
        var lo = Math.min(Math.abs(min), Math.abs(max)), hi = Math.max(Math.abs(min), Math.abs(max));
        var amount = lo === hi ? diffAmount(hi, field)
          : (lo === 0 ? 'up to ' + diffAmount(hi, field)
            : diffAmountBare(lo, field) + '–' + diffAmount(hi, field));
        headline = amount + ' ' + word;
        sub = shortName(B) + ' vs ' + shortName(A) + ', ' + where;
      } else {
        headline = 'Within ' + diffAmount(Math.max(Math.abs(min), Math.abs(max)), field);
        sub = 'from ' + diffAmount(min, field) + ' ' + field.lower + ' to ' + diffAmount(max, field) + ' ' + field.higher + ', ' + where;
      }
      cards.push(el('div', { class: 'glance-card' },
        el('p', { class: 'glance-label', text: field.label }),
        el('p', { class: 'glance-head', text: headline }),
        el('p', { class: 'glance-sub', text: sub })
      ));
    });

    return el('section', { class: 'block', id: 'glance' },
      el('h2', { class: 'block-title', text: 'At a glance' }),
      el('p', { class: 'block-lede', text: 'How the ' + fullName(B) + ' differs from the ' + fullName(A) + '.' }),
      cards.length ? el('div', { class: 'glance-grid' }, cards) : null,
      blocked.length
        ? el('p', { class: 'callout' },
            el('strong', { text: 'Can’t be compared yet: ' }),
            blocked.join(', ') + '. One of the sets has no number for ' +
            (blocked.length === 1 ? 'it' : 'these') + '. See Missing data below.')
        : null
    );
  }

  function diffAmountBare(d, field) {
    if (field.type === 'swingweight') return String(roundTo(Math.abs(d), 1));
    return fmtNum(Math.abs(d), field) + (field.unit === '°' ? '°' : '');
  }

  /* Loft ladder: every club of both sets placed on one degree scale. */
  function ladder(A, B) {
    var field = fieldByKey('loft');
    if (!field) return null;
    var all = [];
    [A, B].forEach(function (s) { s.clubs.forEach(function (c) { if (isNum(c.specs.loft)) all.push(c.specs.loft); }); });
    if (all.length < 2) return null;
    var lo = Math.floor(Math.min.apply(null, all)) - 1;
    var hi = Math.ceil(Math.max.apply(null, all)) + 1;
    var pos = function (v) { return ((v - lo) / (hi - lo) * 100).toFixed(2) + '%'; };

    function track(set, side) {
      return el('div', { class: 'ladder-row' },
        el('div', { class: 'ladder-name side-' + side }, el('span', { class: 'dot' }), shortName(set)),
        el('div', { class: 'ladder-track' },
          set.clubs.filter(function (c) { return isNum(c.specs.loft); }).map(function (c) {
            return el('span', {
              class: 'ladder-dot side-' + side,
              style: 'left:' + pos(c.specs.loft),
              title: clubName(c.club) + ': ' + fmtValue(c.specs.loft, field),
              'aria-label': shortName(set) + ' ' + clubName(c.club) + ' ' + fmtValue(c.specs.loft, field)
            }, c.club === 'PW' ? 'P' : c.club);
          })
        )
      );
    }

    var ticks = [];
    var step = (hi - lo) > 24 ? 4 : 2;
    for (var t = Math.ceil(lo / step) * step; t <= hi; t += step) {
      ticks.push(el('span', { class: 'ladder-tick', style: 'left:' + pos(t), text: t + '°' }));
    }

    return el('section', { class: 'block', id: 'lofts' },
      el('h2', { class: 'block-title', text: 'Loft ladder' }),
      el('p', { class: 'block-lede', text: 'Every club placed by its loft on one scale. Further left is stronger. Clubs that line up vertically play to about the same loft, whatever number is stamped on them.' }),
      el('div', { class: 'ladder' },
        track(A, 'a'),
        track(B, 'b'),
        el('div', { class: 'ladder-row ladder-axis' },
          el('div', { class: 'ladder-name' }),
          el('div', { class: 'ladder-track ladder-ticks' }, ticks))
      )
    );
  }

  /* The source a value came from, when it is not the set's main source. */
  function sourceOf(set, entry, key) {
    var id = entry && entry.from && entry.from[key];
    if (!id) return null;
    for (var i = 0; i < (set.sources || []).length; i++) if (set.sources[i].id === id) return set.sources[i];
    return null;
  }

  function valueCell(entry, field, side, set) {
    if (!entry) return el('span', { class: 'v v-' + side + ' v-absent', title: 'Not in this set', text: DASH });
    var v = entry.specs[field.key];
    var missing = v == null || v === '';
    var src = missing ? null : sourceOf(set, entry, field.key);
    return el('span', { class: 'v v-' + side + (missing ? ' v-missing' : ''), title: missing ? 'Not given by the source' : (src ? src.label : null) },
      fmtValue(v, field),
      src && src.mark ? el('sup', { class: 'mark', text: src.mark }) : null);
  }

  /* One line per marked source that is actually used by a value on show. */
  function markLegend(sets) {
    var lines = [], seen = {};
    sets.forEach(function (set) {
      set.clubs.forEach(function (c) {
        Object.keys(c.from || {}).forEach(function (key) {
          var src = sourceOf(set, c, key);
          if (!src || !src.mark) return;
          var id = set.id + '|' + src.mark + '|' + (src.markNote || src.label);
          if (seen[id]) return;
          seen[id] = true;
          lines.push(el('p', { class: 'block-note mark-note' },
            el('span', { class: 'mark', text: src.mark }), ' ' + shortName(set) + ': ' + (src.markNote || src.label)));
        });
      });
    });
    return lines;
  }

  function clubHeaderBits(club, ea, eb, A, B) {
    var only = !ea ? shortName(B) + ' only' : (!eb ? shortName(A) + ' only' : null);
    return [
      el('span', { class: 'club-name', text: clubName(club) }),
      el('span', { class: 'club-tags' },
        clubTags(ea, A, 'a'), clubTags(eb, B, 'b'),
        only ? el('span', { class: 'tag tag-only', text: only }) : null)
    ];
  }

  /* Wide screens: one row per club, one column per spec. */
  function matrixTable(A, B) {
    var clubs = unionClubs(A, B);
    var head = el('tr', null, el('th', { scope: 'col', class: 'col-club', text: 'Club' }),
      data.specFields.map(function (f) { return el('th', { scope: 'col', text: f.label }); }));
    var rows = clubs.map(function (club) {
      var ea = findClub(A, club), eb = findClub(B, club);
      return el('tr', { class: (!ea || !eb) ? 'row-partial' : null },
        el('th', { scope: 'row', class: 'col-club' }, clubHeaderBits(club, ea, eb, A, B)),
        data.specFields.map(function (f) {
          var diff = (ea && eb) ? describeDiff(ea.specs[f.key], eb.specs[f.key], f) : { kind: 'none' };
          return el('td', { class: diff.kind === 'diff' ? 'cell-diff' : null },
            el('div', { class: 'pair' }, valueCell(ea, f, 'a', A), valueCell(eb, f, 'b', B)),
            chip(diff));
        }));
    });
    return el('div', { class: 'table-scroll matrix-wrap' },
      el('table', { class: 'matrix' },
        el('caption', { class: 'sr-only', text: 'Specs for both sets, one row per club' }),
        el('thead', null, head), el('tbody', null, rows)));
  }

  /* Narrow screens: the same table turned on its side, grouped by club. */
  function stackedTable(A, B) {
    var clubs = unionClubs(A, B);
    var head = el('thead', null, el('tr', null,
      el('th', { scope: 'col', text: 'Spec' }),
      el('th', { scope: 'col', class: 'h-a' }, el('span', { class: 'dot' }), shortName(A)),
      el('th', { scope: 'col', class: 'h-b' }, el('span', { class: 'dot' }), shortName(B)),
      el('th', { scope: 'col', text: 'Difference' })));
    var bodies = clubs.map(function (club) {
      var ea = findClub(A, club), eb = findClub(B, club);
      return el('tbody', null,
        el('tr', { class: 'club-row' }, el('th', { colspan: 4, scope: 'rowgroup' }, clubHeaderBits(club, ea, eb, A, B))),
        data.specFields.map(function (f) {
          var diff = (ea && eb) ? describeDiff(ea.specs[f.key], eb.specs[f.key], f) : { kind: 'none' };
          return el('tr', { class: diff.kind === 'diff' ? 'row-diff' : null },
            el('th', { scope: 'row', text: f.label }),
            el('td', null, valueCell(ea, f, 'a', A)),
            el('td', null, valueCell(eb, f, 'b', B)),
            el('td', { class: 'td-diff' }, chip(diff) || el('span', { class: 'v-absent', text: DASH })));
        }));
    });
    return el('table', { class: 'stacked' },
      el('caption', { class: 'sr-only', text: 'Specs for both sets, grouped by club' }), head, bodies);
  }

  function specs(A, B) {
    return el('section', { class: 'block', id: 'specs' },
      el('h2', { class: 'block-title', text: 'Club by club' }),
      el('p', { class: 'block-lede' },
        'Every spec for both sets, lined up by club. ',
        el('span', { class: 'legend' },
          el('span', { class: 'legend-item side-a' }, el('span', { class: 'dot' }), fullName(A)),
          el('span', { class: 'legend-item side-b' }, el('span', { class: 'dot' }), fullName(B)))),
      el('p', { class: 'block-note' },
        el('span', { class: 'chip chip-diff', text: 'Highlighted' }),
        ' notes say how the ' + shortName(B) + ' differs from the ' + shortName(A) +
        '. A dash means the source gives no value; nothing here is estimated.'),
      markLegend([A, B]),
      matrixTable(A, B),
      stackedTable(A, B)
    );
  }

  function build(A, B) {
    var rows = data.detailFields.filter(function (f) {
      return (A.details && A.details[f.key] != null) || (B.details && B.details[f.key] != null);
    }).map(function (f) {
      var va = A.details ? A.details[f.key] : null, vb = B.details ? B.details[f.key] : null;
      return el('tr', null,
        el('th', { scope: 'row', text: f.label }),
        el('td', null, el('span', { class: 'v v-a' + (va == null ? ' v-missing' : ''), text: va == null ? DASH : va })),
        el('td', null, el('span', { class: 'v v-b' + (vb == null ? ' v-missing' : ''), text: vb == null ? DASH : vb })));
    });
    return el('section', { class: 'block', id: 'build' },
      el('h2', { class: 'block-title', text: 'Shafts, grips and build' }),
      el('p', { class: 'block-lede', text: 'Details that apply to the whole set.' }),
      el('table', { class: 'details' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col' }, el('span', { class: 'sr-only', text: 'Detail' })),
          el('th', { scope: 'col', class: 'h-a' }, el('span', { class: 'dot' }), fullName(A)),
          el('th', { scope: 'col', class: 'h-b' }, el('span', { class: 'dot' }), fullName(B)))),
        el('tbody', null, rows)));
  }

  function photoTile(set, group, angle, side) {
    var photo = group ? group.photos[angle.key] : null;
    var who = set.brand + (group && group.label && group.label !== set.name ? ' ' + group.label : ' ' + set.name);
    if (!photo) {
      return el('div', { class: 'tile tile-empty side-' + side },
        el('div', { class: 'tile-frame' },
          el('p', { class: 'empty-title', text: 'No real photo found' }),
          el('p', { class: 'empty-sub', text: who + ': the manufacturer shows no ' + angle.label.toLowerCase() + ' view.' })),
        el('p', { class: 'tile-cap' }, el('span', { class: 'dot' }), who));
    }
    var alt = who + ', ' + angle.label.toLowerCase() + ' view' + (group.shown ? ' (' + group.shown + ')' : '');
    var cap = who + ' · ' + angle.label + (group.shown ? ' · ' + group.shown : '') + (group.credit ? ' · ' + group.credit : '');
    return el('figure', { class: 'tile side-' + side },
      el('button', { type: 'button', class: 'tile-frame', 'aria-label': 'Enlarge: ' + alt, onclick: function () { openLightbox(photo.file, alt, cap); } },
        el('img', { src: photo.file, alt: alt, decoding: 'async', width: 600, height: 600 })),
      el('figcaption', { class: 'tile-cap' }, el('span', { class: 'dot' }), who,
        photo.note ? el('span', { class: 'tile-note', text: photo.note }) : null));
  }

  function groupSwitch(set, side) {
    var groups = set.photoGroups || [];
    if (groups.length < 2) return null;
    var active = state.group[set.id] || 0;
    return el('div', { class: 'switch side-' + side, role: 'group', 'aria-label': 'Which ' + set.brand + ' head to show' },
      el('span', { class: 'switch-label', text: set.brand + ' head:' }),
      groups.map(function (g, i) {
        return el('button', {
          type: 'button', class: 'switch-btn' + (i === active ? ' is-on' : ''), 'aria-pressed': i === active ? 'true' : 'false',
          onclick: function () { state.group[set.id] = i; render(true); }
        }, g.label, g.clubs && g.clubs !== 'all' ? el('small', { text: ' ' + g.clubs }) : null);
      }));
  }

  function photos(A, B) {
    var ga = currentGroup(A), gb = currentGroup(B);
    var angles = data.photoAngles.filter(function (angle) {
      return angle.core || (ga && ga.photos[angle.key]) || (gb && gb.photos[angle.key]);
    });
    var switches = [groupSwitch(A, 'a'), groupSwitch(B, 'b')].filter(Boolean);
    return el('section', { class: 'block', id: 'photos' },
      el('h2', { class: 'block-title', text: 'Side by side' }),
      el('p', { class: 'block-lede', text: 'The manufacturers’ own product photos, matched by angle. They show a stock club of each model, not my individual clubs, and are not to scale with each other. Tap a photo to enlarge it.' }),
      switches.length ? el('div', { class: 'switches' }, switches) : null,
      el('div', { class: 'angles' }, angles.map(function (angle) {
        return el('div', { class: 'angle' },
          el('h3', { class: 'angle-title', text: angle.label }),
          el('div', { class: 'angle-pair' }, photoTile(A, ga, angle, 'a'), photoTile(B, gb, angle, 'b')));
      })));
  }

  /* Everything the sources do not give, worked out from the nulls in the data. */
  function gapsFor(set) {
    var items = [];
    data.specFields.forEach(function (f) {
      var missing = [], textOnly = [], textVal = null;
      set.clubs.forEach(function (c) {
        var v = c.specs[f.key];
        if (v == null || v === '') missing.push(c.club);
        else if (f.type === 'number' && !isNum(v)) { textOnly.push(c.club); textVal = v; }
        else if (f.type === 'swingweight' && swingPoints(v) == null) { textOnly.push(c.club); textVal = v; }
      });
      if (missing.length) {
        items.push(f.label + ': no value for ' + (missing.length === set.clubs.length ? 'any club' : missing.join(', ')));
      }
      if (textOnly.length) {
        items.push(f.label + ': given only as “' + textVal + '”, with no number, for ' +
          (textOnly.length === set.clubs.length ? 'every club' : textOnly.join(', ')));
      }
    });
    var noDetail = data.detailFields.filter(function (f) { return !f.optional && (!set.details || set.details[f.key] == null); })
      .map(function (f) { return f.label.toLowerCase(); });
    if (noDetail.length) items.push('Not given: ' + noDetail.join(', '));
    (set.photoGroups || []).forEach(function (g) {
      var none = data.photoAngles.filter(function (a) { return a.core && !g.photos[a.key]; }).map(function (a) { return a.label.toLowerCase(); });
      if (none.length) items.push('Photos, ' + g.label + ': no ' + none.join(' or ') + ' view from the manufacturer');
    });
    if (!(set.photoGroups || []).length) items.push('Photos: none');
    return items;
  }

  function link(url, text) {
    return el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: text });
  }

  function sourcesFor(set, side) {
    var gaps = gapsFor(set);
    return el('div', { class: 'source-card side-' + side },
      el('h3', { class: 'source-title' }, el('span', { class: 'dot' }), fullName(set)),

      el('h4', { text: 'Missing data' }),
      gaps.length ? el('ul', { class: 'gap-list' }, gaps.map(function (g) { return el('li', { text: g }); }))
        : el('p', { class: 'muted', text: 'Nothing missing.' }),

      (set.notes && set.notes.length) ? [el('h4', { text: 'Notes' }),
        el('ul', null, set.notes.map(function (n) { return el('li', { text: n }); }))] : null,

      el('h4', { text: 'Where the specs come from' }),
      el('ul', null, (set.sources || []).map(function (s) {
        return el('li', null, s.url ? link(s.url, s.label) : s.label, s.retrieved ? ' (read ' + s.retrieved + ')' : null);
      })),

      (set.photoGroups && set.photoGroups.length) ? [el('h4', { text: 'Where the photos come from' }),
        el('ul', null, set.photoGroups.map(function (g) {
          var originals = data.photoAngles.filter(function (a) { return g.photos[a.key]; }).map(function (a, i) {
            return [i ? ', ' : null, link(g.photos[a.key].original, a.label.toLowerCase())];
          });
          return el('li', null, el('strong', { text: g.label + ': ' }),
            g.sourceNote ? g.sourceNote + ' ' : null,
            g.sourcePage ? link(g.sourcePage, 'Source page') : null,
            originals.length ? ['. Original files: ', originals, '.'] : null);
        }))] : null
    );
  }

  function sources(A, B) {
    return el('section', { class: 'block', id: 'sources' },
      el('h2', { class: 'block-title', text: 'Missing data and sources' }),
      el('p', { class: 'block-lede', text: 'Every number on this page is copied from one of the sources below. Where a source is silent, the page shows a dash.' }),
      el('div', { class: 'source-grid' }, sourcesFor(A, 'a'), sourcesFor(B, 'b')));
  }

  /* ---------- lightbox ---------- */

  var lightbox = document.getElementById('lightbox');
  function openLightbox(src, alt, cap) {
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox-img').alt = alt;
    document.getElementById('lightbox-cap').textContent = cap;
    if (lightbox.showModal) lightbox.showModal(); else lightbox.setAttribute('open', '');
  }
  function closeLightbox() { if (lightbox.close) lightbox.close(); else lightbox.removeAttribute('open'); }
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', function (e) { if (e.target === lightbox) closeLightbox(); });

  /* ---------- page ---------- */

  function render(keepScroll) {
    var A = setById(state.a), B = setById(state.b);
    var y = window.scrollY;
    document.title = fullName(A) + ' vs ' + fullName(B) + ' · Iron Compare';

    var nav = el('nav', { class: 'jump', 'aria-label': 'Sections' },
      [['#specs', 'Specs'], ['#lofts', 'Lofts'], ['#build', 'Build'], ['#photos', 'Photos'], ['#sources', 'Gaps & sources']]
        .map(function (p) { return el('a', { href: p[0], text: p[1] }); }));

    var hero = el('section', { class: 'hero', 'aria-label': 'The two sets' },
      heroCard(A, 'a'), el('div', { class: 'vs', 'aria-hidden': 'true', text: 'vs' }), heroCard(B, 'b'));

    app.replaceChildren(hero, nav, glance(A, B), specs(A, B), ladder(A, B), build(A, B), photos(A, B), sources(A, B),
      el('footer', { class: 'foot' },
        el('p', { text: 'Iron Compare. Specs are copied from the listed sources and never estimated. Photos belong to their manufacturers.' })));

    if (keepScroll) window.scrollTo(0, y);
  }

  function syncPickers() {
    var pa = document.getElementById('pick-a'), pb = document.getElementById('pick-b');
    [pa, pb].forEach(function (sel) {
      sel.replaceChildren.apply(sel, data.sets.map(function (s) { return el('option', { value: s.id, text: fullName(s) }); }));
    });
    pa.value = state.a; pb.value = state.b;
  }

  function pushUrl() {
    var q = new URLSearchParams();
    q.set('a', state.a); q.set('b', state.b);
    history.replaceState(null, '', location.pathname + '?' + q.toString() + location.hash);
  }

  function choose(side, id) {
    var other = side === 'a' ? 'b' : 'a';
    if (state[other] === id) state[other] = state[side];   // picking the other side's set swaps them
    state[side] = id;
    syncPickers(); pushUrl(); render(false);
  }

  function start(json) {
    data = json;
    if (!data.sets || data.sets.length < 2) throw new Error('The data file needs at least two sets.');
    var q = new URLSearchParams(location.search);
    var def = data.defaultComparison || {};
    state.a = setById(q.get('a')) ? q.get('a') : (setById(def.a) ? def.a : data.sets[0].id);
    state.b = setById(q.get('b')) ? q.get('b') : (setById(def.b) ? def.b : data.sets[1].id);
    if (state.a === state.b) {
      state.b = data.sets.filter(function (s) { return s.id !== state.a; })[0].id;
    }
    syncPickers();
    document.getElementById('pick-a').addEventListener('change', function (e) { choose('a', e.target.value); });
    document.getElementById('pick-b').addEventListener('change', function (e) { choose('b', e.target.value); });
    document.getElementById('swap').addEventListener('click', function () {
      var t = state.a; state.a = state.b; state.b = t;
      syncPickers(); pushUrl(); render(false);
    });
    render(false);
  }

  fetch('data/iron-sets.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('Could not load the club data (' + r.status + ').'); return r.json(); })
    .then(start)
    .catch(function (err) {
      app.replaceChildren(el('p', { class: 'loading error', text: 'Something went wrong: ' + err.message }));
    });
})();
