# Iron Compare

A website that compares two sets of golf irons side by side: a club-by-club
spec table and real photos of both sets.

**Status (2026-11-14):** folder set up, nothing built yet. No code, no
deployment, no live URL.

## Done means

A live public URL where the first comparison (my irons against the Wilson
Staff Model Blade) shows every spec for both sets club by club and real
photos of both sets next to each other, on phone and laptop.

## What's here

| Path | What it is |
|---|---|
| `PROMPT.md` | The build prompt to paste into a new session |
| `inputs/my-clubs/` | Put the spec file for my clubs here |
| `inputs/my-clubs/photos/` | Put photos of my clubs here (optional; the alternative is manufacturer product photos) |

## Before building

1. Drop the spec file for my clubs into `inputs/my-clubs/`.
2. Fill in the make/model/year and the photo choice in `PROMPT.md`.

## Decisions

- Version 1 has no AI features. Step 2 (later) adds a model that researches
  any named clubs and pre-populates specs and photos, so club data is kept in
  a separate structured file from the start.
- Specs come only from the manufacturer page or my file; missing values show
  as "—" rather than being estimated.
- Photos are real photos of the actual models only.
