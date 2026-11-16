#!/usr/bin/env node
/* Checks site/data/iron-sets.json for the things the stage demo relies on.
   No dependencies. Run from the repository root:

       node checks/check-data.js

   It does not judge the spec numbers themselves. It checks that the file is
   shaped the way the pages expect, that every photo it names is on disk, and
   that the stage settings point at sets, clubs, fields and photo anchors
   that exist. */

'use strict';

const fs = require('fs');
const path = require('path');

const site = path.join(__dirname, '..', 'site');
const data = JSON.parse(fs.readFileSync(path.join(site, 'data', 'iron-sets.json'), 'utf8'));

const problems = [];
const notes = [];
const bad = (msg) => problems.push(msg);
const isNum = (v) => typeof v === 'number' && isFinite(v);
const onDisk = (file) => fs.existsSync(path.join(site, file));
const frac = (v) => isNum(v) && v >= 0 && v <= 1;

const fields = {};
(data.specFields || []).forEach((f) => { fields[f.key] = f; });
const sets = {};
(data.sets || []).forEach((s) => { sets[s.id] = s; });

if ((data.sets || []).length < 2) bad('The file needs at least two sets.');

/* ---------- every set ---------- */

(data.sets || []).forEach((set) => {
  const where = 'Set "' + set.id + '"';
  ['id', 'brand', 'name'].forEach((k) => { if (!set[k]) bad(where + ' has no ' + k + '.'); });
  const sourceIds = (set.sources || []).map((s) => s.id);

  (set.clubs || []).forEach((club) => {
    if ((data.clubOrder || []).indexOf(club.club) === -1) bad(where + ': club "' + club.club + '" is not in clubOrder.');
    Object.keys(club.specs || {}).forEach((key) => {
      const f = fields[key];
      if (!f) { bad(where + ' club ' + club.club + ': "' + key + '" is not a spec field.'); return; }
      const v = club.specs[key];
      if (v != null && f.type === 'number' && !isNum(v)) bad(where + ' club ' + club.club + ': ' + key + ' should be a number or null.');
    });
    Object.keys(club.from || {}).forEach((key) => {
      if (sourceIds.indexOf(club.from[key]) === -1) bad(where + ' club ' + club.club + ': source "' + club.from[key] + '" for ' + key + ' is not listed.');
    });
    if (club.head && !(set.photoGroups || []).some((g) => g.id === club.head || g.label === club.head)) {
      bad(where + ' club ' + club.club + ': head "' + club.head + '" has no photo group, so the stage cannot pick its photos.');
    }
  });

  (set.photoGroups || []).forEach((group) => {
    const gw = where + ' photos "' + group.id + '"';
    Object.keys(group.photos || {}).forEach((angle) => {
      const photo = group.photos[angle];
      if (photo && !onDisk(photo.file)) bad(gw + ': ' + photo.file + ' is missing.');
    });

    const st = group.stage;
    if (!st) { notes.push(gw + ' has no stage block: the stage will show its numbers without a club picture.'); return; }
    ['face', 'toe'].forEach((view) => {
      const part = st[view];
      if (!part) { bad(gw + ': stage.' + view + ' is missing.'); return; }
      const file = part.file || (group.photos[view] && group.photos[view].file);
      if (!file) bad(gw + ': no ' + view + ' photo for the stage.');
      else if (!onDisk(file)) bad(gw + ': ' + file + ' is missing.');
      const h = part.head;
      if (!Array.isArray(h) || h.length !== 4 || !h.every(frac) || h[0] >= h[2] || h[1] >= h[3]) {
        bad(gw + ': stage.' + view + '.head should be [left, top, right, bottom] as fractions of the image.');
      }
    });
    const anchors = (st.toe && st.toe.anchors) || {};
    Object.keys(anchors).forEach((name) => {
      const a = anchors[name];
      if (!Array.isArray(a) || a.length !== 2 || !a.every(frac)) bad(gw + ': anchor "' + name + '" should be [x, y] as fractions of the image.');
    });
    ((data.stage && data.stage.beats) || []).forEach((beat) => {
      if (!anchors[beat.anchor]) bad(gw + ': no "' + beat.anchor + '" anchor, which the ' + beat.key + ' callout attaches to.');
    });
  });
});

/* ---------- the stage settings ---------- */

const stage = data.stage;
if (!stage) {
  bad('There is no "stage" block.');
} else {
  const feat = stage.featured || {};
  const A = sets[feat.a], B = sets[feat.b];
  if (!A) bad('stage.featured.a ("' + feat.a + '") is not a set.');
  if (!B) bad('stage.featured.b ("' + feat.b + '") is not a set.');
  if (A && B) {
    const has = (set, club) => (set.clubs || []).some((c) => c.club === club);
    if (!has(A, feat.club) || !has(B, feat.club)) bad('stage.featured.club ("' + feat.club + '") is not in both featured sets.');
    else {
      const a = A.clubs.filter((c) => c.club === feat.club)[0], b = B.clubs.filter((c) => c.club === feat.club)[0];
      (stage.beats || []).forEach((beat) => {
        if (!isNum(a.specs[beat.key]) || !isNum(b.specs[beat.key])) {
          bad('The featured comparison has no number for ' + beat.key + ' on both clubs, so that beat would show a dash.');
        }
      });
    }
  }
  if (!(stage.beats || []).length) bad('stage.beats is empty.');
  (stage.beats || []).forEach((beat) => {
    const f = fields[beat.key];
    if (!f) bad('stage beat "' + beat.key + '" is not a spec field.');
    else if (f.type !== 'number') bad('stage beat "' + beat.key + '" must be a number field.');
    if (['zero', 'data'].indexOf(beat.ruler) === -1) bad('stage beat "' + beat.key + '": ruler should be "zero" or "data".');
  });
  (stage.also || []).forEach((key) => { if (!fields[key]) bad('stage.also "' + key + '" is not a spec field.'); });
}

/* ---------- the files the stage page loads ---------- */

['stage.html', 'stage.css', 'stage.js', 'stage-gl.js', 'core.js', 'vendor/three.module.min.js', 'vendor/three.core.min.js',
  'fonts/inter-latin-wght-normal.woff2', 'fonts/source-serif-4-latin-wght-normal.woff2', 'fonts/source-serif-4-latin-wght-italic.woff2']
  .forEach((file) => { if (!onDisk(file)) bad('site/' + file + ' is missing.'); });

notes.forEach((n) => console.log('note: ' + n));
if (problems.length) {
  problems.forEach((p) => console.error('FAIL: ' + p));
  console.error('\n' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') + ' in site/data/iron-sets.json.');
  process.exit(1);
}
console.log('Data check passed: ' + data.sets.length + ' sets, ' +
  data.sets.reduce((n, s) => n + s.clubs.length, 0) + ' clubs, ' +
  data.sets.reduce((n, s) => n + (s.photoGroups || []).length, 0) + ' photo groups, ' +
  ((stage && stage.beats) || []).length + ' stage beats.');
