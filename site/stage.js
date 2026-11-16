/* Iron Compare: stage demo.

   Reads the same data/iron-sets.json as the comparison page and stages one
   club from each set: the two irons hang side by side, turn to the same
   profile view, and three differences appear next to the part of the club
   they belong to.

   How it is put together:
   - One clock. Everything on screen is worked out from a single number, T,
     the seconds since the presenter pressed Compare. The clubs in the canvas
     and the text in the page read the same T, so they cannot drift apart, and
     Replay is just T running back to zero and forward again.
   - The page layout decides where things go. Each frame the layout's empty
     "slot" boxes are measured and the clubs are drawn to fit them (stage-gl.js).
   - The canvas reports back where the callout points on each club ended up,
     and the rings and leader lines in the page follow them.
   - If the canvas cannot be used, plain images take its place and the same
     clock drives them. With reduced motion, Compare goes straight to the
     finished comparison. */

(function () {
  'use strict';

  const C = window.IronCompare;
  const el = C.el;
  const qs = new URLSearchParams(location.search);
  const VERSION = (document.currentScript && document.currentScript.src.split('?')[1]) || '';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);

  const stage = $('stage'), canvas = $('gl'), flatLayer = $('flat'), leaderLayer = $('leaders');
  // Optional pieces a page can add to restyle the stage without its own script (tape.html uses them):
  // a strip that unrolls as the comparison starts, and data-casing on #leaders, which draws a dark
  // casing under each leader line so it stays legible where it crosses a club.
  const tapeEl = $('tape'), casing = leaderLayer.hasAttribute('data-casing');
  // Joins the club to the set name under each plate. A page can set data-join on #stage.
  const JOIN = stage.getAttribute('data-join') || ' · ';
  const mods = {};
  ['a', 'b'].forEach((side) => {
    const m = $('mod-' + side);
    mods[side] = {
      root: m,
      slotIntro: m.querySelector('[data-slot="intro"]'), slotCompare: m.querySelector('[data-slot="compare"]'),
      tags: m.querySelector('[data-tags]'), plate: m.querySelector('.plate'),
      brand: m.querySelector('[data-brand]'), name: m.querySelector('[data-name]'), sub: m.querySelector('[data-sub]')
    };
  });

  /* ---------- the clock ---------- */

  const TURN = 2.0;      // seconds for the clubs to turn to profile and settle
  const BEAT = 3.0;      // seconds for each difference
  const WRAP = 1.2;      // seconds for the closing line
  const REWIND = 1.1;    // seconds for Replay to run everything backwards
  const SWAP = 1.1;      // seconds to change club

  const S = {
    data: null, A: null, B: null, clubs: [], club: null, beats: [], also: [],
    model: null, next: null, values: null,
    phase: 'loading',    // loading | intro | playing | rewinding | done
    after: 'playing',    // where a rewind leads
    T: 0, end: TURN + WRAP,
    intro: 1,            // how much of the opening screen is showing, 0..1
    appear: 0,           // the clubs fading in after a cold load
    swap: null,
    frozen: false,
    last: 0, rem: 10,
    look: { dust: 1, pool: 1 },   // read from the page's CSS: --stage-dust and --stage-pool, 0 to 1
    reduced: false, flow: false,
    renderer: null
  };

  /* ---------- small maths ---------- */

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, start, dur) => clamp01((t - start) / dur);
  const smooth = (x) => x * x * (3 - 2 * x);
  const outCubic = (x) => 1 - Math.pow(1 - x, 3);
  const inOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const outBack = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

  /* cubic-bezier(x1, y1, x2, y2) as a function of x. */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const fx = (t) => ((ax * t + bx) * t + cx) * t;
    const fy = (t) => ((ay * t + by) * t + cy) * t;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 24; i++) {
        const e = fx(t) - x;
        if (Math.abs(e) < 1e-5) break;
        if (e > 0) hi = t; else lo = t;
        t = (lo + hi) / 2;
      }
      return fy(t);
    };
  }
  /* Slow to start, quick through the middle, a long time settling. */
  const glide = bezier(0.35, 0, 0, 1);

  /* How a sprung weight answers a push: off from rest, a little past the mark, back to it. */
  function spring(x, hz, damping) {
    if (x <= 0) return 0;
    const wn = 2 * Math.PI * hz, a = damping * wn, wd = wn * Math.sqrt(1 - damping * damping);
    return 1 - Math.exp(-a * x) * (Math.cos(wd * x) + (a / wd) * Math.sin(wd * x));
  }

  /* ---------- what is on show ---------- */

  /* The photo group for one club: the group named by the club's head, else the set's first. */
  function groupFor(set, entry) {
    const groups = set.photoGroups || [];
    if (entry && entry.head) {
      for (let i = 0; i < groups.length; i++) if (groups[i].id === entry.head || groups[i].label === entry.head) return groups[i];
    }
    return groups[0] || null;
  }

  /* The two photos the stage needs for a group, with where the head sits in each. */
  function photoOf(group) {
    const st = group && group.stage, ph = group && group.photos;
    if (!st || !st.face || !st.toe || !ph || !ph.face || !ph.toe) return null;
    return {
      id: group.id,
      face: { file: st.face.file || ph.face.file, head: st.face.head },
      toe: { file: st.toe.file || ph.toe.file, head: st.toe.head, anchors: st.toe.anchors || {} }
    };
  }

  function sideModel(set, club) {
    const entry = C.findClub(set, club);
    const group = groupFor(set, entry);
    return { set: set, entry: entry, group: group, photo: photoOf(group) };
  }

  function modelFor(club) { return { club: club, a: sideModel(S.A, club), b: sideModel(S.B, club) }; }

  function valuesOf(model) {
    const out = { a: {}, b: {} };
    ['a', 'b'].forEach((side) => {
      S.beats.forEach((beat) => {
        const v = model[side].entry ? model[side].entry.specs[beat.key] : null;
        out[side][beat.key] = C.isNum(v) ? v : null;
      });
    });
    return out;
  }

  /* Name on the plate: the head model when the set mixes heads, else the set's name. */
  function plateName(m) { return (m.entry && m.entry.head) || m.set.name; }
  function plateSub(m, club) {
    const extra = (m.entry && m.entry.head) ? m.set.name : m.set.tagline;
    return C.clubName(club) + (extra ? JOIN + extra : '');
  }

  /* ---------- building the page (once) ---------- */

  function svg(tag, attrs) {
    const node = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach((k) => node.setAttribute(k, attrs[k]));
    return node;
  }

  function ceilSig(x, digits) {
    if (x <= 0) return 0;
    const m = Math.pow(10, digits - 1 - Math.floor(Math.log10(x)));
    return Math.ceil(x * m - 1e-9) / m;
  }

  /* The range a beat's ruler covers, from every value of that field in the file. */
  function rulerRange(beat) {
    const all = [];
    S.data.sets.forEach((set) => set.clubs.forEach((c) => { if (C.isNum(c.specs[beat.key])) all.push(c.specs[beat.key]); }));
    if (!all.length) return { min: 0, max: 1 };
    const hi = Math.max.apply(null, all), lo = Math.min.apply(null, all);
    if (beat.ruler === 'zero') return { min: 0, max: ceilSig(hi * 1.04, 2) };
    return { min: Math.floor(lo), max: Math.ceil(hi) };
  }

  const RULER = { w: 340, h: 60, x0: 52, x1: 288, y: 30 };

  function buildRuler(beat) {
    const R = RULER;
    const root = svg('svg', { class: 'ruler', viewBox: '0 0 ' + R.w + ' ' + R.h, 'aria-hidden': 'true' });
    const lo = svg('text', { class: 'end', x: R.x0 - 10, y: R.y, 'text-anchor': 'end', 'dominant-baseline': 'central' });
    const hi = svg('text', { class: 'end', x: R.x1 + 10, y: R.y, 'text-anchor': 'start', 'dominant-baseline': 'central' });
    lo.textContent = C.fmtValue(beat.min, beat.field); hi.textContent = C.fmtValue(beat.max, beat.field);
    root.appendChild(svg('line', { class: 'track', x1: R.x0, x2: R.x1, y1: R.y, y2: R.y }));
    root.appendChild(svg('line', { class: 'tick', x1: R.x0, x2: R.x0, y1: R.y - 7, y2: R.y + 7 }));
    root.appendChild(svg('line', { class: 'tick', x1: R.x1, x2: R.x1, y1: R.y - 7, y2: R.y + 7 }));
    const gap = svg('line', { class: 'gap', y1: R.y, y2: R.y });
    const ma = svg('path', { class: 'm-a', d: 'M-12 -28 L12 -28 L0 -7 Z' });   // points down at the track
    const mb = svg('path', { class: 'm-b', d: 'M-12 28 L12 28 L0 7 Z' });      // points up at it
    root.appendChild(lo); root.appendChild(hi); root.appendChild(gap); root.appendChild(ma); root.appendChild(mb);
    return { root: root, gap: gap, a: ma, b: mb };
  }

  function valueNodes(cls) {
    const num = el('span', { class: 'num' }), mark = el('sup', { class: 'mark' });
    return { root: el('p', { class: cls }, num, mark), num: num, mark: mark };
  }

  function build() {
    const rail = $('rail');
    S.clubs.forEach((club) => {
      rail.appendChild(el('button', {
        type: 'button', 'data-club': club, 'aria-pressed': 'false', 'aria-label': C.clubName(club), text: club,
        onclick: (e) => { dropFocus(e); chooseClub(club); }
      }));
    });

    const beatsEl = $('beats');
    S.beats.forEach((beat, i) => {
      const r = rulerRange(beat);
      beat.min = r.min; beat.max = r.max;
      beat.at = TURN + i * BEAT;
      beat.ruler = buildRuler(beat);
      beat.amount = el('span', { class: 'amount' });
      beat.word = el('span', { class: 'word' });
      beat.delta = el('p', { class: 'beat-delta' }, beat.amount, beat.word);
      beat.label = el('p', { class: 'beat-label' }, el('span', { class: 'beat-num', text: String(i + 1) }), beat.field.label);
      beat.row = { a: valueNodes('beat-v beat-va side-a'), b: valueNodes('beat-v beat-vb side-b') };
      beat.root = el('div', { class: 'beat', 'data-key': beat.key }, beat.label, beat.row.a.root, beat.delta, beat.row.b.root, beat.ruler.root);
      beatsEl.appendChild(beat.root);

      beat.tag = {}; beat.leader = {};
      ['a', 'b'].forEach((side) => {
        const v = valueNodes('tag-value');
        const tag = el('div', { class: 'tag tag-' + beat.anchor, 'data-key': beat.key },
          el('p', { class: 'tag-label', text: beat.field.label }), v.root);
        mods[side].tags.appendChild(tag);
        beat.tag[side] = { root: tag, value: v };

        const g = svg('g', {});
        const L = {
          g: g,
          line: svg('path', { class: 'leader', pathLength: '1', 'stroke-dasharray': '1' }),
          pulse: svg('circle', { class: 'pulse' }),
          ring: svg('circle', { class: 'ring' }),
          core: svg('circle', { class: 'ring-core' }),
          num: svg('text', { class: 'pin-num' })
        };
        L.num.textContent = String(i + 1);
        if (casing) L.casing = svg('path', { class: 'leader-casing', pathLength: '1', 'stroke-dasharray': '1' });
        [L.casing, L.line, L.pulse, L.ring, L.core, L.num].forEach((n) => { if (n) g.appendChild(n); });
        leaderLayer.appendChild(g);
        beat.leader[side] = L;
      });
    });

    const alsoEl = $('also');
    S.also.forEach((item) => {
      item.val = el('span', { class: 'also-val' });
      alsoEl.appendChild(el('li', null, el('span', { class: 'also-label', text: item.field.label }), item.val));
    });

    // The headline, word by word, so it can rise in on a cold load.
    const title = $('intro-title');
    const words = title.textContent.trim().split(/\s+/);
    title.setAttribute('aria-label', words.join(' '));
    title.replaceChildren.apply(title, words.map((w, i) => {
      const span = el('span', { class: 'w', 'aria-hidden': 'true', text: w + (i < words.length - 1 ? ' ' : '') });
      span.style.setProperty('--i', String(i));
      return span;
    }));
  }

  /* ---------- the words that change with the club ---------- */

  function markFor(m, key) {
    const src = m.entry ? C.sourceOf(m.set, m.entry, key) : null;
    return src && src.mark ? src : null;
  }

  function applyTexts() {
    const M = S.model, club = M.club;
    ['a', 'b'].forEach((side) => {
      const m = M[side], d = mods[side];
      d.brand.textContent = m.set.brand;
      d.name.textContent = plateName(m);
      d.sub.textContent = plateSub(m, club);
      d.root.setAttribute('aria-label', m.set.brand + ' ' + plateName(m) + ', ' + C.clubName(club));
      fitName(d.name);
    });
    $('head-club').textContent = C.clubName(club);
    $('head-sub').textContent = C.shortName(S.B) + ' vs ' + C.shortName(S.A);

    const legend = [];
    function noteMark(side, key) {
      const src = markFor(M[side], key);
      if (!src) return;
      const line = src.mark + '|' + C.shortName(M[side].set) + ': ' + (src.markNote || src.label);
      if (legend.indexOf(line) === -1) legend.push(line);
    }

    S.beats.forEach((beat) => {
      const va = M.a.entry ? M.a.entry.specs[beat.key] : null, vb = M.b.entry ? M.b.entry.specs[beat.key] : null;
      const diff = C.describeDiff(va, vb, beat.field);
      beat.delta.classList.toggle('is-same', diff.kind !== 'diff');
      if (diff.kind === 'diff') { beat.amount.textContent = diff.amount; beat.word.textContent = diff.word; }
      else if (diff.kind === 'same') { beat.amount.textContent = 'Same'; beat.word.textContent = beat.field.label.toLowerCase(); }
      else { beat.amount.textContent = C.DASH; beat.word.textContent = 'not given by the source'; }
      ['a', 'b'].forEach((side) => {
        const src = markFor(M[side], beat.key);
        [beat.tag[side].value, beat.row[side]].forEach((v) => {
          v.mark.textContent = src ? src.mark : '';
          v.root.title = src ? (src.markNote || src.label) : '';
        });
        noteMark(side, beat.key);
      });
    });

    S.also.forEach((item) => {
      const va = M.a.entry ? M.a.entry.specs[item.key] : null, vb = M.b.entry ? M.b.entry.specs[item.key] : null;
      const diff = C.describeDiff(va, vb, item.field);
      item.val.textContent = diff.kind === 'none' ? C.DASH : diff.text;
      noteMark('a', item.key); noteMark('b', item.key);
    });

    const notes = $('notes');
    const bits = legend.map((line) => {
      const p = line.split('|');
      return el('span', null, el('span', { class: 'mark', text: p[0] }), p[1] + ' ');
    });
    const credits = ['a', 'b'].map((side) => {
      const g = M[side].group;
      return g ? (g.credit || M[side].set.brand + ' photo') + (g.shown ? ', ' + g.shown : '') : null;
    }).filter(Boolean);
    if (credits.length) bits.push(el('span', { text: 'Photos: ' + credits.join('; ') + '. Not to scale with each other.' }));
    notes.replaceChildren.apply(notes, bits);

    document.title = M.a.set.brand + ' ' + plateName(M.a) + ' vs ' + M.b.set.brand + ' ' + plateName(M.b) +
      ', ' + C.clubName(club) + ' · Iron Compare';
  }

  /* Shrink a plate name that is too long for its line (artboard layout only). */
  function fitName(node) {
    node.style.fontSize = '';
    if (S.flow) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
    let size = parseFloat(getComputedStyle(node).fontSize) / rem || 7.2;   // start from the size the stylesheet gives
    while (node.scrollWidth > node.clientWidth + 1 && size > 4) {
      size -= 0.3;
      node.style.fontSize = size + 'rem';
    }
  }

  function markRail() {
    Array.prototype.forEach.call($('rail').querySelectorAll('button'), (b) => {
      b.setAttribute('aria-pressed', b.getAttribute('data-club') === S.club ? 'true' : 'false');
    });
  }

  function pushUrl() {
    const q = new URLSearchParams(location.search);
    q.set('a', S.A.id); q.set('b', S.B.id); q.set('club', S.club);
    history.replaceState(null, '', location.pathname + '?' + q.toString());
    const back = new URLSearchParams();
    back.set('a', S.A.id); back.set('b', S.B.id);
    $('full').href = './?' + back.toString() + '#specs';
    $('home').href = './?' + back.toString();
  }

  /* ---------- where each club is, this frame ---------- */

  /* Fit a photo's head box inside a layout box; give back the head's centre and height in pixels. */
  function fit(rect, head) {
    const w = head[2] - head[0], h = head[3] - head[1];
    const scale = Math.min(rect.width / w, rect.height / h);
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, hh: scale * h };
  }

  const PHASE = { a: 0, b: 2.1 };

  function poseOf(side, t) {
    const photo = S.model && S.model[side].photo;
    if (!photo) return null;
    const d = mods[side], T = S.T, still = S.reduced;
    const from = fit(d.slotIntro.getBoundingClientRect(), photo.face.head);
    const to = fit(d.slotCompare.getBoundingClientRect(), photo.toe.head);
    const mv = glide(seg(T, 0, 1.5));

    // The quarter turn, with a small overshoot as it settles.
    let deg = 90 * spring(T - 0.06, 0.7, 0.7);
    if (T >= TURN) deg = lerp(deg, 90, smooth(seg(T, TURN, 0.4)));

    // Hanging: a slow drift before the start, the faintest one after.
    const idle = still ? 0 : 1 - smooth(seg(T, 0, 0.35));
    const rest = still ? 0 : smooth(seg(T, TURN, 1.2));
    const ph = PHASE[side];
    deg += idle * (8 * Math.sin(0.55 * t + ph) + 2.5 * Math.sin(1.27 * t + 2 * ph)) + rest * 1.1 * Math.sin(0.5 * t + ph);
    const bob = (idle * 7 + rest * 2.2) * Math.sin(0.8 * t + ph * 1.7) * (S.rem / 10);
    const roll = (idle * 0.9 + rest * 0.25) * Math.sin(0.62 * t + ph) * Math.PI / 180;

    // The face photo gives way to the toe photo through a flash of light, as chrome does when it turns edge-on.
    const faceO = 1 - smooth(clamp01((deg - 16) / 30)), toeO = smooth(clamp01((deg - 40) / 26));
    let glint = Math.exp(-Math.pow((deg - 45) / 16, 2)) * 0.95;
    let flipX = 1;
    if (S.swap && S.swap.flip[side]) {
      flipX = Math.abs(Math.cos(Math.PI * S.swap.p));
      glint += Math.pow(Math.sin(Math.PI * S.swap.p), 2) * 0.8;
    }

    // A band of light crosses the clubs as each difference lands, and now and then while they wait.
    let sweep = 0, sweepAmt = 0;
    if (!still) {
      const marks = [TURN - 0.75].concat(S.beats.map((b) => b.at - 0.05));
      for (let i = 0; i < marks.length; i++) {
        const p = (T - marks[i]) / 0.95;
        if (p > 0 && p < 1) { sweep = p; sweepAmt = Math.sin(Math.PI * p) * 0.5; }
      }
      if (S.swap) { sweep = clamp01(S.swap.p); sweepAmt = Math.sin(Math.PI * sweep) * 0.45; }
      const w = ((t + ph) % 7.5) / 1.5;
      if (S.intro > 0.5 && w < 1) { sweep = w; sweepAmt = Math.sin(Math.PI * w) * 0.32 * S.intro; }
    }

    // How far up the shaft shows before it dissolves. Shorter in the scrolling layout, where text sits just above.
    const fy = photo.face.head[1], ty = photo.toe.head[1], up = S.flow ? 0.55 : 1;
    return {
      cx: lerp(from.cx, to.cx, mv),
      cy: lerp(from.cy, to.cy, mv) + bob + (1 - S.appear) * 2.4 * S.rem,
      hh: lerp(from.hh, to.hh, mv),
      theta: deg * Math.PI / 180,
      roll: roll,
      lift: still ? 0 : Math.pow(Math.sin(Math.PI * seg(T, 0, 1.35)), 1.3) * 11 * S.rem,
      flipX: Math.max(flipX, 0.001),
      opacity: S.appear,
      faceO: faceO, toeO: toeO,
      faceFade: [fy - 0.18 * up, fy - 0.05 * up], toeFade: [ty - 0.17 * up, ty - 0.03 * up],
      glint: still ? 0 : glint, sweep: sweep, sweepAmt: sweepAmt,
      pool: S.look.pool * lerp(0.5, 0.85, mv) * clamp01(lerp(from.hh, to.hh, mv) / (28 * S.rem))   // no pool of light behind a thumbnail
    };
  }

  /* ---------- the stand-in for the canvas: two plain images a side ---------- */

  function createFlat() {
    const clubs = {};
    const mask = (img, fade) => {
      const g = 'linear-gradient(to bottom, transparent ' + (fade[0] * 100).toFixed(1) + '%, #000 ' + (fade[1] * 100).toFixed(1) + '%)';
      img.style.webkitMaskImage = g; img.style.maskImage = g;
    };
    ['a', 'b'].forEach((side) => {
      const face = el('img', { alt: '', decoding: 'async' }), toe = el('img', { alt: '', decoding: 'async' });
      const wrap = el('div', { class: 'flat-club' }, face, toe);
      flatLayer.appendChild(wrap);
      clubs[side] = { wrap: wrap, face: face, toe: toe, meta: null, pose: null };
    });

    function one(img, part, pose, squash, opacity) {
      const head = part.head;
      const k = pose.hh / (head[3] - head[1]) / 1000;
      const px = (head[0] + head[2]) / 2 * 1000, py = (head[1] + head[3]) / 2 * 1000;
      img.style.transform = 'scale(' + (k * Math.max(squash, 0.0001) * pose.flipX).toFixed(5) + ',' + k.toFixed(5) + ') translate(' + (-px) + 'px,' + (-py) + 'px)';
      img.style.opacity = (pose.opacity * opacity).toFixed(3);
    }

    return {
      kind: 'flat',
      preload: (urls) => Promise.all(urls.map((u) => new Promise((resolve) => {
        const im = new Image();
        im.onload = im.onerror = () => resolve();
        im.src = u;
      }))),
      setClub: (side, meta) => {
        const c = clubs[side];
        c.meta = meta;
        if (!meta) { c.wrap.style.display = 'none'; return Promise.resolve(); }
        c.wrap.style.display = '';
        c.face.src = meta.face.file; c.toe.src = meta.toe.file;
        return Promise.resolve();
      },
      resize: () => {},
      render: (frame) => {
        ['a', 'b'].forEach((side) => {
          const c = clubs[side], p = frame[side];
          c.pose = p;
          if (!p || !c.meta) { c.wrap.style.display = 'none'; return; }
          c.wrap.style.display = '';
          c.wrap.style.transform = 'translate(' + p.cx.toFixed(2) + 'px,' + p.cy.toFixed(2) + 'px) rotate(' + p.roll.toFixed(4) + 'rad)';
          one(c.face, c.meta.face, p, Math.cos(p.theta), p.faceO);
          one(c.toe, c.meta.toe, p, Math.sin(p.theta), p.toeO);
          mask(c.face, p.faceFade); mask(c.toe, p.toeFade);
        });
      },
      anchor: (side, uv) => {
        const c = clubs[side], p = c.pose;
        if (!p || !c.meta) return null;
        const head = c.meta.toe.head, size = p.hh / (head[3] - head[1]);
        return {
          x: p.cx + (uv[0] - (head[0] + head[2]) / 2) * size * Math.sin(p.theta) * p.flipX,
          y: p.cy + (uv[1] - (head[1] + head[3]) / 2) * size
        };
      }
    };
  }

  /* ---------- writing the frame into the page ---------- */

  function put(node, prop, value) {
    const cache = node.__put || (node.__put = {});
    if (cache[prop] === value) return;
    cache[prop] = value;
    node.style[prop] = value;
  }

  function show(node, o) {
    o = o < 0.004 ? 0 : o > 0.996 ? 1 : Math.round(o * 500) / 500;
    put(node, 'opacity', String(o));
    put(node, 'visibility', o === 0 ? 'hidden' : 'visible');
  }

  function attr(node, name, value) {
    const cache = node.__attr || (node.__attr = {});
    if (cache[name] === value) return;
    cache[name] = value;
    node.setAttribute(name, value);
  }

  function text(node, value) {
    if (node.__text === value) return;
    node.__text = value;
    node.textContent = value;
  }

  /* The number a value is showing right now: counting up as its beat lands,
     or sliding from the old club's number to the new one during a change. */
  function numberNow(side, beat, count) {
    const to = S.values[side][beat.key];
    if (to == null) return { text: C.DASH, v: null, missing: true };
    let v = to, done = count >= 1;
    if (S.swap) {
      const from = S.swap.from[side][beat.key];
      if (from != null && from !== to) { v = lerp(from, to, S.swap.e); done = false; }
    }
    v = lerp(beat.min, v, count);
    if (done) return { text: C.fmtValue(to, beat.field), v: v, missing: false };
    const final = C.fmtNum(to, beat.field), dot = final.indexOf('.');
    return { text: v.toFixed(dot === -1 ? 0 : final.length - dot - 1) + (beat.field.unit || ''), v: v, missing: false };
  }

  function rulerX(beat, v) {
    return RULER.x0 + clamp01((v - beat.min) / (beat.max - beat.min)) * (RULER.x1 - RULER.x0);
  }

  function paint() {
    const T = S.T, flow = S.flow;
    // During a club change, the words that change duck out and back. Words that stay the same stay put.
    const duck = S.swap ? Math.abs(1 - 2 * S.swap.p) : 1;
    const dipOf = (what) => (S.swap && S.swap.changed[what] ? Math.round(duck * 100) / 100 : 1);

    // The opening screen. On the artboard it clears out of the way; in the flow layout it stays put.
    const intro = $('intro'), start = $('start');
    if (flow) {
      show($('intro-title'), 1); show(intro.querySelector('.intro-sub'), 1); show(intro.querySelector('.cta-wrap'), 1);
      put($('intro-title'), 'transform', ''); put(intro.querySelector('.cta-wrap'), 'transform', '');
      const again = !(S.phase === 'intro' || S.phase === 'loading');
      text(start.querySelector('.cta-word'), again ? 'Replay' : 'Compare');
      start.classList.toggle('is-replay', again);
    } else {
      const o = S.intro;
      show($('intro-title'), o); show(intro.querySelector('.intro-sub'), o); show(intro.querySelector('.cta-wrap'), o);
      put($('intro-title'), 'transform', 'translateY(' + ((1 - o) * -2.4).toFixed(2) + 'rem)');
      put(intro.querySelector('.cta-wrap'), 'transform', 'scale(' + (0.94 + 0.06 * o).toFixed(3) + ')');
      text(start.querySelector('.cta-word'), 'Compare');
      start.classList.remove('is-replay');
    }

    // The strip the differences are written on, where the page has one: it unrolls before the first value lands.
    if (tapeEl) {
      const u = glide(seg(T, 0.15, 0.9));
      if (tapeEl.__u !== u) { tapeEl.__u = u; tapeEl.style.setProperty('--unroll', u.toFixed(4)); }
      show(tapeEl, u > 0 ? 1 : 0);
    }
    if (stage.__intro !== S.intro) { stage.__intro = S.intro; stage.style.setProperty('--intro', S.intro.toFixed(4)); }

    const headO = glide(seg(T, 0.9, 0.8));
    show($('head'), headO);
    put($('head'), 'transform', flow ? '' : 'translateY(' + ((1 - headO) * 1.6).toFixed(2) + 'rem)');
    put($('head-club'), 'opacity', String(dipOf('club')));

    S.beats.forEach((beat) => {
      const at = beat.at;
      const labelO = seg(T, at + 0.15, 0.4);
      const tagO = outCubic(seg(T, at + 0.25, 0.45));
      const count = inOutCubic(seg(T, at + 0.45, 1.15));
      const deltaO = seg(T, at + 1.6, 0.45);

      show(beat.root, labelO);

      const now = { a: numberNow('a', beat, count), b: numberNow('b', beat, count) };
      ['a', 'b'].forEach((side) => {
        const n = now[side], tag = beat.tag[side], row = beat.row[side];
        text(tag.value.num, n.text); text(row.num, n.text);
        tag.value.root.classList.toggle('is-missing', n.missing); row.root.classList.toggle('is-missing', n.missing);
        show(tag.root, tagO); show(row.root, tagO);
        const slide = ((1 - tagO) * 1.6).toFixed(2) + 'rem';
        put(tag.root, 'transform', beat.anchor === 'face' ? 'translateY(-' + slide + ')' : 'translateX(' + slide + ')');
        const m = beat.ruler[side];
        if (n.v == null) { put(m, 'display', 'none'); }
        else { put(m, 'display', ''); attr(m, 'transform', 'translate(' + rulerX(beat, n.v).toFixed(2) + ' ' + RULER.y + ')'); }
      });

      // The gold bar between the two markers is the difference itself.
      const gap = beat.ruler.gap;
      if (now.a.v == null || now.b.v == null) { put(gap, 'display', 'none'); }
      else {
        const xa = rulerX(beat, now.a.v), xb = rulerX(beat, now.b.v);
        put(gap, 'display', Math.abs(xb - xa) < 0.5 || deltaO <= 0 ? 'none' : '');
        attr(gap, 'x1', xa.toFixed(2)); attr(gap, 'x2', lerp(xa, xb, outCubic(deltaO)).toFixed(2));
      }
      show(beat.delta, deltaO * dipOf('delta:' + beat.key));
      put(beat.delta, 'transform', 'scale(' + (0.9 + 0.1 * outBack(deltaO)).toFixed(3) + ')');
    });

    const wrapAt = S.end - WRAP;
    show($('also'), seg(T, wrapAt, 0.5) * dipOf('also'));
    show($('notes'), flow ? 1 : seg(T, wrapAt + 0.3, 0.5));
    ['a', 'b'].forEach((side) => {
      put(mods[side].name, 'opacity', String(dipOf('name:' + side)));
      put(mods[side].sub, 'opacity', String(dipOf('club')));
    });

    const replay = $('replay');
    replay.disabled = S.phase === 'intro' || S.phase === 'loading';
    replay.classList.toggle('is-ready', S.phase === 'done');
    start.disabled = S.phase === 'loading' || (!flow && S.phase !== 'intro');
    if (stage.getAttribute('data-phase') !== S.phase) stage.setAttribute('data-phase', S.phase);
  }

  /* Rings on the parts of each club, and the lines out to their numbers.
     Runs after the clubs are drawn, so the rings sit where the clubs really are. */
  function paintLeaders() {
    const T = S.T, flow = S.flow, r = 1.1 * S.rem;
    S.beats.forEach((beat) => {
      const ringO = seg(T, beat.at, 0.25);
      const pulse = S.reduced ? 1 : seg(T, beat.at, 0.9);
      const draw = inOutCubic(seg(T, beat.at + 0.1, 0.45));
      ['a', 'b'].forEach((side) => {
        const L = beat.leader[side];
        const photo = S.model[side].photo;
        const uv = photo && photo.toe.anchors[beat.anchor];
        const at = uv && ringO > 0 ? S.renderer.anchor(side, uv) : null;
        if (!at) { put(L.g, 'display', 'none'); return; }
        put(L.g, 'display', '');
        const cx = at.x.toFixed(1), cy = at.y.toFixed(1);
        [L.ring, L.core, L.pulse].forEach((n) => { attr(n, 'cx', cx); attr(n, 'cy', cy); });
        attr(L.ring, 'r', r.toFixed(1)); attr(L.core, 'r', (flow ? 0 : r * 0.36).toFixed(1));
        put(L.ring, 'opacity', ringO.toFixed(2)); put(L.core, 'opacity', ringO.toFixed(2));
        attr(L.pulse, 'r', (r * (1 + 2.6 * outCubic(pulse))).toFixed(1));
        put(L.pulse, 'opacity', ((1 - pulse) * 0.9).toFixed(2));
        attr(L.num, 'x', cx); attr(L.num, 'y', cy); put(L.num, 'opacity', ringO.toFixed(2));
        if (flow) { put(L.ring, 'fill', 'var(--pin-flow-fill, var(--gold))'); return; }
        put(L.ring, 'fill', '');

        // From the edge of the label nearest the ring to the edge of the ring: the bottom of a label
        // above the club, else whichever side of the label faces the club.
        const box = beat.tag[side].root.getBoundingClientRect();
        let sx, sy;
        if (beat.anchor === 'face' && at.x > box.left && at.x < box.right) { sx = Math.min(Math.max(at.x, box.left + 2 * S.rem), box.right - 2 * S.rem); sy = box.bottom + 0.6 * S.rem; }
        else if (at.x <= box.left) { sx = box.left - 1.2 * S.rem; sy = box.top + box.height * 0.64; }
        else { sx = box.right + 1.2 * S.rem; sy = box.top + box.height * 0.64; }
        const dx = at.x - sx, dy = at.y - sy, len = Math.hypot(dx, dy) || 1;
        const ex = at.x - dx / len * (r + 2), ey = at.y - dy / len * (r + 2);
        const d = 'M' + sx.toFixed(1) + ' ' + sy.toFixed(1) + 'L' + ex.toFixed(1) + ' ' + ey.toFixed(1);
        [L.casing, L.line].forEach((n) => {
          if (!n) return;
          attr(n, 'd', d);
          attr(n, 'stroke-dashoffset', (-(1 - draw)).toFixed(3));   // grows from the label towards the club
          put(n, 'opacity', draw > 0 ? '1' : '0');
        });
      });
    });
  }

  /* ---------- the presenter's controls ---------- */

  function start() {
    if (S.phase !== 'intro') return;
    if (S.reduced) { S.T = S.end; S.intro = 0; S.phase = 'done'; settle(); return; }
    S.T = 0; S.phase = 'playing';
    if (S.flow) setTimeout(() => $('beats').scrollIntoView({ behavior: 'smooth', block: 'end' }), TURN * 1000);
  }

  function replay() {
    if (S.phase === 'loading') return;
    if (S.phase === 'intro') { start(); return; }
    if (S.reduced) { S.T = S.end; S.phase = 'done'; settle(); return; }
    S.after = 'playing'; S.phase = 'rewinding';
  }

  function reset() {
    if (S.phase === 'loading' || S.phase === 'intro') return;
    if (S.reduced) { S.T = 0; S.intro = 1; S.phase = 'intro'; settle(); return; }
    S.after = 'intro'; S.phase = 'rewinding';
  }

  /* The one big button, the space bar and a clicker's "next" all do this. */
  function primary() {
    if (S.phase === 'intro') start();
    else if (S.phase === 'done') replay();
  }

  /* With reduced motion a change of state is one short cross-fade, nothing else. */
  function settle() {
    [stage, canvas, flatLayer, leaderLayer].forEach((n) => {
      if (n.animate) n.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    });
  }

  function commitSwap() {
    S.model = S.next;
    applyTexts();
    ['a', 'b'].forEach((side) => S.renderer.setClub(side, S.model[side].photo));
  }

  function chooseClub(club) {
    if (S.phase === 'loading' || club === S.club || S.clubs.indexOf(club) === -1) return;
    if (S.swap) { if (!S.swap.mid) commitSwap(); S.swap = null; }
    const from = S.values, before = S.model;
    S.club = club;
    S.next = modelFor(club);
    S.values = valuesOf(S.next);
    markRail(); pushUrl();
    if (S.reduced || S.frozen) { commitSwap(); if (S.reduced) settle(); return; }
    const newPhoto = (side) => (before[side].photo && before[side].photo.id) !== (S.next[side].photo && S.next[side].photo.id);
    const changed = { club: true };
    ['a', 'b'].forEach((side) => { changed['name:' + side] = plateName(before[side]) !== plateName(S.next[side]); });
    S.beats.forEach((beat) => { changed['delta:' + beat.key] = diffText(before, beat) !== diffText(S.next, beat); });
    changed.also = S.also.some((item) => diffText(before, item) !== diffText(S.next, item));
    S.swap = { p: 0, e: 0, mid: false, from: from, flip: { a: newPhoto('a'), b: newPhoto('b') }, changed: changed };
  }

  /* The wording of one difference for a model, used to tell whether a change of club changes it. */
  function diffText(model, item) {
    const va = model.a.entry ? model.a.entry.specs[item.key] : null, vb = model.b.entry ? model.b.entry.specs[item.key] : null;
    const d = C.describeDiff(va, vb, item.field);
    return d.kind === 'none' ? '' : d.text;
  }

  /* After a mouse click, hand the keyboard back to the page so Space still means Compare. */
  function dropFocus(e) { if (e && e.detail > 0 && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur(); }

  function onKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    const onControl = tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    const k = e.key;
    if (k === ' ' || k === 'Enter') { if (onControl) return; e.preventDefault(); primary(); return; }
    if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); primary(); return; }
    if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Escape') { e.preventDefault(); reset(); return; }
    if (k === 'r' || k === 'R') { e.preventDefault(); replay(); return; }
    if (k === 'f' || k === 'F') {
      e.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
      return;
    }
    const club = /^[1-9]$/.test(k) ? k : (k === 'p' || k === 'P' || k === 'w' || k === 'W' || k === '0') ? 'PW' : null;
    if (club && S.clubs.indexOf(club) !== -1) { e.preventDefault(); chooseClub(club); }
  }

  /* ---------- the loop ---------- */

  function measure() {
    S.rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
    leaderLayer.style.setProperty('--sw', (0.26 * S.rem).toFixed(2) + 'px');
    const css = getComputedStyle(document.documentElement);
    ['dust', 'pool'].forEach((k) => {
      const v = parseFloat(css.getPropertyValue('--stage-' + k));
      S.look[k] = isFinite(v) ? clamp01(v) : 1;
    });
    if (S.renderer) S.renderer.resize(window.innerWidth, window.innerHeight);
    if (S.model) ['a', 'b'].forEach((side) => fitName(mods[side].name));
  }

  function tick(dt) {
    if (S.frozen) return;
    if (S.phase === 'playing') {
      S.T += dt;
      if (S.T >= S.end) { S.T = S.end; S.phase = 'done'; }
    } else if (S.phase === 'rewinding') {
      S.T -= dt * S.end / REWIND;
      if (S.T <= 0) { S.T = 0; S.phase = S.after === 'intro' ? 'intro' : 'playing'; }
    }
    const want = S.phase === 'intro' ? 1 : 0;
    S.intro += (want - S.intro) * (1 - Math.exp(-7 * dt));
    if (Math.abs(want - S.intro) < 0.002) S.intro = want;
    if (S.appear < 1) S.appear = S.reduced ? 1 : Math.min(1, S.appear + dt / 1.1);
    if (S.swap) {
      S.swap.p += dt / SWAP;
      S.swap.e = inOutCubic(clamp01(S.swap.p));
      if (S.swap.p >= 0.5 && !S.swap.mid) { S.swap.mid = true; commitSwap(); }
      if (S.swap.p >= 1) S.swap = null;
    }
  }

  function draw(t) {
    paint();
    const still = S.reduced;
    S.renderer.render({
      time: still ? 0 : t,
      a: poseOf('a', t), b: poseOf('b', t),
      driftX: still ? 0 : Math.sin(t * 0.11) * 0.9 * S.rem,
      driftY: still ? 0 : Math.sin(t * 0.17) * 0.6 * S.rem,
      dust: S.appear * 0.9 * S.look.dust
    });
    paintLeaders();
  }

  function loop(ms) {
    const t = ms / 1000;
    const dt = Math.min(0.25, Math.max(0, t - S.last));   // a stalled tab must not skip the sequence
    S.last = t;
    tick(dt);
    try { draw(t); }
    catch (err) {
      if (S.renderer.kind === 'webgl') { useFlat(); } else { throw err; }
    }
    requestAnimationFrame(loop);
  }

  /* ---------- starting up ---------- */

  function allPhotos() {
    const urls = [];
    [S.A, S.B].forEach((set) => (set.photoGroups || []).forEach((g) => {
      const p = photoOf(g);
      if (p) { urls.push(p.face.file); urls.push(p.toe.file); }
    }));
    return urls.filter((u, i) => urls.indexOf(u) === i);
  }

  /* Swap the canvas for plain images. Safe to call at any time, even mid-sequence. */
  function useFlat() {
    if (S.renderer && S.renderer.kind === 'flat') return;
    document.documentElement.classList.add('no-gl');
    S.renderer = createFlat();
    S.renderer.preload(allPhotos());
    if (S.model) ['a', 'b'].forEach((side) => S.renderer.setClub(side, S.model[side].photo));
  }

  function hasWebGL() {
    try {
      const probe = document.createElement('canvas');
      return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
    } catch (err) { return false; }
  }

  function wantsReduced() {
    const m = qs.get('motion');
    if (m === 'reduce') return true;
    if (m === 'full') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function fail(err) {
    const status = $('status');
    status.classList.add('is-error');
    status.textContent = 'Something went wrong: ' + (err && err.message ? err.message : err);
  }

  async function init(data) {
    S.data = data;
    if (!data.sets || data.sets.length < 2) throw new Error('The data file needs at least two sets.');
    const conf = data.stage || {}, feat = conf.featured || {}, def = data.defaultComparison || {};
    const pick = (ids) => { for (let i = 0; i < ids.length; i++) { const s = ids[i] && C.setById(data, ids[i]); if (s) return s; } return null; };
    S.A = pick([qs.get('a'), feat.a, def.a]) || data.sets[0];
    S.B = pick([qs.get('b'), feat.b, def.b]) || data.sets[1];
    if (S.A === S.B) S.B = data.sets.filter((s) => s !== S.A)[0];

    S.clubs = C.sharedClubs(data, S.A, S.B);
    if (!S.clubs.length) throw new Error('These two sets have no club in common.');
    S.club = [qs.get('club'), feat.club].filter((c) => S.clubs.indexOf(c) !== -1)[0] || S.clubs[Math.floor(S.clubs.length / 2)];

    S.beats = (conf.beats || []).map((b) => ({ key: b.key, anchor: b.anchor, ruler: b.ruler, field: C.fieldByKey(data, b.key) }))
      .filter((b) => b.field && b.field.type === 'number');
    S.also = (conf.also || []).map((key) => ({ key: key, field: C.fieldByKey(data, key) })).filter((a) => a.field);
    S.end = TURN + S.beats.length * BEAT + WRAP;

    S.reduced = wantsReduced();
    document.documentElement.classList.toggle('reduced', S.reduced);
    const wide = window.matchMedia('(min-width: 900px) and (min-aspect-ratio: 5/4)');
    S.flow = !wide.matches;
    const onLayout = () => { S.flow = !wide.matches; measure(); };
    if (wide.addEventListener) wide.addEventListener('change', onLayout);
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (rm.addEventListener) rm.addEventListener('change', () => {
      S.reduced = wantsReduced();
      document.documentElement.classList.toggle('reduced', S.reduced);
      if (S.reduced && (S.phase === 'playing' || S.phase === 'rewinding')) { S.T = S.end; S.phase = 'done'; S.intro = 0; }
    });

    build();
    S.model = modelFor(S.club);
    S.values = valuesOf(S.model);
    markRail(); pushUrl();

    if (document.fonts && document.fonts.ready) {
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    }
    applyTexts();

    // The canvas if it can be had, plain images if not. Ask the browser first, so a
    // machine without WebGL never downloads the 3D code or logs an error about it.
    if (qs.get('gl') !== '0' && hasWebGL()) {
      try {
        const mod = await import('./stage-gl.js' + (VERSION ? '?' + VERSION : ''));
        S.renderer = mod.createStageScene({ canvas: canvas, onLost: useFlat });
      } catch (err) {
        S.renderer = null;
      }
    }
    if (!S.renderer) useFlat();
    measure();

    try {
      await Promise.race([S.renderer.preload(allPhotos()), new Promise((r) => setTimeout(r, 6000))]);
      await Promise.all(['a', 'b'].map((side) => S.renderer.setClub(side, S.model[side].photo)));
    } catch (err) {
      if (S.renderer.kind === 'webgl') { useFlat(); } else { throw err; }
    }

    const at = qs.get('t');
    if (at != null && at !== '' && isFinite(Number(at))) {       // ?t=5.2 holds the sequence at one moment, for checking layouts
      S.frozen = true; S.appear = 1;
      S.T = Math.max(0, Math.min(S.end, Number(at)));
      S.intro = S.T <= 0 ? 1 : 0;
      S.phase = S.T <= 0 ? 'intro' : S.T >= S.end ? 'done' : 'playing';
    } else {
      S.phase = 'intro';
      if (!S.reduced) { stage.classList.add('is-entering'); setTimeout(() => stage.classList.remove('is-entering'), 2600); }
    }

    // On the big screen a parked mouse pointer is a distraction: hide it once it has been still for a moment.
    let parked = 0;
    const wake = () => {
      document.documentElement.classList.remove('pointer-parked');
      clearTimeout(parked);
      parked = setTimeout(() => document.documentElement.classList.add('pointer-parked'), 2500);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    wake();

    $('start').addEventListener('click', (e) => { dropFocus(e); primary(); });
    $('replay').addEventListener('click', (e) => { dropFocus(e); replay(); });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', measure);
    S.last = performance.now() / 1000;
    requestAnimationFrame(loop);
  }

  /* For rehearsal and for the checks in checks/: read the state, or drive it without the keyboard. */
  window.ironStage = {
    state: S, start: start, replay: replay, reset: reset, club: chooseClub,
    seek: (T) => { S.T = Math.max(0, Math.min(S.end, T)); S.intro = S.T <= 0 ? 1 : 0; S.phase = S.T <= 0 ? 'intro' : S.T >= S.end ? 'done' : 'playing'; S.frozen = true; },
    resume: () => { S.frozen = false; }
  };

  fetch('data/iron-sets.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error('Could not load the club data (' + r.status + ').'); return r.json(); })
    .then(init)
    .catch(fail);
})();
