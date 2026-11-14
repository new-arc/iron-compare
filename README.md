# Iron Compare

A website that compares two sets of golf irons side by side: a club-by-club
spec table and real photos of both sets.

**Live site:** https://new-arc.github.io/iron-compare/

**Status (2026-11-14):** version 1 is live. The first comparison is my Ping
i230/i59 combo against the Wilson Staff Model Blade. Checked on the live site
the same day: all 56 Wilson spec cells match Wilson's page, the Ping loft and
swing weight match my spec file, the 24 Ping lie, length, bounce and offset
values match Ping's published charts, and all 14 photos load at phone and
laptop widths.

## What's here

| Path | What it is |
|---|---|
| `site/` | The website. Plain HTML, CSS and JavaScript, no build step |
| `site/data/iron-sets.json` | All club data: one entry per iron set, same shape for each. The page works for any two sets in this file |
| `site/photos/` | Web-sized manufacturer photos used by the site |
| `site/stage.html` | The stage demo: one club from each set, side by side, for a projector. See "Stage demo" below |
| `site/stage.js`, `site/stage-gl.js`, `site/stage.css` | The stage demo's script, its WebGL layer and its styles |
| `site/core.js` | Value formatting and difference wording, shared by the comparison page and the stage demo |
| `site/vendor/`, `site/fonts/` | Three.js and two fonts, stored with the site so the stage demo needs no internet |
| `checks/` | Two checks to run before a demo or after a data change. See "Checks" below |
| `source-photos/` | The untouched original photo downloads (this computer only) |
| `deploy.sh` | Publishes `site/` to the live URL |
| `PLAN.md` | The build plan, step results and decisions |
| `PROMPT.md`, `inputs/` | The original build prompt and inputs folder (this computer only) |

## Changing the site

1. Edit files in `site/`. To add or correct a set, edit
   `site/data/iron-sets.json`. Use `null` for anything a source does not
   give; the page shows a dash and lists it under Missing data.
2. Preview locally: `python3 -m http.server 4173 --directory site`, then open
   http://localhost:4173.
3. Commit, then run `./deploy.sh`. The live site updates in about a minute.
   The script stamps a version number on the script and stylesheet links of
   both pages (and commits that) so browsers load the new files straight away.

## Stage demo

`site/stage.html` is a version of the comparison built to be projected: two
irons hang side by side, turn to the same toe-on view, and three differences
(loft, hosel offset, bounce) appear next to the part of the club they belong
to. It opens on my Ping i59 7 iron against the Wilson Staff Model Blade
7 iron, because every photo in the data file is a stock 7 iron, so that is the
one comparison where both pictures show the club being compared.

Run it from the repository root, then open the address:

```
python3 -m http.server 4173 --directory site
```

http://localhost:4173/stage.html

Everything it needs is in `site/`, so it runs with no internet connection.

| Control | What it does |
|---|---|
| `Space`, `Enter`, `→`, `Page Down`, or the Compare button | Start the comparison. Once it has finished, the same keys replay it. Ignored while it is playing, so a double press is safe |
| `R`, or the Replay button | Run the comparison back and play it again |
| `5` `6` `7` `8` `9` `P`, or the club buttons | Change club. `5` and `6` switch the Ping side to the i230 head |
| `Esc`, `←`, `Page Up` | Back to the opening screen |
| `F` | Full screen on and off |

The whole sequence takes 12.2 seconds. A presenter's clicker sends
`Page Down` and `Page Up`, so it can start, replay and reset.

What it is honest about:

- The clubs are the manufacturers' own face and toe photos, not 3D models.
  Each club is its two photos set at right angles and turned as one, so the
  turn is a real quarter turn of two real pictures. Nothing is drawn or
  estimated on top of them.
- The rings on the clubs mark a part (face, hosel, sole). Their positions
  were read off each photo by eye and are stored in the data file under the
  photo group's `stage` block. They are positions in a picture, not specs.
- Every number comes from the data file through the same code as the
  comparison page, daggers included. The rulers in the middle are plain
  linear scales with their ends labelled; nothing is exaggerated.
- The 5 and 6 irons show Ping's i230 photo, which is a stock 7 iron. The
  line at the bottom of the screen says so.

How it adapts:

- On a phone or a tall, narrow window it becomes an ordinary scrolling page
  with numbered pins on the clubs instead of leader lines.
- With the "reduce motion" setting on, Compare goes straight to the finished
  comparison with a short fade. Add `?motion=reduce` to the address to try it.
