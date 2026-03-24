#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# test-notifications.sh
# Prueba end-to-end de email y SMS contra el backend (local o QA).
#
# Uso:
#   bash scripts/test-notifications.sh                                         # local, sin SMS
#   bash scripts/test-notifications.sh https://backend.railway.app             # QA, sin SMS
#   bash scripts/test-notifications.sh https://backend.railway.app +5491112345 # QA + SMS
# ─────────────────────────────────────────────────────────────────────────────

BASE_URL="${1:-http://localhost:3001}"
PHONE_NUMBER="${2:-}"
API="$BASE_URL/api"

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; }
info() { echo -e "${YELLOW}ℹ  $1${NC}"; }

echo ""
info "Backend: $API"
echo "─────────────────────────────────────────────────────────"

# ── 1. Health check ──────────────────────────────────────────────────────────
info "1. Health check..."
HEALTH=$(curl -sf "$BASE_URL/health" 2>/dev/null)
if [ $? -eq 0 ]; then
  ok "Backend responde: $HEALTH"
else
  fail "Backend no responde en $BASE_URL"
  exit 1
fi

# ── 2. Login como admin ──────────────────────────────────────────────────────
info "2. Login como admin..."
LOGIN=$(curl -sf -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gestorcitas.app","password":"Admin1234!"}')

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['accessToken'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  fail "No se pudo obtener token. Respuesta: $LOGIN"
  exit 1
fi
ok "Token obtenido"

# ── 3. Obtener perfil del usuario ────────────────────────────────────────────
info "3. Obteniendo perfil..."
PROFILE=$(curl -sf "$API/users/me" \
  -H "Authorization: Bearer $TOKEN")
USER_EMAIL=$(echo "$PROFILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['email'])" 2>/dev/null)
CURRENT_CHANNEL=$(echo "$PROFILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'].get('notificationChannel','EMAIL'))" 2>/dev/null)
ok "Usuario: $USER_EMAIL | Canal actual: $CURRENT_CHANNEL"

# ── 4. Probar EMAIL ──────────────────────────────────────────────────────────
echo ""
info "4. Probando notificación por EMAIL..."
info "   Cambiando canal a EMAIL..."
PATCH=$(curl -sf -X PATCH "$API/users/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notificationChannel":"EMAIL"}')

if echo "$PATCH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['data']['notificationChannel']=='EMAIL'" 2>/dev/null; then
  ok "Canal actualizado a EMAIL"
else
  fail "No se pudo actualizar canal. Respuesta: $PATCH"
fi

info "   Disparando notificación de prueba via booking demo..."
# Crear un booking draft para disparar notificación
# Primero necesitamos un procedureId — buscamos el primero disponible
PROCS=$(curl -sf "$API/procedures" -H "Authorization: Bearer $TOKEN")
PROC_ID=$(echo "$PROCS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['items'][0]['id'])" 2>/dev/null)

if [ -z "$PROC_ID" ]; then
  fail "No hay procedimientos disponibles para crear booking de prueba"
else
  ok "Procedimiento encontrado: $PROC_ID"

  # Crear booking draft
  BOOKING=$(curl -sf -X POST "$API/bookings" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"procedureId\": \"$PROC_ID\",
      \"preferredDateFrom\": \"$(date -v+7d +%Y-%m-%d 2>/dev/null || date -d '+7 days' +%Y-%m-%d)\",
      \"preferredDateTo\": \"$(date -v+30d +%Y-%m-%d 2>/dev/null || date -d '+30 days' +%Y-%m-%d)\",
      \"preferredTimeSlot\": \"morning\",
      \"formData\": {}
    }")

  BOOKING_ID=$(echo "$BOOKING" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])" 2>/dev/null)

  if [ -z "$BOOKING_ID" ]; then
    fail "No se pudo crear booking. Respuesta: $BOOKING"
  else
    ok "Booking creado: $BOOKING_ID"

    # Demo checkout — dispara notificación de pago recibido
    info "   Ejecutando demo-checkout (dispara notificación EMAIL)..."
    CHECKOUT=$(curl -sf -X POST "$API/payments/demo-checkout" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"bookingId\": \"$BOOKING_ID\"}")

    STATUS=$(echo "$CHECKOUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['status'])" 2>/dev/null)
    ok "Checkout demo completado. Booking status: $STATUS"
    echo ""
    info "   📧 Revisá la bandeja de $USER_EMAIL — debería haber llegado un email."
  fi
fi

# ── 5. Probar SMS ────────────────────────────────────────────────────────────
echo ""
info "5. Probando notificación por SMS..."
if [ -z "$PHONE_NUMBER" ]; then
  info "   SMS omitido."
else
  info "   Cambiando canal a SMS con número $PHONE_NUMBER..."
  PATCH_SMS=$(curl -sf -X PATCH "$API/users/me" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"notificationChannel\":\"SMS\",\"notificationPhone\":\"$PHONE_NUMBER\"}")

  if echo "$PATCH_SMS" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['data']['notificationChannel']=='SMS'" 2>/dev/null; then
    ok "Canal actualizado a SMS"

    # Crear otro booking para disparar SMS
    BOOKING2=$(curl -sf -X POST "$API/bookings" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"procedureId\": \"$PROC_ID\",
        \"preferredDateFrom\": \"$(date -v+7d +%Y-%m-%d 2>/dev/null || date -d '+7 days' +%Y-%m-%d)\",
        \"preferredDateTo\": \"$(date -v+30d +%Y-%m-%d 2>/dev/null || date -d '+30 days' +%Y-%m-%d)\",
        \"preferredTimeSlot\": \"afternoon\",
        \"formData\": {}
      }")

    BOOKING2_ID=$(echo "$BOOKING2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'])" 2>/dev/null)

    if [ -z "$BOOKING2_ID" ]; then
      fail "No se pudo crear segundo booking"
    else
      ok "Booking creado: $BOOKING2_ID"
      info "   Ejecutando demo-checkout (dispara notificación SMS)..."
      CHECKOUT2=$(curl -sf -X POST "$API/payments/demo-checkout" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"bookingId\": \"$BOOKING2_ID\"}")

      STATUS2=$(echo "$CHECKOUT2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['status'])" 2>/dev/null)
      ok "Checkout demo completado. Booking status: $STATUS2"
      echo ""
      info "   📱 Revisá el teléfono $PHONE_NUMBER — debería haber llegado un SMS."
    fi
  else
    fail "No se pudo actualizar canal a SMS. Respuesta: $PATCH_SMS"
  fi
fi

# ── 6. Verificar notificaciones en DB ────────────────────────────────────────
echo ""
info "6. Verificando notificaciones registradas en DB..."
NOTIFS=$(curl -sf "$API/notifications" \
  -H "Authorization: Bearer $TOKEN")

COUNT=$(echo "$NOTIFS" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d['data'] if isinstance(d['data'],list) else d['data'].get('items',[]); print(len(items))" 2>/dev/null)
LAST=$(echo "$NOTIFS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items=d['data'] if isinstance(d['data'],list) else d['data'].get('items',[])
if items:
  n=items[0]
  print(f\"  [{n.get('status','?')}] {n.get('channel','?')} — {n.get('title','?')}\")
" 2>/dev/null)

ok "$COUNT notificaciones en DB"
[ -n "$LAST" ] && echo -e "   Última: $LAST"

# ── 7. Restaurar canal original ──────────────────────────────────────────────
echo ""
info "7. Restaurando canal original ($CURRENT_CHANNEL)..."
curl -sf -X PATCH "$API/users/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"notificationChannel\":\"$CURRENT_CHANNEL\"}" > /dev/null
ok "Canal restaurado a $CURRENT_CHANNEL"

echo ""
echo "─────────────────────────────────────────────────────────"
ok "Test de notificaciones completado."
echo ""
