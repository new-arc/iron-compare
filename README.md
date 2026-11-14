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
   The script stamps a version number on the script and stylesheet links (and
   commits that) so browsers load the new files straight away.

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
