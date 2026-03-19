#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Workflow configuration
# ─────────────────────────────────────────────────────────────────────────────

PROD_BRANCH="main"
QA_BRANCH="qa"
MERGE_STRATEGY="rebase"          # rebase | merge | squash
VALIDATION_TIMEOUT=300           # seconds
RUN_LINT=true
RUN_TESTS=true
RUN_BUILD=false                  # set true if you want build check on every push
RUN_TYPECHECK=true
REMOTE="origin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ─── Helpers ─────────────────────────────────────────────────────────────────

info()    { echo -e "${BLUE}ℹ${RESET}  $*"; }
success() { echo -e "${GREEN}✓${RESET}  $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET}  $*"; }
error()   { echo -e "${RED}✗${RESET}  $*" >&2; }
bold()    { echo -e "${BOLD}$*${RESET}"; }
divider() { echo -e "${CYAN}────────────────────────────────────────${RESET}"; }

confirm() {
  local msg="${1:-Continue?}"
  echo ""
  echo -e "${BOLD}${YELLOW}?${RESET}  ${BOLD}${msg}${RESET} ${CYAN}[y/N]${RESET} "
  read -r -p "  → " answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

require_clean_or_stash() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    warn "You have uncommitted changes."
    if confirm "Stash them automatically and continue?"; then
      git stash push -m "workflow-auto-stash-$(date +%s)"
      echo "STASHED=true" >> /tmp/workflow_state_$$
    else
      error "Aborted. Commit or stash your changes first."
      exit 1
    fi
  fi
}

restore_stash_if_needed() {
  if [[ -f /tmp/workflow_state_$$ ]]; then
    # shellcheck disable=SC1090
    source /tmp/workflow_state_$$
    rm -f /tmp/workflow_state_$$
    if [[ "$STASHED" == "true" ]]; then
      info "Restoring stashed changes..."
      git stash pop
    fi
  fi
}

current_branch() {
  git rev-parse --abbrev-ref HEAD
}

branch_exists_remote() {
  git ls-remote --heads "$REMOTE" "$1" | grep -q "$1"
}

branch_exists_local() {
  git show-ref --verify --quiet "refs/heads/$1"
}
