# Iron Compare

A website that compares two sets of golf irons side by side: a club-by-club
spec table and real photos of both sets.

**Live site:** https://new-arc.github.io/iron-compare/

**Status (2026-11-14):** version 1 is live. The first comparison is my Ping
i230/i59 combo against the Wilson Staff Model Blade. Checked on the live site
the same day: all 56 Wilson spec cells match Wilson's page, the Ping values
match my spec file, and all 14 photos load at phone and laptop widths.

## What's here

| Path | What it is |
|---|---|
| `site/` | The website. Plain HTML, CSS and JavaScript, no build step |
| `site/data/iron-sets.json` | All club data: one entry per iron set, same shape for each. The page works for any two sets in this file |
| `site/photos/` | Web-sized manufacturer photos used by the site |
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
- Photos are real manufacturer product photos of the actual models only. An
  angle with no real photo is left as an empty slot.

## Known gaps (2026-11-14)

- My spec file has no lie in degrees (only color code Black), no length in
  inches (only "std"), and no bounce, offset, hand or grip. So only loft and
  swing weight can be compared club by club.
- Ping publishes no sole photo of the i59 or the i230.
- Ping has removed its i59 page; those four photos are Ping's own images from
  an archived copy of that page (16 Jun 2023) and are smaller (708 px).
- Wilson's chart marks the 3 iron and "RH/LH" with an asterisk that the page
  never explains.
