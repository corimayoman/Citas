#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gw push — Sync, validate, and push the current branch
#
# Flow:
#   1. Detect current branch and its base
#   2. Fetch latest remote state
#   3. Rebase onto base branch (detect conflicts early)
#   4. Run validations
#   5. Single confirmation → push
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

SKIP_VALIDATION="${SKIP_VALIDATION:-false}"

# ─── Guards ──────────────────────────────────────────────────────────────────

CURRENT=$(current_branch)

if [[ "$CURRENT" == "$PROD_BRANCH" || "$CURRENT" == "$QA_BRANCH" ]]; then
  error "You are on a protected branch ($CURRENT). Push directly to protected branches is not allowed."
  error "Use 'gw promote' to merge into $QA_BRANCH or $PROD_BRANCH."
  exit 1
fi

if git diff --quiet && git diff --cached --quiet; then
  # Check if there's anything to push vs remote
  if branch_exists_remote "$CURRENT"; then
    AHEAD=$(git rev-list --count "$REMOTE/$CURRENT".."$CURRENT" 2>/dev/null || echo "0")
    if [[ "$AHEAD" == "0" ]]; then
      warn "Nothing to push — branch is up to date with remote."
      exit 0
    fi
  else
    warn "No local commits to push yet."
    exit 0
  fi
fi

# ─── Determine base branch ───────────────────────────────────────────────────

if echo "$CURRENT" | grep -q "^hotfix/"; then
  BASE_BRANCH="$PROD_BRANCH"
else
  BASE_BRANCH="$QA_BRANCH"
fi

echo ""
bold "  Preparing push: ${CURRENT}"
divider
info "Base branch:  $BASE_BRANCH"
info "Remote:       $REMOTE"
echo ""

# ─── Fetch latest ────────────────────────────────────────────────────────────

info "Fetching remote state..."
git fetch "$REMOTE" --prune --quiet
success "Remote state updated"

# ─── Check if base branch has new commits ────────────────────────────────────

BASE_BEHIND=$(git rev-list --count "$CURRENT".."$REMOTE/$BASE_BRANCH" 2>/dev/null || echo "0")
BRANCH_AHEAD=$(git rev-list --count "$REMOTE/$BASE_BRANCH".."$CURRENT" 2>/dev/null || echo "0")

if [[ "$BASE_BEHIND" -gt 0 ]]; then
  warn "$BASE_BRANCH has $BASE_BEHIND new commit(s) since you branched."
  info "Rebasing $CURRENT onto $REMOTE/$BASE_BRANCH..."
  echo ""

  # Attempt rebase
  if ! git rebase "$REMOTE/$BASE_BRANCH" --quiet; then
    echo ""
    error "Rebase conflict detected."
    echo ""
    echo "  Conflicting files:"
    git diff --name-only --diff-filter=U | sed 's/^/    /'
    echo ""
    warn "Resolve conflicts, then run:"
    echo "    git add <files>"
    echo "    git rebase --continue"
    echo "    gw push"
    echo ""
    exit 1
  fi

  success "Rebase complete — branch is up to date with $BASE_BRANCH"
else
  success "Branch is already up to date with $BASE_BRANCH"
fi

# ─── Validations ─────────────────────────────────────────────────────────────

if [[ "$SKIP_VALIDATION" != "true" ]]; then
  "$SCRIPT_DIR/validate.sh" || exit 1
fi

# ─── Summary before confirmation ─────────────────────────────────────────────

echo ""
divider
bold "  Push summary"
divider

info "Branch:       $CURRENT"
info "Base:         $BASE_BRANCH"
info "Commits:      $BRANCH_AHEAD commit(s) ahead of $BASE_BRANCH"

if branch_exists_remote "$CURRENT"; then
  LOCAL_AHEAD=$(git rev-list --count "$REMOTE/$CURRENT".."$CURRENT" 2>/dev/null || echo "0")
  info "Remote:       $LOCAL_AHEAD new commit(s) to push"
else
  info "Remote:       new branch (first push)"
fi

echo ""

# Show commit list
git log "$REMOTE/$BASE_BRANCH".."$CURRENT" --oneline --no-decorate 2>/dev/null | \
  head -10 | sed 's/^/    /'

echo ""
divider

# ─── Single confirmation ─────────────────────────────────────────────────────

if confirm "Everything is ready. Push ${BOLD}$CURRENT${RESET} to $REMOTE?"; then
  git push "$REMOTE" "$CURRENT" --force-with-lease --quiet
  echo ""
  success "Pushed: ${BOLD}$CURRENT${RESET} → $REMOTE"
  echo ""
  info "Next steps:"
  echo "    Open a Pull Request: $CURRENT → $BASE_BRANCH"
  echo "    Or run: gw pr  (if GitHub CLI is available)"
  echo ""
else
  warn "Push cancelled."
  exit 0
fi
