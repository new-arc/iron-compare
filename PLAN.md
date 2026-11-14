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
