#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gw start — Start a new request branch
#
# Usage:
#   gw start feature/user-auth
#   gw start fix/login-bug
#   gw start hotfix/critical-payment-error
#   gw start feature/GCO-42-add-mfa
#
# Behavior:
#   - Determines base branch (hotfix → main, everything else → qa)
#   - Fetches latest remote state
#   - Updates base branch
#   - Creates new working branch
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# ─── Input ───────────────────────────────────────────────────────────────────

BRANCH_NAME="${1:-}"

if [[ -z "$BRANCH_NAME" ]]; then
  echo ""
  bold "  Start a new request branch"
  divider
  echo "  Usage: gw start <type>/<description>"
  echo ""
  echo "  Types:  feature/  fix/  hotfix/  chore/  docs/"
  echo "  Examples:"
  echo "    gw start feature/add-mfa"
  echo "    gw start fix/login-redirect"
  echo "    gw start hotfix/payment-crash"
  echo "    gw start feature/GCO-42-booking-wizard"
  echo ""
  exit 1
fi

# Validate naming convention
if ! echo "$BRANCH_NAME" | grep -qE '^(feature|fix|hotfix|chore|docs)/[a-z0-9][a-z0-9\-]*$'; then
  error "Branch name must match: (feature|fix|hotfix|chore|docs)/<lowercase-slug>"
  error "Got: $BRANCH_NAME"
  exit 1
fi

# ─── Determine base branch ───────────────────────────────────────────────────

if echo "$BRANCH_NAME" | grep -q "^hotfix/"; then
  BASE_BRANCH="$PROD_BRANCH"
  warn "Hotfix detected — branching from ${BOLD}$PROD_BRANCH${RESET}"
else
  BASE_BRANCH="$QA_BRANCH"
fi

# ─── Guard: don't start if already on a feature branch with changes ──────────

CURRENT=$(current_branch)
if [[ "$CURRENT" != "$PROD_BRANCH" && "$CURRENT" != "$QA_BRANCH" ]]; then
  if ! git diff --quiet || ! git diff --cached --quiet; then
    warn "You are on '$CURRENT' with uncommitted changes."
    error "Commit or push your current work before starting a new request."
    exit 1
  fi
fi

# ─── Check branch doesn't already exist ──────────────────────────────────────

if branch_exists_local "$BRANCH_NAME"; then
  warn "Branch '$BRANCH_NAME' already exists locally."
  if confirm "Switch to it instead of creating a new one?"; then
    git checkout "$BRANCH_NAME"
    success "Switched to existing branch: $BRANCH_NAME"
    exit 0
  else
    exit 1
  fi
fi

# ─── Fetch & update base branch ──────────────────────────────────────────────

echo ""
bold "  Starting: $BRANCH_NAME"
divider
info "Fetching remote state..."
git fetch "$REMOTE" --prune --quiet

# Ensure base branch exists locally
if ! branch_exists_local "$BASE_BRANCH"; then
  info "Creating local tracking branch for $BASE_BRANCH..."
  git checkout -b "$BASE_BRANCH" "$REMOTE/$BASE_BRANCH" --quiet 2>/dev/null || true
fi

# Update base branch
info "Updating $BASE_BRANCH from $REMOTE..."
CURRENT=$(current_branch)
if [[ "$CURRENT" == "$BASE_BRANCH" ]]; then
  git pull "$REMOTE" "$BASE_BRANCH" --ff-only --quiet
else
  git fetch "$REMOTE" "$BASE_BRANCH:$BASE_BRANCH" --quiet 2>/dev/null || \
    git fetch "$REMOTE" "$BASE_BRANCH" --quiet
fi

success "$BASE_BRANCH is up to date"

# ─── Create working branch ───────────────────────────────────────────────────

git checkout -b "$BRANCH_NAME" "$BASE_BRANCH"

echo ""
success "Branch created: ${BOLD}$BRANCH_NAME${RESET}"
info  "Base:           $BASE_BRANCH"
info  "Environment:    $([ "$BASE_BRANCH" == "$PROD_BRANCH" ] && echo "Production (hotfix)" || echo "QA")"
echo ""
bold  "  You're ready to work. When done, run:  gw push"
echo ""
