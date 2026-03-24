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

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; }
info() { echo -e "${YELLOW}ℹ  $1${NC}"; }

# Extrae campo de JSON — acepta array o {data: [...]} o {data: {items: [...]}}
json_get() { echo "$1" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())$2)" 2>/dev/null; }
has_data()  { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'data' in d and d['data'] is not None" 2>/dev/null; }

echo ""
info "Backend: $API"
echo "─────────────────────────────────────────────────────────"

# ── 1. Health check ──────────────────────────────────────────────────────────
info "1. Health check..."
HEALTH=$(curl -sf "$BASE_URL/health" 2>/dev/null)
if [ $? -eq 0 ]; then ok "Backend responde: $HEALTH"
else fail "Backend no responde en $BASE_URL"; exit 1; fi

# ── 2. Login ─────────────────────────────────────────────────────────────────
info "2. Login como admin..."
LOGIN=$(curl -sf -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gestorcitas.app","password":"Admin1234!"}')
TOKEN=$(json_get "$LOGIN" "['data']['accessToken']")
if [ -z "$TOKEN" ]; then fail "No se pudo obtener token. Respuesta: $LOGIN"; exit 1; fi
ok "Token obtenido"

# ── 3. Perfil ────────────────────────────────────────────────────────────────
info "3. Obteniendo perfil..."
PROFILE=$(curl -sf "$API/users/me" -H "Authorization: Bearer $TOKEN")
USER_EMAIL=$(json_get "$PROFILE" "['data']['email']")
CURRENT_CHANNEL=$(json_get "$PROFILE" "['data'].get('notificationChannel','EMAIL')")
ok "Usuario: $USER_EMAIL | Canal actual: $CURRENT_CHANNEL"

# ── 4. EMAIL ─────────────────────────────────────────────────────────────────
echo ""
info "4. Probando notificación por EMAIL..."
info "   Cambiando canal a EMAIL..."
PATCH=$(curl -sf -X PATCH "$API/users/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notificationChannel":"EMAIL"}')

if has_data "$PATCH"; then
  ok "Canal actualizado a EMAIL"
else
  fail "PATCH /users/me falló. Respuesta: $PATCH"
fi

info "   Buscando procedimiento disponible..."
PROCS=$(curl -sf "$API/procedures" -H "Authorization: Bearer $TOKEN")
PROC_ID=$(echo "$PROCS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
data=d.get('data',d)
items=data if isinstance(data,list) else data.get('items',data) if isinstance(data,dict) else []
print(items[0]['id'] if items else '')
" 2>/dev/null)

if [ -z "$PROC_ID" ]; then
  fail "No hay procedimientos disponibles"
else
  ok "Procedimiento: $PROC_ID"

  # Crear perfil de solicitante temporal para el test
  info "   Creando perfil de solicitante de prueba..."
  PROFILE_RESP=$(curl -sf -X POST "$API/users/me/profiles" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"firstName":"Test","lastName":"Notificaciones","documentType":"DNI","documentNumber":"99999999T","nationality":"ES","birthDate":"1990-01-01","isDefault":false}')
  PROFILE_ID=$(json_get "$PROFILE_RESP" "['data']['id']")

  if [ -z "$PROFILE_ID" ]; then
    # Puede que ya exista uno — buscar el primero
    PROFILES=$(curl -sf "$API/users/me/profiles" -H "Authorization: Bearer $TOKEN")
    PROFILE_ID=$(json_get "$PROFILES" "['data'][0]['id']")
  fi

  if [ -z "$PROFILE_ID" ]; then
    fail "No se pudo obtener perfil de solicitante"
  else
    ok "Perfil de solicitante: $PROFILE_ID"
  fi

  DATE_FROM=$(date -v+7d +%Y-%m-%d 2>/dev/null || date -d '+7 days' +%Y-%m-%d)
  DATE_TO=$(date -v+30d +%Y-%m-%d 2>/dev/null || date -d '+30 days' +%Y-%m-%d)

  info "   Creando booking draft..."
  BOOKING=$(curl -sf -X POST "$API/bookings" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"procedureId\":\"$PROC_ID\",\"applicantProfileId\":\"$PROFILE_ID\",\"preferredDateFrom\":\"$DATE_FROM\",\"preferredDateTo\":\"$DATE_TO\",\"preferredTimeSlot\":\"morning\",\"formData\":{}}")
  BOOKING_ID=$(json_get "$BOOKING" "['data']['id']")

  if [ -z "$BOOKING_ID" ]; then
    fail "No se pudo crear booking. Respuesta: $BOOKING"
  else
    ok "Booking creado: $BOOKING_ID"
    info "   Ejecutando demo-checkout (dispara notificación EMAIL)..."
    CHECKOUT=$(curl -sf -X POST "$API/payments/demo-checkout" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"bookingId\":\"$BOOKING_ID\"}")
    STATUS=$(json_get "$CHECKOUT" "['data']['status']")
    ok "Checkout completado. Booking status: $STATUS"
    echo ""
    info "   📧 Revisá la bandeja de $USER_EMAIL"
  fi
fi

# ── 5. SMS ───────────────────────────────────────────────────────────────────
echo ""
info "5. Probando notificación por SMS..."
if [ -z "$PHONE_NUMBER" ]; then
  info "   SMS omitido (pasá el número como 2do argumento para probarlo)"
else
  info "   Cambiando canal a SMS con número $PHONE_NUMBER..."
  PATCH_SMS=$(curl -sf -X PATCH "$API/users/me" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"notificationChannel\":\"SMS\",\"notificationPhone\":\"$PHONE_NUMBER\"}")

  if has_data "$PATCH_SMS"; then
    ok "Canal actualizado a SMS"

    BOOKING2=$(curl -sf -X POST "$API/bookings" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"procedureId\":\"$PROC_ID\",\"applicantProfileId\":\"$PROFILE_ID\",\"preferredDateFrom\":\"$DATE_FROM\",\"preferredDateTo\":\"$DATE_TO\",\"preferredTimeSlot\":\"afternoon\",\"formData\":{}}")
    BOOKING2_ID=$(json_get "$BOOKING2" "['data']['id']")

    if [ -z "$BOOKING2_ID" ]; then
      fail "No se pudo crear booking para SMS"
    else
      ok "Booking creado: $BOOKING2_ID"
      info "   Ejecutando demo-checkout (dispara notificación SMS)..."
      CHECKOUT2=$(curl -sf -X POST "$API/payments/demo-checkout" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"bookingId\":\"$BOOKING2_ID\"}")
      STATUS2=$(json_get "$CHECKOUT2" "['data']['status']")
      ok "Checkout completado. Booking status: $STATUS2"
      echo ""
      info "   📱 Revisá el teléfono $PHONE_NUMBER"
    fi
  else
    fail "No se pudo actualizar canal a SMS. Respuesta: $PATCH_SMS"
  fi
fi

# ── 6. Verificar notificaciones en DB ────────────────────────────────────────
echo ""
info "6. Verificando notificaciones en DB..."
NOTIFS=$(curl -sf "$API/notifications" -H "Authorization: Bearer $TOKEN")
COUNT=$(echo "$NOTIFS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
data=d.get('data',d)
items=data if isinstance(data,list) else data.get('items',[]) if isinstance(data,dict) else []
print(len(items))
" 2>/dev/null)
LAST=$(echo "$NOTIFS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
data=d.get('data',d)
items=data if isinstance(data,list) else data.get('items',[]) if isinstance(data,dict) else []
if items:
  n=items[0]
  print(f\"[{n.get('status','?')}] {n.get('channel','?')} — {n.get('title','?')}\")
" 2>/dev/null)
ok "$COUNT notificaciones en DB"
[ -n "$LAST" ] && echo -e "   Última: $LAST"

# ── 7. Restaurar canal ───────────────────────────────────────────────────────
echo ""
info "7. Restaurando canal original ($CURRENT_CHANNEL)..."
curl -sf -X PATCH "$API/users/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"notificationChannel\":\"$CURRENT_CHANNEL\"}" > /dev/null
ok "Canal restaurado"

# Limpiar perfil temporal si lo creamos nosotros
if [ -n "$PROFILE_ID" ]; then
  curl -sf -X DELETE "$API/users/me/profiles/$PROFILE_ID" \
    -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1 || true
fi

echo ""
echo "─────────────────────────────────────────────────────────"
ok "Test completado."
echo ""
