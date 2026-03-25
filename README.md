# Gestor de Citas Oficiales

> Plataforma independiente para gestionar turnos con organismos públicos en España y Latinoamérica. Actúa exclusivamente como intermediario — no está afiliada ni autorizada por ningún organismo gubernamental.

[![CI](https://github.com/corimayoman/Citas/actions/workflows/ci.yml/badge.svg)](https://github.com/corimayoman/Citas/actions/workflows/ci.yml)
[![Deploy QA](https://github.com/corimayoman/Citas/actions/workflows/deploy-qa.yml/badge.svg)](https://github.com/corimayoman/Citas/actions/workflows/deploy-qa.yml)

---

## Tabla de contenidos

- [Propósito](#propósito)
- [Environments](#environments)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura de deployment](#arquitectura-de-deployment)
- [Guía de usuario final](#guía-de-usuario-final)
- [Guía de administración](#guía-de-administración)
- [Estructura de datos](#estructura-de-datos)
- [Estados](#estados)
- [API — catálogo de endpoints](#api--catálogo-de-endpoints)
- [Filtros de referencia](#filtros-de-referencia)
- [Motor de compliance](#motor-de-compliance)
- [Arquitectura de conectores](#arquitectura-de-conectores)
- [Instalación local](#instalación-local)
- [Variables de entorno](#variables-de-entorno)
- [Workflow de desarrollo](#workflow-de-desarrollo)
- [Aviso legal](#aviso-legal)

---

## Propósito

Gestor de Citas Oficiales centraliza el proceso de reservar turnos en organismos públicos (SEPE, DGT, oficinas de extranjería, etc.). Resuelve tres problemas:

1. **Fragmentación** — cada organismo tiene un portal, proceso y formato de datos diferente.
2. **Disponibilidad** — los turnos desaparecen rápido y los usuarios los pierden.
3. **Complejidad** — los formularios requieren documentos y datos específicos que los usuarios no tienen listos.

La plataforma soporta tres modos de integración por organismo:

| Modo | Descripción |
|------|-------------|
| `OFFICIAL_API` | Totalmente automatizado via la API pública del organismo |
| `AUTHORIZED_INTEGRATION` | Automatizado via una integración explícitamente autorizada |
| `MANUAL_ASSISTED` | La app prepara todos los datos; el usuario completa el turno manualmente en el portal oficial |

La automatización solo se activa cuando no viola los Términos de Servicio del portal, robots.txt ni ningún control de seguridad. El motor de compliance lo aplica automáticamente.

---

## Environments

| Environment | Frontend | Backend | Rama Git |
|-------------|----------|---------|----------|
| **Production** | [citas-frontend-production-f2ef.up.railway.app](https://citas-frontend-production-f2ef.up.railway.app) | [citas-backend-production-ad65.up.railway.app](https://citas-backend-production-ad65.up.railway.app) | `main` |
| **QA** | [citas-frontend-qa.up.railway.app](https://citas-frontend-qa.up.railway.app) | [citas-backend-qa.up.railway.app](https://citas-backend-qa.up.railway.app) | `qa` |

### Credenciales de prueba (QA y Prod)

| Rol | Email | Contraseña |
|-----|-------|------------|
| Admin | `admin@gestorcitas.app` | `Admin1234!` |
| Usuario | `usuario@ejemplo.com` | `User1234!` |

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Estado | Zustand, TanStack React Query |
| Backend | Node.js, Express, TypeScript |
| Base de datos | PostgreSQL 16 |
| ORM | Prisma 5 |
| Auth | JWT (15 min) + Refresh tokens (30 días) + TOTP MFA |
| Pagos | Stripe Checkout + Webhooks (demo mode disponible) |
| Email | SendGrid HTTP API |
| SMS | Twilio |
| Cola de jobs | BullMQ + Redis |
| Almacenamiento docs | S3-compatible (AWS S3, Cloudflare R2, MinIO) |
| API docs | Swagger / OpenAPI 3.0 en `/api/docs` |
| CI/CD | GitHub Actions |
| Hosting | Railway (QA + Production) |

---

## Arquitectura de deployment

```
GitHub
  ├── branch: qa   ──push──▶  Railway QA environment
  │                              ├── Citas-Backend-QA  (citas-backend-qa.up.railway.app)
  │                              ├── Citas-Frontend-QA (citas-frontend-qa.up.railway.app)
  │                              ├── Postgres-QA       (postgres.railway.internal)
  │                              └── Redis-QA          (redis.railway.internal)
  │
  └── branch: main ──push──▶  Railway Production environment
                                 ├── Citas-Backend     (citas-backend-production-ad65.up.railway.app)
                                 ├── Citas-Frontend    (citas-frontend-production-f2ef.up.railway.app)
                                 ├── Postgres-Prod     (postgres.railway.internal)
                                 └── Redis-Prod        (redis.railway.internal)
```

### Flujo de deploy

```
feature/xxx  →  (gw promote qa)  →  qa  →  (gw promote prod)  →  main
                                     ↓                              ↓
                               Railway QA                   Railway Production
                               (auto-deploy)                (auto-deploy)
```

### Servicios externos

| Servicio | Uso | Environment |
|----------|-----|-------------|
| SendGrid | Email de notificaciones | QA + Prod |
| Twilio | SMS de notificaciones | QA + Prod |
| Stripe | Pagos (demo mode activo) | QA + Prod |

---

## Guía de usuario final

### Registrarse

1. Ir a la URL del frontend → "Crear cuenta"
2. Ingresar email y contraseña
3. Aceptar los términos de servicio (requerido por GDPR)
4. Confirmar el email si está habilitada la verificación

### Crear un perfil de solicitante

Antes de reservar un turno, necesitás crear un perfil con los datos de la persona para quien es el turno (puede ser para vos o para un familiar).

1. Ir a **Perfil** → "Mis perfiles" → "Agregar perfil"
2. Completar: nombre, apellido, tipo y número de documento, nacionalidad, fecha de nacimiento
3. Guardar — podés tener múltiples perfiles (ej: vos + tu pareja + tus hijos)

### Reservar un turno

1. Ir a **Trámites** → buscar el trámite que necesitás (ej: "Renovación DNI", "Cita SEPE")
2. Seleccionar el trámite → "Solicitar turno"
3. Elegir el perfil de solicitante
4. Completar el formulario del trámite
5. Indicar el rango de fechas preferido y horario (mañana / tarde)
6. Confirmar y pagar la tarifa del servicio
7. El sistema busca un turno disponible en segundo plano
8. Cuando encuentra uno, te notifica por email o SMS
9. Tenés 24 horas para confirmar el turno antes de que expire

### Configurar notificaciones

1. Ir a **Perfil** → "Preferencias de notificación"
2. Elegir canal: **Email** o **SMS**
3. Si elegís SMS, ingresar tu número de teléfono en formato internacional (ej: `+34612345678`)
4. Guardar

### Ver mis turnos

Ir a **Mis turnos** para ver el estado de todas tus reservas:

| Estado | Qué significa |
|--------|---------------|
| Borrador | Formulario guardado, pendiente de pago |
| Buscando | Pagado, el sistema está buscando un turno |
| Pre-confirmado | Turno encontrado, confirmá antes de que expire |
| Confirmado | Turno reservado, revisá los detalles |
| Completado | Turno realizado |
| Cancelado | Turno cancelado |

### Cancelar un turno

Podés cancelar un turno desde **Mis turnos** → seleccionar el turno → "Cancelar". Los reembolsos se procesan según la política de la plataforma.

---

## Guía de administración

### Acceso al panel de administración

Iniciá sesión con una cuenta de rol `ADMIN` u `OPERATOR`. El panel de admin está disponible en `/admin` del frontend.

### Gestión de usuarios

**Ver todos los usuarios:**
```bash
GET /api/admin/users
Authorization: Bearer <admin-token>
```

**Roles disponibles:**

| Rol | Permisos |
|-----|----------|
| `USER` | Reservar turnos, ver sus propios datos |
| `OPERATOR` | Ver todos los bookings, gestionar procedimientos |
| `ADMIN` | Acceso completo, gestión de usuarios y conectores |
| `COMPLIANCE_OFFICER` | Revisar y aprobar conectores, ver audit logs |

### Gestión de organizaciones y procedimientos

**Agregar una organización:**
```bash
curl -X POST /api/organizations \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"name":"SEPE","slug":"sepe","country":"ES","website":"https://www.sepe.es"}'
```

**Agregar un procedimiento:**
```bash
curl -X POST /api/procedures \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "organizationId": "<org-id>",
    "name": "Cita previa desempleo",
    "slug": "cita-desempleo",
    "category": "Empleo",
    "serviceFee": 14.99,
    "currency": "EUR",
    "formSchema": {
      "fields": [
        { "name": "nif", "label": "NIF", "type": "text", "required": true }
      ]
    }
  }'
```

### Gestión de conectores

Los conectores son los adaptadores de integración con cada organismo. Antes de activar un conector, debe pasar una revisión de compliance.

**Ver conectores registrados:**
```bash
GET /api/connectors/registry
Authorization: Bearer <admin-token>
```

**Activar/desactivar un conector:**
```bash
POST /api/connectors/<id>/toggle
Authorization: Bearer <admin-token>
```

**Correr revisión de compliance:**
```bash
POST /api/compliance/review
Authorization: Bearer <compliance-officer-token>
{
  "connectorId": "<id>",
  "termsChecked": true,
  "robotsTxtChecked": true,
  "apiDocsChecked": true,
  "hasOfficialApi": true,
  "requiresCaptchaBypass": false,
  "requiresAntiBotEvasion": false,
  "requiresRateLimitEvasion": false,
  "requiresAuthBypass": false,
  "legalBasis": "API pública oficial"
}
```

### Dashboard de métricas

`GET /api/admin/stats` devuelve:
- Total de usuarios registrados
- Distribución de bookings por estado
- Revenue total (pagos confirmados)
- Procedimientos activos

### Audit log

Cada acción significativa queda registrada de forma inmutable:

```bash
GET /api/admin/audit-logs?action=PAYMENT&page=1&limit=50
Authorization: Bearer <admin-token>
```

Acciones auditadas: `CREATE` `READ` `UPDATE` `DELETE` `LOGIN` `LOGOUT` `PAYMENT` `BOOKING_ATTEMPT` `COMPLIANCE_CHECK` `CONNECTOR_TOGGLE` `DATA_EXPORT` `DATA_DELETE`

### Notificaciones

Las notificaciones se envían automáticamente en estos eventos:
- Turno encontrado (canal preferido del usuario)
- Pago confirmado
- Turno confirmado con detalles

Ver estado de integraciones en [MOCKS.md](./MOCKS.md).

---

## Estructura de datos

### Diagrama de entidades

```
User
 ├── RefreshToken[]
 ├── ApplicantProfile[]
 │    └── DocumentFile[]
 ├── BookingRequest[]
 │    ├── BookingAttempt[]
 │    ├── Appointment
 │    ├── Payment → Invoice
 │    └── DocumentFile[]
 ├── Payment[]
 ├── Notification[]
 └── AuditLog[]

Organization
 ├── Procedure[]
 │    └── ProcedureRequirement[]
 └── Connector[]
      ├── ConnectorCapability[]
      └── ComplianceReview[]
```

### Entidades principales

#### `User`
Cuenta autenticada. Un usuario puede gestionar múltiples perfiles de solicitante.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Clave primaria |
| `email` | String | Email único de login |
| `role` | Enum | `USER` `OPERATOR` `ADMIN` `COMPLIANCE_OFFICER` |
| `notificationChannel` | Enum | `EMAIL` `SMS` `WHATSAPP` (default `EMAIL`) |
| `notificationPhone` | String | Teléfono para SMS (formato E.164) |
| `mfaEnabled` | Boolean | TOTP activo |
| `consentGiven` | Boolean | Consentimiento GDPR registrado |
| `dataRetentionDate` | DateTime | Fecha de eliminación GDPR programada |

#### `ApplicantProfile`
Datos personales del solicitante. Reutilizable en múltiples bookings.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `documentType` | String | `DNI` `NIE` `Passport` etc. |
| `documentNumber` | String | Encriptado en reposo (AES-256-GCM) |
| `isDefault` | Boolean | Perfil por defecto para nuevos bookings |

#### `BookingRequest`
Solicitud de turno de un usuario para un trámite específico.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `status` | Enum | Ver [Estados de booking](#estados-de-booking) |
| `formData` | JSON | Datos del formulario encriptados (AES-256-GCM) |
| `preferredDateFrom` | DateTime | Inicio del rango de búsqueda preferido |
| `preferredDateTo` | DateTime | Fin del rango de búsqueda preferido |
| `preferredTimeSlot` | String | `morning` (antes 14:00) o `afternoon` (después 14:00) |
| `paymentDeadline` | DateTime | 24h antes del turno encontrado — confirmar antes de esta fecha |
| `externalRef` | String | Código de confirmación del portal oficial |

---

## Estados

### Estados de booking

```
DRAFT → (pagar) → SEARCHING → PRE_CONFIRMED → (confirmar) → CONFIRMED
                                             ↘ EXPIRED (deadline sin confirmar)
         (cualquier estado) → CANCELLED
         (cualquier estado) → ERROR
         (cualquier estado) → REFUNDED
```

| Valor | Significado | Próxima acción |
|-------|-------------|----------------|
| `DRAFT` | Formulario guardado, sin pagar | Pagar para iniciar búsqueda |
| `SEARCHING` | Pago recibido, job buscando turno | Esperar notificación |
| `PRE_CONFIRMED` | Turno encontrado, esperando confirmación | Confirmar antes del deadline |
| `CONFIRMED` | Confirmado, detalles del turno enviados | Ver detalles |
| `COMPLETED` | Turno realizado | — |
| `ERROR` | Búsqueda agotada o error | Contactar soporte |
| `REQUIRES_USER_ACTION` | Modo asistido — el usuario debe actuar | Seguir instrucciones del portal |
| `CANCELLED` | Cancelado | — |
| `REFUNDED` | Reembolso procesado | — |
| `EXPIRED` | Deadline de confirmación vencido | — |

### Estados de pago

| Valor | Significado |
|-------|-------------|
| `PENDING` | Sesión de checkout creada, sin pagar |
| `PAID` | Pago confirmado por Stripe |
| `FAILED` | Pago rechazado o expirado |
| `REFUNDED` | Reembolso completo |
| `PARTIALLY_REFUNDED` | Reembolso parcial |

---

## API — catálogo de endpoints

Base URL local: `http://localhost:3001/api`
Docs interactivos: `http://localhost:3001/api/docs`

### Autenticación

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | — | Registrar usuario con consentimiento GDPR |
| `POST` | `/auth/login` | — | Login, devuelve `accessToken` + `refreshToken` |
| `POST` | `/auth/refresh` | — | Rotar access token con refresh token |
| `POST` | `/auth/logout` | Bearer | Revocar refresh token |
| `POST` | `/auth/mfa/setup` | Bearer | Generar secreto TOTP y QR |
| `POST` | `/auth/mfa/enable` | Bearer | Activar MFA tras verificar primer código |

### Usuarios y perfiles

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `GET` | `/users/me` | Bearer | Ver cuenta propia |
| `PATCH` | `/users/me` | Bearer | Actualizar canal de notificación y teléfono |
| `GET` | `/users/me/profiles` | Bearer | Listar perfiles de solicitante |
| `POST` | `/users/me/profiles` | Bearer | Crear perfil de solicitante |
| `DELETE` | `/users/me/profiles/:id` | Bearer | Eliminar perfil (soft delete) |
| `POST` | `/users/me/gdpr/delete-request` | Bearer | Solicitar eliminación de cuenta (GDPR) |

### Organizaciones

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `GET` | `/organizations` | — | Listar organizaciones (filtrable) |
| `GET` | `/organizations/:id` | — | Detalle con procedimientos |
| `POST` | `/organizations` | Admin | Crear organización |
| `PUT` | `/organizations/:id` | Admin | Actualizar organización |

### Procedimientos

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `GET` | `/procedures` | — | Catálogo paginado |
| `GET` | `/procedures/:id` | — | Detalle con requisitos |
| `POST` | `/procedures` | Admin/Operator | Crear procedimiento |
| `PUT` | `/procedures/:id` | Admin/Operator | Actualizar procedimiento |

### Bookings

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `GET` | `/bookings` | Bearer | Listar propios (paginado) |
| `POST` | `/bookings` | Bearer | Crear booking draft |
| `GET` | `/bookings/:id` | Bearer | Detalle con intentos y turno |
| `POST` | `/bookings/:id/validate` | Bearer | Verificar elegibilidad |
| `POST` | `/bookings/:id/confirm-payment` | Bearer | Confirmar turno tras `PRE_CONFIRMED` |

### Pagos

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `GET` | `/payments` | Bearer | Listar propios con facturas |
| `POST` | `/payments/checkout` | Bearer | Crear sesión Stripe Checkout |
| `POST` | `/payments/demo-checkout` | Bearer | Demo — marca pago como pagado e inicia búsqueda |
| `POST` | `/payments/webhook` | Stripe sig | Manejar eventos de Stripe |

### Notificaciones

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `GET` | `/notifications` | Bearer | Listar propias (últimas 50) |
| `POST` | `/notifications/:id/read` | Bearer | Marcar como leída |
| `POST` | `/notifications/read-all` | Bearer | Marcar todas como leídas |

### Conectores

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `GET` | `/connectors` | — | Listar conectores con capacidades |
| `GET` | `/connectors/registry` | Admin/Operator | Instancias registradas |
| `GET` | `/connectors/:id/availability` | Bearer | Consultar slots disponibles |
| `POST` | `/connectors/:id/toggle` | Admin | Activar/desactivar conector |

### Compliance

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `POST` | `/compliance/evaluate` | Admin/Compliance | Dry-run sin persistir |
| `POST` | `/compliance/review` | Admin/Compliance | Revisión completa con persistencia |
| `GET` | `/compliance/connector/:id` | Admin/Compliance/Operator | Historial de revisiones |

### Admin

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `GET` | `/admin/stats` | Admin/Operator | KPIs del dashboard |
| `GET` | `/admin/bookings` | Admin/Operator | Todos los bookings |
| `GET` | `/admin/users` | Admin | Todas las cuentas |
| `GET` | `/admin/audit-logs` | Admin/Compliance | Audit trail inmutable |

### Health

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `GET` | `/health` | — | Liveness check |

---

## Motor de compliance

Cada conector debe pasar una revisión de compliance antes de operar en modo automatizado. El motor aplica reglas no negociables:

```
requiresCaptchaBypass    = true  →  MANUAL_ASSISTED (CRITICAL) — no se puede activar
requiresAntiBotEvasion   = true  →  MANUAL_ASSISTED (CRITICAL) — no se puede activar
requiresRateLimitEvasion = true  →  MANUAL_ASSISTED (CRITICAL) — no se puede activar
requiresAuthBypass       = true  →  MANUAL_ASSISTED (CRITICAL) — no se puede activar

hasOfficialApi + apiDocsChecked + termsChecked = true  →  OFFICIAL_API (LOW)
hasAuthorizedIntegration + termsChecked = true         →  AUTHORIZED_INTEGRATION (MEDIUM)
otherwise                                              →  MANUAL_ASSISTED (HIGH)
```

Las revisiones se almacenan en `ComplianceReview` y expiran al año. Los conectores deben re-revisarse anualmente.

---

## Arquitectura de conectores

Cada conector implementa la interfaz `IConnector`:

```typescript
interface IConnector {
  readonly metadata: ConnectorMetadata;
  healthCheck(): Promise<boolean>;
  getAvailability?(procedureId, fromDate, toDate): Promise<TimeSlot[]>;
  book?(bookingData): Promise<BookingResult>;
  cancel?(confirmationCode, reason?): Promise<boolean>;
  reschedule?(confirmationCode, newSlot): Promise<BookingResult>;
}
```

Para agregar un nuevo conector:

1. Crear `apps/backend/src/modules/connectors/adapters/<nombre>.connector.ts`
2. Implementar `IConnector`
3. Correr `POST /compliance/review` — el conector solo se activa si pasa compliance
4. Registrar en `connector.registry.ts`

Un conector mock (`mock-connector-001`) está incluido para desarrollo y testing.

---

## Instalación local

### Prerequisitos

- Node.js >= 20
- PostgreSQL >= 14
- Redis >= 7

### Pasos

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar entorno
cp apps/backend/.env.example apps/backend/.env
# Editar .env — ver sección Variables de entorno

# 3. Generar clave de encriptación
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Aplicar schema de base de datos
npm run db:push --workspace=apps/backend

# 5. Cargar datos de seed
npm run db:seed --workspace=apps/backend

# 6. Iniciar backend (puerto 3001)
npm run dev --workspace=apps/backend

# 7. Iniciar frontend (puerto 3000) — terminal separada
npm run dev --workspace=apps/frontend
```

### Docker

```bash
docker-compose up -d
```

---

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | Sí | Connection string PostgreSQL |
| `JWT_SECRET` | Sí | Secreto para firmar JWT |
| `JWT_EXPIRES_IN` | No | TTL del token (default `15m`) |
| `ENCRYPTION_KEY` | Sí | Clave hex de 64 chars para AES-256-GCM |
| `HASH_SALT` | Sí | Salt para hashing unidireccional |
| `FRONTEND_URL` | Sí | Origen del frontend para CORS y redirects de Stripe |
| `STRIPE_SECRET_KEY` | Sí | Clave secreta de Stripe |
| `STRIPE_WEBHOOK_SECRET` | Sí | Secreto de firma del webhook de Stripe |
| `STRIPE_DEMO_MODE` | No | `true` para omitir Stripe y usar pagos demo |
| `REDIS_URL` | Sí | Connection string Redis para BullMQ |
| `SENDGRID_API_KEY` | No | API key de SendGrid para emails (empieza con `SG.`) |
| `MAIL_FROM` | No | Dirección remitente de emails (debe estar verificada en SendGrid) |
| `NOTIFICATIONS_DEMO_MODE` | No | `true` para simular notificaciones sin enviar. `false` para forzar envío real |
| `TWILIO_ACCOUNT_SID` | No | Account SID de Twilio para SMS |
| `TWILIO_AUTH_TOKEN` | No | Auth token de Twilio |
| `TWILIO_FROM_NUMBER` | No | Número de Twilio en formato E.164 |
| `S3_ENDPOINT` | No | Endpoint S3-compatible para documentos |
| `S3_BUCKET` | No | Nombre del bucket |
| `S3_ACCESS_KEY` | No | Access key S3 |
| `S3_SECRET_KEY` | No | Secret key S3 |
| `S3_REGION` | No | Región del bucket S3 (ej: `eu-west-1`) |
| `PORT` | No | Puerto del backend (default `3001`) |
| `LOG_LEVEL` | No | Nivel de log Winston (default `info`) |

---

## Workflow de desarrollo

Ver [WORKFLOW.md](./WORKFLOW.md) para la guía completa.

```bash
# Instalar git hooks (una vez por clon)
bash .workflow/install-hooks.sh

# Iniciar una nueva tarea
bash .workflow/start.sh feature/mi-feature

# Push con auto-sync y validación
bash .workflow/push.sh

# Promover a QA
bash .workflow/promote.sh qa

# Release a producción
bash .workflow/promote.sh prod
```

Modelo de ramas: `feature/*` y `fix/*` parten de `qa`. `hotfix/*` parte de `main`.

---

## Aviso legal

Esta aplicación es un servicio intermediario independiente. No representa, no está afiliada ni ha sido autorizada por ningún organismo gubernamental o entidad pública. Todas las marcas y nombres de organismos públicos pertenecen a sus respectivos propietarios.
