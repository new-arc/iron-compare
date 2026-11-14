#!/bin/sh
# Publishes the site/ folder to GitHub Pages (the gh-pages branch).
# Commit your changes first, then run:  ./deploy.sh
set -e
cd "$(dirname "$0")"

# Stamp the script and stylesheet links so browsers fetch the new versions
# straight away instead of using a cached copy for up to ten minutes.
STAMP=$(date +%Y%m%d%H%M%S)
sed -i '' "s/?v=[0-9]*/?v=$STAMP/g" site/index.html site/stage.html
git add site/index.html site/stage.html
git commit -q -m "Stamp asset version $STAMP" || true

git push origin main
git subtree push --prefix site origin gh-pages
