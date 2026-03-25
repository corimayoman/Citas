#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# validate-docs.sh
# Verifica que README.md y MOCKS.md estén sincronizados con el código.
# Corre en la regresión diaria y en CI.
#
# Exit code 0 = todo OK
# Exit code 1 = documentación desactualizada
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
README="$ROOT/README.md"
MOCKS="$ROOT/MOCKS.md"
ENV_EXAMPLE="$ROOT/apps/backend/.env.example"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; ERRORS=$((ERRORS+1)); }
info() { echo -e "${YELLOW}ℹ  $1${NC}"; }

ERRORS=0

echo ""
info "Validando documentación del proyecto..."
echo "─────────────────────────────────────────────────────────"

# ── 1. README existe y no está vacío ─────────────────────────────────────────
if [ ! -s "$README" ]; then
  fail "README.md no existe o está vacío"
else
  ok "README.md existe"
fi

# ── 2. MOCKS.md existe y no está vacío ───────────────────────────────────────
if [ ! -s "$MOCKS" ]; then
  fail "MOCKS.md no existe o está vacío"
else
  ok "MOCKS.md existe"
fi

# ── 3. Variables de entorno en README vs .env.example ────────────────────────
info "Verificando variables de entorno..."

# Extraer variables del .env.example (líneas que empiezan con NOMBRE=)
# Excluir variables estándar que no necesitan documentación específica
SKIP_VARS="NODE_ENV|PORT"
ENV_VARS=$(grep -E '^[A-Z_]+=.*' "$ENV_EXAMPLE" | cut -d= -f1 | grep -vE "^($SKIP_VARS)$" | sort)

MISSING_VARS=0
while IFS= read -r var; do
  if ! grep -q "$var" "$README"; then
    fail "Variable '$var' está en .env.example pero no en README.md"
    MISSING_VARS=$((MISSING_VARS+1))
  fi
done <<< "$ENV_VARS"

if [ "$MISSING_VARS" -eq 0 ]; then
  ok "Todas las variables de .env.example están documentadas en README.md"
fi

# ── 4. SMTP no debe aparecer en README (migramos a SendGrid) ─────────────────
if grep -q "SMTP_HOST\|SMTP_PORT\|SMTP_USER\|SMTP_PASS" "$README"; then
  fail "README.md menciona variables SMTP obsoletas (migramos a SendGrid)"
else
  ok "README.md no menciona variables SMTP obsoletas"
fi

# ── 5. SendGrid debe estar documentado ───────────────────────────────────────
if ! grep -q "SENDGRID_API_KEY" "$README"; then
  fail "README.md no documenta SENDGRID_API_KEY"
else
  ok "SendGrid documentado en README.md"
fi

# ── 6. MOCKS.md debe tener las integraciones principales ─────────────────────
info "Verificando integraciones en MOCKS.md..."

for integration in "MockConnector" "Stripe" "SendGrid" "OAuth"; do
  if ! grep -q "$integration" "$MOCKS"; then
    fail "MOCKS.md no menciona integración: $integration"
  fi
done
ok "Integraciones principales presentes en MOCKS.md"

# ── 7. URLs de environments en README ────────────────────────────────────────
info "Verificando URLs de environments..."

if ! grep -q "railway.app" "$README"; then
  fail "README.md no tiene URLs de Railway (QA/Production)"
else
  ok "URLs de Railway presentes en README.md"
fi

# ── 8. Guía de usuario en README ─────────────────────────────────────────────
for section in "usuario final" "administración" "Instalación"; do
  if ! grep -qi "$section" "$README"; then
    fail "README.md no tiene sección: $section"
  fi
done
ok "Secciones principales presentes en README.md"

# ── 9. README no debe estar desactualizado (modificado hace más de 30 días) ──
if command -v git &>/dev/null; then
  LAST_MODIFIED=$(git log -1 --format="%ct" -- "$README" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  DAYS_OLD=$(( (NOW - LAST_MODIFIED) / 86400 ))
  if [ "$DAYS_OLD" -gt 30 ]; then
    fail "README.md no fue modificado en los últimos 30 días ($DAYS_OLD días)"
  else
    ok "README.md actualizado hace $DAYS_OLD días"
  fi
fi

# ── Resultado ─────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────────────────────"
if [ "$ERRORS" -eq 0 ]; then
  ok "Documentación OK — $ERRORS errores"
  exit 0
else
  fail "Documentación desactualizada — $ERRORS error(es) encontrado(s)"
  exit 1
fi
