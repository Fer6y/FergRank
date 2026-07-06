#!/usr/bin/env bash
# Local weekly UFC ingest — the launchd-run equivalent of the GitHub Action
# (.github/workflows/weekly-update.yml). Ingestion was MOVED off GitHub-hosted
# runners because Sherdog's anti-bot blocks their datacenter IPs (the crawl 403s
# from CI but succeeds from a residential IP). This runs the SAME weeklyUpdate.ts
# pipeline on your Mac, then commits + pushes the refreshed data so Vercel
# redeploys. Scheduled by com.fergrank.weekly-ingest.plist in ~/Library/LaunchAgents.
#
# Test manually (no crawl, no commit):  scripts/sherdog/weeklyIngestLocal.sh --dry
# Full run now:                         scripts/sherdog/weeklyIngestLocal.sh
set -euo pipefail

# Resolve the app dir (ufc-rankings/) from this script's own location — no
# machine-specific paths baked in, so the repo can move.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$APP_DIR"

# launchd hands jobs a minimal PATH — make node/npm/git reachable.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# Polite crawler contact advertised in the Sherdog User-Agent (edit if you like).
export SHERDOG_CONTACT="${SHERDOG_CONTACT:-scott.ferguson.14@hotmail.com}"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "════════ weekly ingest $(date -u +%Y-%m-%dT%H:%M:%SZ) ════════"
echo "repo: $APP_DIR   branch: $BRANCH"
[ "$BRANCH" = "main" ] || echo "⚠  not on main — commit will land on '$BRANCH'."

# 1. Run the ingest pipeline (crawl + regenerate data). Passthrough args (--dry etc).
node_modules/.bin/jiti scripts/sherdog/weeklyUpdate.ts "$@"

# --dry only prints the plan; nothing was regenerated, so there's nothing to commit.
case " $* " in *" --dry "*) echo "dry run — skipping ages refresh + commit."; exit 0 ;; esac

# 2. Self-healing DOB coverage (non-fatal, mirrors the Action's ages step).
node_modules/.bin/jiti scripts/registry/buildAges.ts --fetch \
  || echo "⚠  ages refresh failed (non-fatal) — fighter_dob.csv left as-is."

# 3. Commit + push the refreshed data (same file set as the GitHub Action).
git add data/recent_ufc_fights.csv \
        data/official_rankings.csv \
        data/upcoming_fights.csv \
        data/sherdog_crosswalk.csv \
        data/sherdog_crosswalk_review.csv \
        data/canonical/fighter_dob.csv \
        data/canonical/ages_coverage.txt \
        data/golden/rankings_snapshot.json 2>/dev/null || true

if git diff --cached --quiet; then
  echo "No data changes this week — nothing to commit."
else
  git commit -m "chore(data): weekly UFC ingest $(date -u +%Y-%m-%d)"
  # Non-fatal: if the remote moved ahead, leave the commit for manual resolution
  # rather than failing the whole job.
  git push || echo "⚠  push failed (remote ahead?) — commit is local; resolve manually."
  echo "committed + pushed → Vercel redeploys."
fi
echo "════════ done $(date -u +%Y-%m-%dT%H:%M:%SZ) ════════"
