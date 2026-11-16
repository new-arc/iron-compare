#!/usr/bin/env node
/* Drives the stage demo in a real browser, the way a presenter would, and
   checks what ends up on screen against the data file. Run from the
   repository root:

       node checks/check-stage.js              both looks: stage.html and tape.html
       node checks/check-stage.js tape.html    one page only

   Needs Playwright (https://playwright.dev) with its Chromium:
       npm install --no-save playwright && npx playwright install chromium

   It serves site/ itself on a spare port, so nothing else has to be running.
   Four passes: a 1920 by 1080 projector, reduced motion, a browser with WebGL
   switched off, and a phone, run once for each page named. The sequence
   plays in real time, so each page takes about a minute and a half. */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const vm = require('vm');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (err) {
  console.error('Playwright is not installed. Run:\n  npm install --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

const SITE = path.join(__dirname, '..', 'site');
const data = JSON.parse(fs.readFileSync(path.join(SITE, 'data', 'iron-sets.json'), 'utf8'));

/* The page's own value and wording helpers, loaded outside the browser, so
   the expected text is worked out here and not read back from the page. */
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(SITE, 'core.js'), 'utf8'), sandbox);
const C = sandbox.window.IronCompare;

const A = C.setById(data, data.stage.featured.a), B = C.setById(data, data.stage.featured.b);
const FEATURED = data.stage.featured.club;
const SHARED = C.sharedClubs(data, A, B);
const BEATS = data.stage.beats.map((b) => ({ key: b.key, field: C.fieldByKey(data, b.key) }));
const ALSO = data.stage.also.map((key) => ({ key: key, field: C.fieldByKey(data, key) }));

function expected(club) {
  const a = C.findClub(A, club), b = C.findClub(B, club);
  const value = (set, entry, beat) => {
    const src = C.sourceOf(set, entry, beat.key);
    return C.fmtValue(entry.specs[beat.key], beat.field) + (src && src.mark ? src.mark : '');
  };
  return {
    names: [a.head || A.name, b.head || B.name],
    a: BEATS.map((beat) => value(A, a, beat)),
    b: BEATS.map((beat) => value(B, b, beat)),
    deltas: BEATS.map((beat) => {
      const d = C.describeDiff(a.specs[beat.key], b.specs[beat.key], beat.field);
      return d.kind === 'diff' ? d.amount + ' ' + d.word : d.kind === 'same' ? 'Same ' + beat.field.label.toLowerCase() : C.DASH;
    }),
    also: ALSO.map((item) => {
      const d = C.describeDiff(a.specs[item.key], b.specs[item.key], item.field);
      return item.field.label + ' ' + (d.kind === 'none' ? C.DASH : d.text);
    })
  };
}

/* A second club to switch to: one where a head model changes if the sets have one, else the next club along. */
const OTHER = SHARED.filter((c) => c !== FEATURED && (C.findClub(A, c).head !== C.findClub(A, FEATURED).head ||
  C.findClub(B, c).head !== C.findClub(B, FEATURED).head))[0] || SHARED.filter((c) => c !== FEATURED)[0];
const keyFor = (club) => (club === 'PW' ? 'p' : club);

/* The pages to check: the two looks of the stage demo share one script, so every pass runs on each. */
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ['stage.html', 'tape.html'];
let PAGE = PAGES[0];

