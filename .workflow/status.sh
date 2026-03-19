#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gw status — Show current workflow state at a glance
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

CURRENT=$(current_branch)

echo ""
bold "  Workflow Status"
divider

git fetch "$REMOTE" --prune --quiet 2>/dev/null || true

# ─── Current branch ──────────────────────────────────────────────────────────

if echo "$CURRENT" | grep -q "^hotfix/"; then
  BASE_BRANCH="$PROD_BRANCH"
  ENV_LABEL="Production (hotfix)"
elif [[ "$CURRENT" == "$PROD_BRANCH" ]]; then
  BASE_BRANCH="$PROD_BRANCH"
  ENV_LABEL="Production"
elif [[ "$CURRENT" == "$QA_BRANCH" ]]; then
  BASE_BRANCH="$QA_BRANCH"
  ENV_LABEL="QA/Staging"
else
  BASE_BRANCH="$QA_BRANCH"
  ENV_LABEL="Feature → QA"
fi

info "Branch:       ${BOLD}$CURRENT${RESET}"
info "Environment:  $ENV_LABEL"
info "Base:         $BASE_BRANCH"

# ─── Sync state ──────────────────────────────────────────────────────────────

if [[ "$CURRENT" != "$PROD_BRANCH" && "$CURRENT" != "$QA_BRANCH" ]]; then
  BEHIND=$(git rev-list --count "$CURRENT".."$REMOTE/$BASE_BRANCH" 2>/dev/null || echo "0")
  AHEAD=$(git rev-list --count "$REMOTE/$BASE_BRANCH".."$CURRENT" 2>/dev/null || echo "0")

  if [[ "$BEHIND" -gt 0 ]]; then
    warn "Behind $BASE_BRANCH by $BEHIND commit(s) — run: gw sync"
  else
    success "Up to date with $BASE_BRANCH"
  fi

  if [[ "$AHEAD" -gt 0 ]]; then
    info "Ahead of $BASE_BRANCH by $AHEAD commit(s)"
  fi
fi

# ─── Working tree ────────────────────────────────────────────────────────────

echo ""
if ! git diff --quiet || ! git diff --cached --quiet; then
  warn "Uncommitted changes:"
  git status --short | sed 's/^/    /'
else
  success "Working tree clean"
fi

# ─── Recent commits ──────────────────────────────────────────────────────────

echo ""
info "Recent commits on this branch:"
git log "$REMOTE/$BASE_BRANCH".."$CURRENT" --oneline --no-decorate 2>/dev/null | \
  head -8 | sed 's/^/    /' || echo "    (none)"

# ─── Environment branches ────────────────────────────────────────────────────

echo ""
divider
info "Environment branches:"

QA_HASH=$(git rev-parse --short "$REMOTE/$QA_BRANCH" 2>/dev/null || echo "not found")
PROD_HASH=$(git rev-parse --short "$REMOTE/$PROD_BRANCH" 2>/dev/null || echo "not found")
QA_BEHIND=$(git rev-list --count "$REMOTE/$QA_BRANCH".."$REMOTE/$PROD_BRANCH" 2>/dev/null || echo "?")

echo "    $QA_BRANCH    → $QA_HASH"
echo "    $PROD_BRANCH  → $PROD_HASH"

if [[ "$QA_BEHIND" != "0" && "$QA_BEHIND" != "?" ]]; then
  warn "$PROD_BRANCH is $QA_BEHIND commit(s) ahead of $QA_BRANCH (QA not yet promoted)"
fi

echo ""
