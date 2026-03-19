#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gw sync — Re-sync current branch with its base (without pushing)
# Useful when base branch has moved and you want to update mid-work
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

CURRENT=$(current_branch)

if [[ "$CURRENT" == "$PROD_BRANCH" || "$CURRENT" == "$QA_BRANCH" ]]; then
  info "Pulling latest $CURRENT..."
  git pull "$REMOTE" "$CURRENT" --ff-only
  success "$CURRENT is up to date"
  exit 0
fi

if echo "$CURRENT" | grep -q "^hotfix/"; then
  BASE_BRANCH="$PROD_BRANCH"
else
  BASE_BRANCH="$QA_BRANCH"
fi

echo ""
info "Syncing ${BOLD}$CURRENT${RESET} with $BASE_BRANCH..."

require_clean_or_stash

git fetch "$REMOTE" --prune --quiet

BEHIND=$(git rev-list --count "$CURRENT".."$REMOTE/$BASE_BRANCH" 2>/dev/null || echo "0")

if [[ "$BEHIND" == "0" ]]; then
  success "Already up to date with $BASE_BRANCH"
else
  info "$BASE_BRANCH has $BEHIND new commit(s). Rebasing..."
  if ! git rebase "$REMOTE/$BASE_BRANCH" --quiet; then
    error "Rebase conflict. Resolve manually:"
    git diff --name-only --diff-filter=U | sed 's/^/    /'
    echo ""
    echo "  git add <files> && git rebase --continue"
    exit 1
  fi
  success "Rebased onto $BASE_BRANCH ($BEHIND commit(s) integrated)"
fi

restore_stash_if_needed