/* ---------- a tiny static server for site/ ---------- */

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
function serve() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(SITE, path.normalize(rel));
    if (file.indexOf(SITE) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* ---------- reporting ---------- */

let failed = 0, passed = 0;
function check(ok, what, detail) {
  if (ok) { passed++; console.log('  ok    ' + what); }
  else { failed++; console.log('  FAIL  ' + what + (detail !== undefined ? '\n        got: ' + JSON.stringify(detail) : '')); }
}
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

/* ---------- reading the page ---------- */

const state = (page) => page.evaluate(() => {
  const s = window.ironStage.state;
  return { phase: s.phase, T: s.T, end: s.end, club: s.club, shown: s.model.club, swap: !!s.swap, flow: s.flow, reduced: s.reduced, renderer: s.renderer.kind };
});
const waitPhase = (page, phase, ms) => page.waitForFunction((p) => window.ironStage && window.ironStage.state.phase === p, phase, { timeout: ms || 60000 });
const waitSwap = (page, club) => page.waitForFunction((c) => !window.ironStage.state.swap && window.ironStage.state.model.club === c, club, { timeout: 20000 });

function read(page, flow) {
  return page.evaluate((flow) => {
    const txt = (e) => e.textContent.replace(/\s+/g, ' ').trim();
    const seen = (e) => { const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.95; };
    const all = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));
    const values = (side) => all(flow ? '.beat-v' + (side === 'a' ? 'a' : 'b') : '#mod-' + side + ' .tag-value');
    return {
      names: all('.plate-name').map(txt),
      a: values('a').map(txt), b: values('b').map(txt),
      valuesSeen: values('a').concat(values('b')).every(seen),
      deltas: all('.beat-delta').map((e) => txt(e.querySelector('.amount')) + (txt(e.querySelector('.word')) ? ' ' + txt(e.querySelector('.word')) : '')),
      deltasSeen: all('.beat-delta').every(seen),
      also: all('#also li').map((li) => txt(li.querySelector('.also-label')) + ' ' + txt(li.querySelector('.also-val'))),
      rings: all('#leaders .ring').filter((r) => r.parentNode.style.display !== 'none' && Number(r.style.opacity) > 0.9).length,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1
    };
  }, flow);
}

function matches(got, want, what) {
  check(same(got.names, want.names), what + ': club names ' + want.names.join(' / '), got.names);
  check(same(got.a, want.a) && same(got.b, want.b), what + ': values ' + want.a.join(', ') + ' vs ' + want.b.join(', '), [got.a, got.b]);
  check(same(got.deltas, want.deltas), what + ': differences ' + want.deltas.join(' | '), got.deltas);
  check(same(got.also, want.also), what + ': closing line ' + want.also.join(' | '), got.also);
  check(got.valuesSeen && got.deltasSeen, what + ': values and differences are fully visible');
}

