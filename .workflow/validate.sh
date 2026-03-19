#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# gw validate — Run all checks before push
# Can be called standalone or from push.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

FAILED=()
PASSED=()

run_check() {
  local name="$1"
  local cmd="$2"
  local dir="${3:-.}"

  echo -ne "  ${CYAN}→${RESET} $name... "
  if (cd "$dir" && eval "$cmd" > /tmp/gw_check_output 2>&1); then
    echo -e "${GREEN}✓${RESET}"
    PASSED+=("$name")
  else
    echo -e "${RED}✗${RESET}"
    FAILED+=("$name")
    echo ""
    warn "Output from '$name':"
    cat /tmp/gw_check_output | head -40
    echo ""
  fi
}

echo ""
bold "  Running validations"
divider

# ─── Detect package manager ──────────────────────────────────────────────────

if [[ -f "package-lock.json" ]]; then
  PKG_MGR="npm"
elif [[ -f "yarn.lock" ]]; then
  PKG_MGR="yarn"
elif [[ -f "pnpm-lock.yaml" ]]; then
  PKG_MGR="pnpm"
else
  PKG_MGR="npm"
fi

# ─── Install / validate deps ─────────────────────────────────────────────────

run_check "Dependencies (root)" "$PKG_MGR install --silent 2>/dev/null || true" "."

# ─── Backend checks ──────────────────────────────────────────────────────────

if [[ -d "apps/backend" ]]; then
  if [[ "$RUN_TYPECHECK" == "true" ]]; then
    run_check "TypeScript (backend)" "npx tsc --noEmit" "apps/backend"
  fi

  if [[ "$RUN_LINT" == "true" ]] && grep -q '"lint"' apps/backend/package.json 2>/dev/null; then
    run_check "Lint (backend)" "$PKG_MGR run lint --silent" "apps/backend"
  fi

  if [[ "$RUN_TESTS" == "true" ]]; then
    run_check "Tests (backend)" "$PKG_MGR test -- --passWithNoTests" "apps/backend"
  fi

  if [[ "$RUN_BUILD" == "true" ]]; then
    run_check "Build (backend)" "$PKG_MGR run build --silent" "apps/backend"
  fi
fi

# ─── Frontend checks ─────────────────────────────────────────────────────────

if [[ -d "apps/frontend" ]]; then
  if [[ "$RUN_TYPECHECK" == "true" ]]; then
    run_check "TypeScript (frontend)" "npx tsc --noEmit" "apps/frontend"
  fi

  if [[ "$RUN_LINT" == "true" ]] && grep -q '"lint"' apps/frontend/package.json 2>/dev/null; then
    run_check "Lint (frontend)" "$PKG_MGR run lint --silent" "apps/frontend"
  fi

  if [[ "$RUN_BUILD" == "true" ]]; then
    run_check "Build (frontend)" "$PKG_MGR run build" "apps/frontend"
  fi
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
divider

if [[ ${#FAILED[@]} -gt 0 ]]; then
  error "Validation failed — ${#FAILED[@]} check(s) did not pass:"
  for f in "${FAILED[@]}"; do
    echo -e "    ${RED}✗${RESET} $f"
  done
  echo ""
  warn "Fix the issues above, then run:  gw push"
  echo ""
  exit 1
fi

success "All ${#PASSED[@]} checks passed"
echo ""