- If the browser cannot do WebGL, plain images take the canvas's place and
  the same sequence plays. Add `?gl=0` to the address to try it.
- Add `?t=6.5` to hold the sequence at one moment, for checking a layout.
- `?a=`, `?b=` and `?club=` choose the sets and club, the same way the
  comparison page's address does.

To change what it opens on, or which specs it walks through, edit the
`stage` block at the top of `site/data/iron-sets.json`.

## Checks

Run both from the repository root before a demo, and after changing the data
file or the stage demo.

```
node checks/check-data.js
```

No setup. Checks that the data file is shaped the way the pages expect, that
every photo it names is on disk, and that the stage settings point at sets,
clubs, fields and photo anchors that exist.

```
node checks/check-stage.js
```

Needs Playwright (`npm install --no-save playwright && npx playwright install chromium`).
Opens the stage demo in a real browser four ways (1920 by 1080, reduced
motion, WebGL switched off, a phone), presses the same keys a presenter
would, and compares every value and difference on screen with the data file.
Takes about a minute and a half.

## Hosting

GitHub Pages, free tier, from the public repository
https://github.com/new-arc/iron-compare (the `gh-pages` branch holds the
published copy of `site/`). Chosen on 2026-11-14 because GitHub was the login
that worked; the Vercel command-line login had expired. See `PLAN.md`.

The repository is public, so `PROMPT.md`, `inputs/` and `source-photos/` are
kept out of it, and my club serial numbers are not in the data file.

## Decisions

- Version 1 has no AI features. Step 2 (later) adds a model that researches
  any named clubs and pre-populates specs and photos, so club data is kept in
  a separate structured file from the start. Step 2 will need server-side
  code and a secret key, which GitHub Pages cannot run, so expect to move
  hosting to Vercel then.
- Specs come only from the manufacturer page or my file; missing values show
  as "—" rather than being estimated.
- Exception I approved on 2026-11-14: my Ping set's lie, length, bounce and
  offset come from Ping's own published spec charts (the i230 page, and the
  i59 page as archived 16 Jun 2023), because my file has no numbers for them.
  The site marks these values with a dagger (†). They are Ping's design
  specs for the stock heads, not measurements of my clubs. In the data file
  each club's `from` map records which source a value came from.
- Photos are real manufacturer product photos of the actual models only. An
  angle with no real photo is left as an empty slot.

- Stage demo (2026-11-14): the stage is a separate page, `stage.html`, and
  the comparison page is unchanged apart from a link to it. It keeps the
  no-build approach: plain files, with Three.js and two fonts stored in
  `site/` so a venue with no internet cannot break it. The fonts are bundled
  so the screen looks the same on any computer; the comparison page still
  uses the computer's own fonts.
- The stage opens on the 7 iron because all three heads were photographed as
  stock 7 irons. It walks through loft, hosel offset and bounce because those
  are the three specs you can see in a toe-on photo.
- My i59 photos have a white background, which would show as a white square
  on the dark stage. `site/photos/ping-i59/face-cutout.webp` and
  `toe-cutout.webp` are the same two Ping photos with the background removed
  and the picture enlarged to twice its size. The originals are untouched.

## Known gaps (2026-11-14)

- My spec file has no grip or shaft material. Head material and finish for
  my Ping heads come from Ping's own product pages as archived 16 Jun 2023
  (added 2026-11-14 at my request); right-handed is from me.
- Ping says bounce varies slightly with non-standard lofts. My clubs are at
  Retro Spec lofts, so the chart bounce is close but not exact. Nothing was
  adjusted.
- My file lists swing weight E4 on every club; Ping's charts list D1 to D2 as
  standard. I confirmed E4 is correct on 2026-11-14.
- My lofts equal Ping's i59 Retro Spec lofts on every club, including the two
  i230s (Ping's i230 Retro Spec chart says 28.0° and 31.5° for the 5 and 6).
- Ping publishes no sole photo of the i59 or the i230.
- Ping has removed its i59 page; those four photos are Ping's own images from
  an archived copy of that page (16 Jun 2023) and are smaller (708 px).
- Wilson's chart marks the 3 iron and "RH/LH" with an asterisk that the page
  never explains.
- The stage demo is not on the live site until `./deploy.sh` is next run.
- The stage demo has been tested in headless Chromium only, where WebGL runs
  in software at about 15 frames a second. It has not yet been watched on a
  real graphics card, a projector, Safari or Firefox.
- The i59 photos are 708 pixels wide, so on the stage the i59 looks a little
  softer than the Wilson and the i230.