function watch(page, log) {
  page.on('console', (m) => { if (m.type() === 'error') log.push('console error: ' + m.text()); });
  page.on('pageerror', (e) => log.push('page error: ' + String(e)));
  page.on('requestfailed', (r) => log.push('failed request: ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) log.push(r.status() + ' ' + r.url()); });
}

/* ---------- the passes ---------- */

async function projector(browser, base) {
  console.log('\nProjector, 1920 x 1080');
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const log = []; watch(page, log);
  const t0 = Date.now();
  await page.goto(base + '/' + PAGE);
  await waitPhase(page, 'intro', 20000);
  const ready = Date.now() - t0;
  let s = await state(page);
  check(true, 'cold load reaches the opening screen in ' + ready + ' ms, drawing with ' + (s.renderer === 'webgl' ? 'WebGL' : 'plain images (WebGL not available in this browser)'));
  check(s.club === FEATURED && !s.flow, 'opens on the featured club (' + FEATURED + ') in the board layout', s);
  await page.waitForTimeout(3000);

  const sizes = await page.evaluate(() => {
    const px = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
    const top = (sel) => { const e = document.querySelector(sel), r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit === e || e.contains(hit); };
    return { title: px('.intro-title'), cta: px('.cta'), name: px('.plate-name'), rail: px('#rail button'), startOnTop: top('#start'), railOnTop: top('#rail button') };
  });
  check(sizes.title >= 96 && sizes.cta >= 40 && sizes.name >= 56 && sizes.rail >= 26, 'opening text is projector size (headline ' + sizes.title + 'px, button ' + sizes.cta + 'px, names ' + sizes.name + 'px)', sizes);
  check(sizes.startOnTop && sizes.railOnTop, 'nothing covers the Compare button or the club buttons');

  // Start, with a nervous second press that must do nothing.
  const tStart = Date.now();
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const first = await state(page);
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  s = await state(page);
  check(first.phase === 'playing' && s.phase === 'playing' && s.T > first.T, 'Space starts the sequence; a second press does not restart it', [first, s]);
  await waitPhase(page, 'done');
  const took = (Date.now() - tStart) / 1000;
  s = await state(page);
  check(took > s.end - 0.6 && took < s.end + 6, 'the sequence finishes in ' + took.toFixed(1) + ' s (designed length ' + s.end.toFixed(1) + ' s)', took);
  await page.waitForTimeout(600);

  let got = await read(page, false);
  matches(got, expected(FEATURED), FEATURED);
  check(got.rings === BEATS.length * 2, 'a ring sits on each club for each difference (' + BEATS.length * 2 + ')', got.rings);

  const layout = await page.evaluate(() => {
    const seen = (e) => { const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.5; };
    const boxes = [];
    const add = (sel, pad) => Array.prototype.forEach.call(document.querySelectorAll(sel), (e, i) => {
      if (!seen(e)) return;
      const r = e.getBoundingClientRect();
      if (r.width && r.height) boxes.push({ name: sel + '[' + i + ']', l: r.left + pad, t: r.top + pad, r: r.right - pad, b: r.bottom - pad });
    });
    add('.tag', 0); add('.plate-brand', 0); add('.plate-sub', 0); add('.beat-delta', 0); add('.ruler', 0); add('#head-club', 0); add('#head-sub', 0);
    add('#also li', 0); add('.notes', 0); add('.brandmark', 0); add('#rail', 0); add('.bar-actions', 0);
    // A plate name's box is as wide as its column, so measure its words instead. The lines of one
    // name plate (brand, name, set) sit closer than a font's full box, so they are not tested against each other.
    Array.prototype.forEach.call(document.querySelectorAll('.plate-name'), (e, i) => {
      const range = document.createRange(); range.selectNodeContents(e);
      const r = range.getBoundingClientRect();
      boxes.push({ name: '.plate-name[' + i + ']', l: r.left, t: r.top, r: r.right, b: r.bottom });
    });
    const plateOf = (name) => { const m = /^\.plate-(?:brand|name|sub)\[(\d+)\]$/.exec(name); return m ? m[1] : null; };
    const off = boxes.filter((x) => x.l < -1 || x.t < -1 || x.r > innerWidth + 1 || x.b > innerHeight + 1).map((x) => x.name);
    const clash = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i], q = boxes[j];
      if (plateOf(p.name) !== null && plateOf(p.name) === plateOf(q.name)) continue;
      if (Math.min(p.r, q.r) - Math.max(p.l, q.l) > 2 && Math.min(p.b, q.b) - Math.max(p.t, q.t) > 2) clash.push(p.name + ' x ' + q.name);
    }
    return { count: boxes.length, off: off, clash: clash };
  });
  check(layout.off.length === 0, 'nothing runs off the screen (' + layout.count + ' text blocks measured)', layout.off);
  check(layout.clash.length === 0, 'no two text blocks overlap', layout.clash);

  // Switch one club from the keyboard.
  await page.keyboard.press(keyFor(OTHER));
  await waitSwap(page, OTHER);
  await page.waitForTimeout(300);
  got = await read(page, false);
  matches(got, expected(OTHER), 'after switching to ' + OTHER);
  check(/[?&]club=/.test(page.url()) && new URL(page.url()).searchParams.get('club') === OTHER, 'the address bar keeps the club, so a reload comes back to it', page.url());

  // Replay.
  await page.keyboard.press('r');
  await page.waitForTimeout(200);
  s = await state(page);
  check(s.phase === 'rewinding' || s.phase === 'playing', 'R replays: the sequence runs back and starts again', s);
  await waitPhase(page, 'done');
  got = await read(page, false);
  matches(got, expected(OTHER), 'after the replay');

  // The mouse works as well as the keyboard.
  await page.click('#rail button[data-club="' + FEATURED + '"]', { timeout: 5000 });
  await waitSwap(page, FEATURED);
  await page.keyboard.press('Escape');
  await waitPhase(page, 'intro');
  await page.waitForTimeout(700);
  await page.click('#start', { timeout: 5000 });
  await page.waitForTimeout(300);
  s = await state(page);
  check(s.phase === 'playing' && s.club === FEATURED, 'Escape goes back to the opening; clicking Compare starts it again', s);
  check(log.length === 0, 'no errors or failed requests', log);
  await page.close();
}

