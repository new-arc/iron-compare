# Plan: Iron Compare, version 1

Written 2026-11-14 (Claude Code). Done means: a live public URL where the
Ping i230/i59 combo vs Wilson Staff Model Blade comparison shows every spec
club by club and real photos of both sets side by side, on phone and laptop.

Constraints: specs only from the Wilson page or my spec file; real
manufacturer photos only; no AI features, API keys or club search; free
hosting tier; `inputs/` left untouched.

| # | Step | Check | Result |
|---|---|---|---|
| 1 | Gather inputs: my spec file, Wilson spec chart + product details, manufacturer photos for both sets | Every number traced to a source; every photo viewed and labelled by what it shows | Passed |
| 2 | Check hosting access and pick a host | A host I can actually deploy to today, free tier | Passed: GitHub Pages (see Decisions) |
| 3 | Build `site/data/iron-sets.json`: one entry per set, same shape | Values match sources; missing values are `null` | Passed |
| 4 | Build the comparison page (works for any two sets in the data) | Table aligned by club, difference call-outs, photo pairs by angle | Passed |
| 5 | Test locally at phone and laptop widths | Numbers match sources, photos load, no layout breakage | Passed, after four small layout fixes |
| 6 | Deploy publicly | Live URL responds | Passed: https://new-arc.github.io/iron-compare/ |
| 7 | Open the live site and re-check specs and photos; update README | Live values match sources; all photos load | Passed: 56 of 56 Wilson cells match the Wilson page; Ping values match my file; 14 photos load. My file gained a Flex column mid-build (Stiff), picked up on the re-read and published |

## Decisions

- **Host: GitHub Pages.** Checked 2026-11-14: the Vercel command-line login
  has expired; the Vercel connector works but has no GitHub link and can only
  take files typed inline, which does not suit photos; GitHub (`gh`) is logged
  in and working. GitHub Pages is free and fits a static site. Step 2 (an AI
  research feature) will need server-side code and a secret key, which GitHub
  Pages cannot run, so the site will likely move to Vercel then.
- **No build tooling.** Plain HTML, CSS and JavaScript reading one JSON file.
  Nothing to install, nothing to break, and the data file is the only thing
  step 2 has to write.
- **Photos are stored with the site**, not hot-linked, so they keep working if
  the manufacturers move them. Untouched originals are in `source-photos/`.
- **Serial numbers are left out** of the data file because the site is public.

## Follow-up, 2026-11-14: fill the Ping gaps from Ping's charts

I approved using Ping's published spec charts for my set's lie, length,
bounce and offset.

| # | Step | Check | Result |
|---|---|---|---|
| 1 | Read Ping's i230 chart (live page) and i59 chart (page archived 16 Jun 2023) | Both charts read, with their footnotes | Passed |
| 2 | Add the values to the data file, tagged per club with their source | 24 values, each with a `from` entry | Passed |
| 3 | Mark them on the page with a dagger and a one-line explanation | Marks show in both table layouts | Passed |
| 4 | Test locally | No layout breakage at phone and laptop widths | Passed, after fixing a phone-width overlap on the longest value |
| 5 | Publish and re-check the live site against both charts | Live values match the charts | Passed: 24 of 24 match |

Decisions:

- Length and offset now show only the decimals the source gives (Ping's
  37 5/8" is shown as 37.625"), so no precision is implied that a chart does
  not state.
- `deploy.sh` now stamps a version on the script and stylesheet links. Reason:
  after this publish the browser kept the old script for several minutes
  while already loading the new data.
- Not filled: hand and grip. Ping's pages list what the model was offered
  in, which says nothing about my own clubs.

## Follow-up, 2026-11-14: stage demo for the PGA Show

Written 2026-11-14 (Claude Code). Done means: a page that can be projected at
1920 by 1080 in front of a large room, where the audience can tell what Iron
Compare does from the back row and then watch one real comparison play out in
under a minute, with the presenter choosing when it starts and able to replay
it.

