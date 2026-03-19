#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Install Git hooks from .workflow/hooks/ into .git/hooks/
# Run once after cloning: bash .workflow/install-hooks.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
HOOKS_SRC="$SCRIPT_DIR/hooks"
HOOKS_DST="$ROOT/.git/hooks"

echo ""
echo "  Installing Git hooks..."

for hook in "$HOOKS_SRC"/*; do
  name=$(basename "$hook")
  dst="$HOOKS_DST/$name"

  if [[ -f "$dst" ]] && ! grep -q "workflow" "$dst" 2>/dev/null; then
    echo "  ⚠  Existing hook found: $name — backing up to $name.bak"
    cp "$dst" "$dst.bak"
  fi

  cp "$hook" "$dst"
  chmod +x "$dst"
  echo "  ✓  $name"
done

echo ""
echo "  Hooks installed. Run 'gw help' to get started."
echo ""
