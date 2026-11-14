/* Iron Compare: helpers shared by the comparison page (app.js) and the
   stage demo (stage.js). Nothing here knows about a particular brand or
   model, and nothing here touches the page: values go in, text comes out.
   Functions that need the data file take it as their first argument. */

(function (root) {
  'use strict';

  var DASH = '—';

  /* ---------- building elements ---------- */

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

  /* ---------- sets and clubs ---------- */

  function setById(data, id) {
    for (var i = 0; i < data.sets.length; i++) if (data.sets[i].id === id) return data.sets[i];
    return null;
  }

  function fullName(set) { return set.brand + ' ' + set.name; }
  function shortName(set) { return set.shortName || set.brand; }

  function clubName(club) {
    return /^\d+$/.test(club) ? club + ' iron' : club;
  }

  function clubIndex(data, club) {
    var i = data.clubOrder.indexOf(club);
    return i === -1 ? 999 : i;
  }

  function findClub(set, club) {
    for (var i = 0; i < set.clubs.length; i++) if (set.clubs[i].club === club) return set.clubs[i];
    return null;
  }

  function fieldByKey(data, key) {
    for (var i = 0; i < data.specFields.length; i++) if (data.specFields[i].key === key) return data.specFields[i];
    return null;
  }

  function unionClubs(data, A, B) {
    var seen = {};
    var out = [];
    A.clubs.concat(B.clubs).forEach(function (c) {
      if (!seen[c.club]) { seen[c.club] = true; out.push(c.club); }
    });
    out.sort(function (x, y) { return clubIndex(data, x) - clubIndex(data, y); });
    return out;
  }

  function sharedClubs(data, A, B) {
    return unionClubs(data, A, B).filter(function (c) { return findClub(A, c) && findClub(B, c); });
  }

  /* The source a value came from, when it is not the set's main source. */
  function sourceOf(set, entry, key) {
    var id = entry && entry.from && entry.from[key];
    if (!id) return null;
    for (var i = 0; i < (set.sources || []).length; i++) if (set.sources[i].id === id) return set.sources[i];
    return null;
  }

  /* ---------- values and differences ---------- */

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

  function diffAmountBare(d, field) {
    if (field.type === 'swingweight') return String(roundTo(Math.abs(d), 1));
    return fmtNum(Math.abs(d), field) + (field.unit === '°' ? '°' : '');
  }

  /* How set B differs from set A for one value.
     kind: 'diff' | 'same' | 'none' (nothing to compare).
     A 'diff' on a number also carries its two halves: amount ("2°") and word ("stronger"). */
  function describeDiff(va, vb, field) {
    if (va == null || vb == null || va === '' || vb === '') return { kind: 'none' };
    if (field.compare === false) return { kind: 'none' };
    if (field.type === 'text') {
      return String(va).trim().toLowerCase() === String(vb).trim().toLowerCase()
        ? { kind: 'same', text: 'Same' } : { kind: 'diff', text: 'Different' };
    }
    var d = numericDiff(va, vb, field);
    if (d == null) return { kind: 'none' };
    if (d === 0) return { kind: 'same', text: 'Same' };
    var amount = diffAmount(d, field), word = d < 0 ? field.lower : field.higher;
    return { kind: 'diff', text: amount + ' ' + word, amount: amount, word: word, delta: d };
  }

  root.IronCompare = {
    DASH: DASH,
    el: el, append: append,
    setById: setById, fullName: fullName, shortName: shortName,
    clubName: clubName, clubIndex: clubIndex, findClub: findClub, fieldByKey: fieldByKey,
    unionClubs: unionClubs, sharedClubs: sharedClubs, sourceOf: sourceOf,
    isNum: isNum, fmtNum: fmtNum, fmtValue: fmtValue, roundTo: roundTo, swingPoints: swingPoints,
    numericDiff: numericDiff, diffAmount: diffAmount, diffAmountBare: diffAmountBare, describeDiff: describeDiff
  };
})(window);
