# Estado del Proyecto — Gestor de Citas Oficiales

**Última actualización:** 2026-04-07
**Branch activo:** `qa`
**Deploy:** Railway (europe-west4)

---

## Arquitectura

- **Backend:** Express + TypeScript + Prisma + PostgreSQL + Redis + BullMQ
- **Frontend:** Next.js 14 + TypeScript + Tailwind + shadcn/ui
- **Deploy:** Railway (Nixpacks builder)
  - Backend: `citas-backend-qa-qa.up.railway.app`
  - Frontend: `citas-frontend-qa.up.railway.app`
  - Redis: Redis-Prod (Railway)
  - PostgreSQL: Postgres-QA (Railway)

## Credenciales de prueba

- Admin: `admin@gestorcitas.app` / `Admin1234!`
- User: `usuario@ejemplo.com` / `User1234!`

---

## Qué funciona (completado)

1. **Auth completo** — registro, login, email verification, MFA (otplib), refresh tokens
2. **Booking wizard** — flujo de 4 pasos con validaciones en español
3. **SearchWorker (BullMQ)** — búsqueda asíncrona de citas con reintentos
4. **Auto-cancellation cron** — cancela bookings expirados automáticamente
5. **Data purge cron** — limpieza de datos sensibles según GDPR
6. **Pagos (Stripe)** — webhook, demo mode, flujo completo
7. **Notificaciones** — email (nodemailer/SMTP), SMS (Twilio)
8. **Email interception** — webhook para capturar confirmaciones de portales
9. **Circuit breaker** — suspende conectores con errores repetidos
10. **Rate limiter** — token-bucket en Redis por conector
11. **Admin dashboard** — stats, bookings, users, audit logs, connector health
12. **Compliance dashboard** — audit trail, GDPR
13. **5 conectores HTTP registrados** — health check OK para todos:
    - Extranjería (health OK, booking NO — requiere proxy residencial)
    - DGT (health OK, booking stub)
    - AEAT (health OK, booking IMPLEMENTADO — pendiente test)
    - SEPE (health OK, booking stub)
    - Registro Civil (health OK, booking stub)
14. **Mock connector** — funcional para testing del flujo completo

---

## Qué está en progreso

### Conector AEAT (Agencia Tributaria) — RECIÉN IMPLEMENTADO, PENDIENTE TEST

**Archivo:** `apps/backend/src/modules/connectors/adapters/aeat.connector.ts`

Flujo implementado (HTTP puro, sin browser):
1. POST `/wlpl/TOCP-MUTE/internet/identificacion` — sesión con NIF + nombre
2. GET `/wlpl/TOCP-MUTE/internet/cita` — obtener slots disponibles
3. POST `/wlpl/TOCP-MUTE/internet/cita` — seleccionar slot
4. POST `/wlpl/TOCP-MUTE/internet/cita` con `faccion=confirmar` — confirmar

**Próximo paso:** Hacer dry-run desde Railway para verificar que el flujo funciona.
Endpoint: `POST /api/admin/connectors/{aeat-id}/dry-run?procedureId=...`

**Referencia JS del portal:** El archivo `citamulti.js` del portal AEAT contiene toda la lógica.
URL: `https://www2.agenciatributaria.gob.es/wlpl/TOCP-MUTE/resources/js/citamulti.js`

---

## Qué está pendiente (backlog)

### Conectores con stubs (solo health check, sin booking real)

| Conector | Portal | Problema | Dificultad |
|----------|--------|----------|------------|
| Extranjería | icp.administracionelectronica.gob.es | Bot protection (Imperva TSPD), requiere proxy residencial (~$15/mes) + anti-CAPTCHA (~$5/mes) | ALTA |
| DGT | sedeclave.dgt.gob.es | Portal JS-rendered, necesita investigar flujo | MEDIA |
| SEPE | sede.sepe.gob.es / citaprevia-sede.sepe.gob.es | Portal en subdominio diferente, necesita investigar | MEDIA |
| Registro Civil | sede.mjusticia.gob.es → sede.administracionespublicas.gob.es/icpplustiej | Usa ICPPlus (mismo sistema que Extranjería), mismos problemas de bot protection | ALTA |

### Funcionalidades pendientes

- **Mapeo procedureId ↔ portal codes:** Los procedures en la DB necesitan mapearse a los códigos reales de cada portal
- **Integración anti-CAPTCHA:** Para Extranjería y Registro Civil (2Captcha o Anti-Captcha)
- **SMS verification flow:** Algunos portales envían SMS de confirmación
- **Proxy residencial:** Necesario para Extranjería y Registro Civil desde datacenter

### Deuda técnica identificada (auditoría del 2026-04-06)

1. **Conectores stub** — DGT, SEPE, Registro Civil tienen métodos con TODO placeholders que fallan si se llaman
2. **Campos de schema no usados** — `User.mfaSecret` (nunca poblado), `Connector.errorRate`/`avgResponseTimeMs` (nunca actualizados), `BookingRequest.maxSearchAttempts` (nunca usado)
3. **Sin transacciones en _confirmSlot** — booking.service.ts actualiza booking + crea appointment sin Prisma transaction
4. **Sin idempotency keys en SearchWorker** — reintentos pueden crear BookingAttempts duplicados
5. **Rate limiter falla silenciosamente** — si Redis timeout, `acquire()` procede en vez de bloquear
6. **authConfig sin encriptar** — credenciales de conectores en JSON plano en DB
7. **_pickDateInRange** — método legacy solo usado en tests, no en producción

### Limpieza realizada (2026-04-06)

Se eliminaron 1925 líneas de código:
- Toda la capa de browser automation (Playwright, BrowserPool, CaptchaSolver, ScreenshotService)
- Dockerfile.browser, nixpacks.toml
- Frontend screenshots page
- Dependencias: playwright-core, qrcode, multer, class-transformer, class-validator, @sendgrid/mail
- Se fijó: ENCRYPTION_KEY ahora es requerida (no fallback a random)

---

## Variables de entorno (Railway Backend)

### Requeridas
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Secret para JWT
- `ENCRYPTION_KEY` — AES-256-GCM key (64 hex chars)
- `HASH_SALT` — Salt para hashing
- `FRONTEND_URL` — URL del frontend (CORS)
- `STRIPE_SECRET_KEY` — Stripe secret key
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret
- `REDIS_URL` — Redis connection string

### Opcionales
- `STRIPE_DEMO_MODE` — "true" para bypass Stripe
- `NOTIFICATIONS_DEMO_MODE` — "true" para simular notificaciones
- `RAILWAY_ENVIRONMENT` — "qa" para permitir reset-and-seed
- `BROWSERLESS_URL` — URL WebSocket de Browserless.io (no usado actualmente)
- `BROWSER_PROXY` — Proxy HTTP para browser automation (no usado actualmente)

---

## Git workflow

- Branch principal: `qa`
- Push con `--no-verify` (hooks deshabilitados en Railway)
- Railway auto-deploya en push a `qa`
- Monorepo: cambios en root triggean deploy de ambos servicios

## Comandos útiles

```bash
# Build backend
cd apps/backend && npm run build

# Run tests
cd apps/backend && npm test

# Reset DB (local)
cd apps/backend && npm run db:reset

# Seed DB (local)
cd apps/backend && npm run db:seed
```