async function reducedMotion(browser, base) {
  console.log('\nReduced motion, 1920 x 1080');
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const log = []; watch(page, log);
  await page.goto(base + '/' + PAGE);
  await waitPhase(page, 'intro', 20000);
  await page.waitForTimeout(800);
  const moving = await page.evaluate(() => new Promise((resolve) => {
    const s = window.ironStage, before = JSON.stringify(Array.prototype.map.call(document.querySelectorAll('.intro-title .w'), (w) => getComputedStyle(w).animationName));
    resolve({ reduced: s.state.reduced, wordAnimations: before });
  }));
  check(moving.reduced && !/word-in/.test(moving.wordAnimations), 'the page sees the reduced-motion setting and the headline does not animate', moving);
  await page.keyboard.press('Space');
  await page.waitForTimeout(450);
  let s = await state(page);
  check(s.phase === 'done', 'Space goes straight to the finished comparison', s);
  matches(await read(page, false), expected(FEATURED), FEATURED);
  await page.keyboard.press(keyFor(OTHER));
  await page.waitForTimeout(450);
  matches(await read(page, false), expected(OTHER), 'after switching to ' + OTHER);
  check(log.length === 0, 'no errors or failed requests', log);
  await ctx.close();
}

async function withoutWebGL(base) {
  console.log('\nWebGL switched off, 1920 x 1080');
  const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const log = []; watch(page, log);
  await page.goto(base + '/' + PAGE);
  await waitPhase(page, 'intro', 20000);
  await page.waitForTimeout(1500);
  const can = await page.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); });
  let s = await state(page);
  check(!can && s.renderer === 'flat', 'the browser has no WebGL and the page falls back to plain images', { webgl: can, renderer: s.renderer });
  const pics = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#flat img'), (i) => i.complete && i.naturalWidth > 0));
  check(pics.length === 4 && pics.every(Boolean), 'both clubs have their face and toe photos loaded', pics);
  await page.keyboard.press('Space');
  await waitPhase(page, 'done');
  await page.waitForTimeout(600);
  const got = await read(page, false);
  matches(got, expected(FEATURED), FEATURED);
  check(got.rings === BEATS.length * 2, 'the rings still land on the clubs', got.rings);
  await page.keyboard.press(keyFor(OTHER));
  await waitSwap(page, OTHER);
  await page.keyboard.press('r');
  await waitPhase(page, 'done');
  matches(await read(page, false), expected(OTHER), 'after switching to ' + OTHER + ' and replaying');
  check(log.length === 0, 'no errors or failed requests', log);
  await browser.close();
}

async function phone(browser, base) {
  console.log('\nPhone, 390 x 844, touch');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const log = []; watch(page, log);
  await page.goto(base + '/' + PAGE);
  await waitPhase(page, 'intro', 20000);
  await page.waitForTimeout(2500);
  let s = await state(page);
  check(s.flow, 'uses the scrolling layout', s);
  await page.tap('#start');
  await waitPhase(page, 'done');
  await page.waitForTimeout(900);
  let got = await read(page, true);
  matches(got, expected(FEATURED), FEATURED);
  check(!got.overflowX, 'no sideways scrolling');
  await page.tap('#rail button[data-club="' + OTHER + '"]');
  await waitSwap(page, OTHER);
  await page.waitForTimeout(300);
  matches(await read(page, true), expected(OTHER), 'after switching to ' + OTHER);
  check(log.length === 0, 'no errors or failed requests', log);
  await ctx.close();
}

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  console.log('Checking the stage demo: ' + A.brand + ' ' + A.name + ' vs ' + B.brand + ' ' + B.name + ', featured club ' + FEATURED + ', switching to ' + OTHER + '.');
  const counts = [];
  // The software renderer lets a machine without a graphics card still exercise the WebGL path.
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const p of PAGES) {
    PAGE = p;
    const before = { passed: passed, failed: failed };
    console.log('\n=== ' + PAGE + ' ===');
    try {
      await projector(browser, base);
      await reducedMotion(browser, base);
      await withoutWebGL(base);
      await phone(browser, base);
    } catch (err) {
      failed++;
      console.log('  FAIL  the check itself stopped: ' + (err && err.message ? err.message.split('\n')[0] : err));
    }
    counts.push(PAGE + ': ' + (passed - before.passed) + ' passed, ' + (failed - before.failed) + ' failed');
  }
  await browser.close();
  server.close();
  console.log('');
  counts.forEach((line) => console.log(line));
  console.log('\n' + passed + ' passed, ' + failed + ' failed.');
  process.exit(failed ? 1 : 0);
})();
