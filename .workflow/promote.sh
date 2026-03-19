#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gw promote — Promote code between environments
#
# Usage:
#   gw promote qa       → merge current feature branch into qa
#   gw promote prod     → merge qa into main (production release)
#   gw promote hotfix   → merge current hotfix branch into both main and qa
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

TARGET="${1:-}"
CURRENT=$(current_branch)

if [[ -z "$TARGET" ]]; then
  echo ""
  bold "  Promote code between environments"
  divider
  echo "  Usage: gw promote <target>"
  echo ""
  echo "  Targets:"
  echo "    qa      — merge current feature branch into qa"
  echo "    prod    — promote qa → main (release)"
  echo "    hotfix  — merge hotfix into main AND qa"
  echo ""
  exit 1
fi

require_clean_or_stash

# ─── Fetch latest ────────────────────────────────────────────────────────────

info "Fetching remote state..."
git fetch "$REMOTE" --prune --quiet

# ─────────────────────────────────────────────────────────────────────────────
# PROMOTE TO QA
# ─────────────────────────────────────────────────────────────────────────────

if [[ "$TARGET" == "qa" ]]; then
  if [[ "$CURRENT" == "$QA_BRANCH" || "$CURRENT" == "$PROD_BRANCH" ]]; then
    error "You must be on a feature/fix branch to promote to QA."
    exit 1
  fi

  COMMITS=$(git rev-list --count "$REMOTE/$QA_BRANCH".."$CURRENT" 2>/dev/null || echo "0")
  if [[ "$COMMITS" == "0" ]]; then
    warn "No new commits to promote to QA."
    exit 0
  fi

  echo ""
  bold "  Promoting to QA"
  divider
  info "From:    $CURRENT ($COMMITS commit(s))"
  info "Into:    $QA_BRANCH"
  info "Method:  squash merge (clean QA history)"
  echo ""
  git log "$REMOTE/$QA_BRANCH".."$CURRENT" --oneline --no-decorate | sed 's/^/    /'
  echo ""

  if confirm "Squash-merge ${BOLD}$CURRENT${RESET} into ${BOLD}$QA_BRANCH${RESET}?"; then
    git checkout "$QA_BRANCH"
    git pull "$REMOTE" "$QA_BRANCH" --ff-only --quiet

    # Squash merge: one clean commit per feature on QA
    git merge --squash "$CURRENT" --quiet
    git commit -m "feat: merge $CURRENT into $QA_BRANCH

$(git log "$REMOTE/$QA_BRANCH".."$CURRENT" --oneline --no-decorate)"

    git push "$REMOTE" "$QA_BRANCH" --quiet
    echo ""
    success "Promoted to QA: ${BOLD}$CURRENT${RESET} → $QA_BRANCH"
    info "QA environment will deploy automatically via CI/CD."
    echo ""
    git checkout "$CURRENT"
  else
    warn "Promotion cancelled."
  fi

# ─────────────────────────────────────────────────────────────────────────────
# PROMOTE QA → PRODUCTION
# ─────────────────────────────────────────────────────────────────────────────

elif [[ "$TARGET" == "prod" ]]; then
  if [[ "$CURRENT" != "$QA_BRANCH" ]]; then
    warn "You are not on $QA_BRANCH. Switching..."
    git checkout "$QA_BRANCH"
  fi

  git pull "$REMOTE" "$QA_BRANCH" --ff-only --quiet

  COMMITS=$(git rev-list --count "$REMOTE/$PROD_BRANCH".."$QA_BRANCH" 2>/dev/null || echo "0")
  if [[ "$COMMITS" == "0" ]]; then
    warn "QA is already in sync with $PROD_BRANCH. Nothing to promote."
    exit 0
  fi

  echo ""
  bold "  Promoting QA → Production"
  divider
  warn "This will deploy to PRODUCTION."
  info "Commits to promote ($COMMITS):"
  echo ""
  git log "$REMOTE/$PROD_BRANCH".."$QA_BRANCH" --oneline --no-decorate | sed 's/^/    /'
  echo ""

  if confirm "Merge ${BOLD}$QA_BRANCH${RESET} into ${BOLD}$PROD_BRANCH${RESET} (PRODUCTION RELEASE)?"; then
    git checkout "$PROD_BRANCH"
    git pull "$REMOTE" "$PROD_BRANCH" --ff-only --quiet

    # Merge commit for production — preserves full history and is auditable
    git merge "$QA_BRANCH" --no-ff -m "release: promote qa to production $(date +%Y-%m-%d)"

    git push "$REMOTE" "$PROD_BRANCH" --quiet

    # Tag the release
    TAG="release-$(date +%Y%m%d-%H%M)"
    git tag -a "$TAG" -m "Production release $TAG"
    git push "$REMOTE" "$TAG" --quiet

    echo ""
    success "Production release complete"
    info "Tag: $TAG"
    info "Production environment will deploy automatically via CI/CD."
    echo ""
    git checkout "$QA_BRANCH"
  else
    warn "Production promotion cancelled."
  fi

# ─────────────────────────────────────────────────────────────────────────────
# HOTFIX → MAIN + QA
# ─────────────────────────────────────────────────────────────────────────────

elif [[ "$TARGET" == "hotfix" ]]; then
  if ! echo "$CURRENT" | grep -q "^hotfix/"; then
    error "You must be on a hotfix/* branch to use 'gw promote hotfix'."
    exit 1
  fi

  COMMITS=$(git rev-list --count "$REMOTE/$PROD_BRANCH".."$CURRENT" 2>/dev/null || echo "0")
  if [[ "$COMMITS" == "0" ]]; then
    warn "No new commits on hotfix branch."
    exit 0
  fi

  echo ""
  bold "  Hotfix promotion"
  divider
  warn "This will merge into BOTH $PROD_BRANCH and $QA_BRANCH."
  info "Branch:  $CURRENT ($COMMITS commit(s))"
  echo ""
  git log "$REMOTE/$PROD_BRANCH".."$CURRENT" --oneline --no-decorate | sed 's/^/    /'
  echo ""

  if confirm "Merge ${BOLD}$CURRENT${RESET} into ${BOLD}$PROD_BRANCH${RESET} AND ${BOLD}$QA_BRANCH${RESET}?"; then
    # → main
    git checkout "$PROD_BRANCH"
    git pull "$REMOTE" "$PROD_BRANCH" --ff-only --quiet
    git merge "$CURRENT" --no-ff -m "hotfix: merge $CURRENT into $PROD_BRANCH"
    git push "$REMOTE" "$PROD_BRANCH" --quiet

    TAG="hotfix-$(date +%Y%m%d-%H%M)"
    git tag -a "$TAG" -m "Hotfix $TAG"
    git push "$REMOTE" "$TAG" --quiet

    # → qa (keep in sync)
    git checkout "$QA_BRANCH"
    git pull "$REMOTE" "$QA_BRANCH" --ff-only --quiet
    git merge "$CURRENT" --no-ff -m "hotfix: backport $CURRENT into $QA_BRANCH"
    git push "$REMOTE" "$QA_BRANCH" --quiet

    echo ""
    success "Hotfix deployed to $PROD_BRANCH and backported to $QA_BRANCH"
    info "Tag: $TAG"
    echo ""
    git checkout "$CURRENT"
  else
    warn "Hotfix promotion cancelled."
  fi

else
  error "Unknown target: $TARGET"
  error "Valid targets: qa | prod | hotfix"
  exit 1
fi

restore_stash_if_needed
