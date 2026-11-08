#!/bin/sh
# test-qed.sh — get the latest QED HQ test version and open it, in one go.
#
#   ./test-qed.sh                       -> the working branch (default below)
#   ./test-qed.sh some-other-branch     -> another branch
#
# What it does: downloads the latest version of the branch, switches to it,
# starts the local test server and opens http://localhost:8001 in your browser.
# Stop it with Ctrl + C. Log in with your password (the login link doesn't
# work on localhost).

set -e
BRANCH="${1:-claude/sweet-wright-ys4yuh}"
cd "$(dirname "$0")"

echo "Getting the latest version of $BRANCH…"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

# Open the browser a second after the server starts (Mac: open, Linux: xdg-open).
( sleep 1; open http://localhost:8001 2>/dev/null || xdg-open http://localhost:8001 2>/dev/null || true ) &

cd qed
exec python3 serve.py
