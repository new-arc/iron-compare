#!/bin/sh
# Publishes the site/ folder to GitHub Pages (the gh-pages branch).
# Commit your changes first, then run:  ./deploy.sh
set -e
cd "$(dirname "$0")"
git push origin main
git subtree push --prefix site origin gh-pages