Constraints: start from the existing site; keep its stack, addresses and data
file; real club data and real photos only; must still work on a phone, with
reduced motion, and without WebGL.

| # | Step | Check | Result |
|---|---|---|---|
| 1 | Run the existing site and walk through the comparison | Page loads, sets swap, no errors | Passed at 1920 by 1080 and 390 by 844 |
| 2 | Pick the comparison to feature | Both photos show the club being compared, and the differences are visible in a photo | 7 iron, i59 against Staff Model Blade: every photo in the file is a stock 7 iron. Loft 36° vs 34°, hosel offset 0.08" vs 0.065", bounce 8.0° vs 4.0° |
| 3 | Check the photos can carry the idea | A face view and a toe view of each head, same pose | All three heads have both. No 3D models exist, so the clubs are the photos |
| 4 | Move the shared value and wording code into `site/core.js` | The comparison page's output is unchanged | Passed: the page's markup is identical before and after, at both widths, before and after a swap |
| 5 | Build `stage.html`: one clock driving the canvas and the page | Cold load, start, switch club, replay | Passed with keyboard and with mouse |
| 6 | Projector layout | Nothing off screen, no text overlapping, at 1920 by 1080 | Passed. Also scales cleanly at 1280 by 720, 1366 by 768, 1024 by 768, 1440 by 800, 2560 by 1080 and 2560 by 1440 |
| 7 | Phone layout | Usable at 390 by 844 with touch, no sideways scrolling | Passed. Also checked at 820 by 1180 |
| 8 | Reduced motion | Compare goes straight to the finished comparison | Passed |
| 9 | No WebGL | Falls back to plain images and still plays | Passed in a browser started with WebGL switched off |
| 10 | Write the checks down so they can be re-run | `checks/check-data.js` and `checks/check-stage.js` | Passed: 68 of 68 |

Found and fixed while testing:

- The hidden middle column sat on top of the Compare button and swallowed
  mouse clicks. The keyboard worked, so only the real-time mouse run showed
  it. The check now tests that nothing covers the button.
- On a phone the two face-on clubs overlapped each other, and the two name
  plates sat at different heights.
- The first cut-out of the i59 photos had a ragged edge from JPEG speckle.

Decisions:

- **The clubs are photos, turned as a pair.** Each club is its face photo and
  its toe photo at right angles, turned together about the vertical. The
  face view is from the target and the toe view is from the toe, which is a
  true quarter turn apart, so the motion matches what the pictures show. The
  hero "back" photos were not used because the clubs in them are upside
  down relative to the toe photos.
- **No measuring lines drawn on the photos.** Read off the toe photos by
  eye, the faces sit at roughly 31° to 33°, which is the stock 7 iron and the
  camera's perspective, not my 36°. A line drawn at 36° would not lie along the face.
  So the photos carry rings and labels only, and the comparison is made on
  rulers drawn from the numbers.
- **Rulers, not angle fans.** A true 2° wedge is about 5 pixels wide at the
  size that fits. On a linear ruler the same 2° is easy to see from a
  distance, and nothing has to be exaggerated.
- **One sequence, fixed timing.** 12.2 seconds, the same every time, so it
  can be rehearsed. Everything on screen is worked out from one clock, so
  Replay is that clock running backwards and then forwards.
- **Borrowed from Lusion's site** (via the teardown at
  rickcreates.com/r/2023-10-02-lusion-v3): one full-window canvas behind the
  HTML, fitted every frame to boxes in the page layout; one progress value
  that the picture and the text both read, so it can run backwards; the
  slow-start, long-settle easing curve; and a cap on how many pixels the
  canvas draws. Not borrowed: scroll-driven motion, sound, and the
  post-processing chain, none of which a presenter can control live.
- **Three.js is stored in the repository**, not loaded from a CDN, because
  the venue's network is not something to rely on.

Not done:

- Not deployed. `./deploy.sh` was changed to stamp `stage.html` as well, but
  was not run.
- Not seen on a real graphics card or a projector. See Known gaps in the
  README.

