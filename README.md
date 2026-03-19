# Gestor de Citas Oficiales

Plataforma web full-stack para centralizar y asistir en la gestión de citas en organismos públicos.

> **Aviso legal**: Esta aplicación actúa exclusivamente como asistente/intermediario independiente. No representa, está afiliada ni autorizada por ningún organismo público. Toda automatización se realiza únicamente a través de APIs oficiales o integraciones expresamente autorizadas.

---

## Arquitectura del sistema

```
gestor-citas-oficiales/
├── apps/
│   ├── backend/          # API REST (Express + TypeScript + Prisma)
│   └── frontend/         # Web app (Next.js 14 + TypeScript + Tailwind)
├── packages/             # Paquetes compartidos (futuro)
└── package.json          # Monorepo root
```

### Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, React Query, Zustand |
| Backend | Node.js, Express, TypeScript |
| Base de datos | PostgreSQL + Prisma ORM |
| Autenticación | JWT + Refresh tokens + MFA (TOTP) |
| Pagos | Stripe Checkout |
| Cola de trabajos | BullMQ + Redis |
| Almacenamiento | S3 compatible |
| Documentación API | Swagger/OpenAPI |

---

## Requisitos previos

- Node.js >= 20
- PostgreSQL >= 14
- Redis >= 7
- npm >= 10

---

## Instalación

### 1. Clonar e instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp apps/backend/.env.example apps/backend/.env
```

Edita `apps/backend/.env` con tus valores:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/gestor_citas"
JWT_SECRET=tu-secreto-jwt-muy-seguro
ENCRYPTION_KEY=64-caracteres-hex-aleatorios
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Para generar una clave de cifrado segura:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Configurar la base de datos

```bash
# Crear la base de datos
createdb gestor_citas

# Ejecutar migraciones
npm run db:migrate

# Cargar datos de ejemplo
npm run db:seed
```

### 4. Iniciar en desarrollo

```bash
# Backend (puerto 3001)
npm run dev --workspace=apps/backend

# Frontend (puerto 3000) — en otra terminal
npm run dev --workspace=apps/frontend
```

---

## Credenciales de prueba (seed)

| Rol | Email | Contraseña |
|-----|-------|-----------|
| Admin | admin@gestorcitas.app | Admin1234! |
| Usuario | usuario@ejemplo.com | User1234! |

---

## API

Documentación Swagger disponible en: `http://localhost:3001/api/docs`

### Endpoints principales

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
POST   /api/auth/mfa/setup
POST   /api/auth/mfa/enable

GET    /api/users/me
GET    /api/users/me/profiles
POST   /api/users/me/profiles
DELETE /api/users/me/profiles/:id
POST   /api/users/me/gdpr/delete-request

GET    /api/organizations
GET    /api/procedures
GET    /api/procedures/:id

GET    /api/bookings
POST   /api/bookings
GET    /api/bookings/:id
POST   /api/bookings/:id/validate
POST   /api/bookings/:id/execute

POST   /api/payments/checkout
POST   /api/payments/webhook
GET    /api/payments

GET    /api/connectors
GET    /api/connectors/registry
GET    /api/connectors/:id/availability
POST   /api/connectors/:id/toggle

POST   /api/compliance/evaluate
POST   /api/compliance/review
GET    /api/compliance/connector/:id

GET    /api/admin/stats
GET    /api/admin/bookings
GET    /api/admin/users
GET    /api/admin/audit-logs
```

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

Para añadir un nuevo conector:

1. Crear `apps/backend/src/modules/connectors/adapters/mi-organismo.connector.ts`
2. Implementar `IConnector`
3. Pasar revisión de compliance (`POST /api/compliance/review`)
4. Registrar en `connector.registry.ts` solo si compliance aprueba

### Reglas de compliance (no negociables)

El motor de compliance bloquea automáticamente cualquier conector que requiera:
- Bypass de CAPTCHA
- Evasión de sistemas anti-bot
- Evasión de rate limiting
- Bypass de autenticación

Estos conectores quedan marcados como `MANUAL_ASSISTED` y no pueden activarse en modo automático.

---

## Tests

```bash
npm run test
```

Los tests del motor de compliance verifican que las restricciones de seguridad son inviolables.

---

## Despliegue

### Variables de entorno de producción

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<secreto-muy-largo-y-aleatorio>
ENCRYPTION_KEY=<64-chars-hex>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=https://tu-dominio.com
```

### Docker (recomendado)

```bash
# Construir imágenes
docker build -t gestor-citas-backend apps/backend
docker build -t gestor-citas-frontend apps/frontend

# O usar docker-compose (ver docker-compose.yml)
docker-compose up -d
```

---

## Roadmap por fases

### Fase 1 — MVP (meses 1-3)
- [x] Autenticación y gestión de usuarios
- [x] Catálogo de trámites
- [x] Motor de formularios dinámicos
- [x] Arquitectura de conectores + conector mock
- [x] Motor de compliance
- [x] Integración Stripe
- [x] Flujo asistido manual
- [ ] Notificaciones por email
- [ ] Panel admin básico

### Fase 2 — Beta (meses 4-6)
- [ ] Primer conector con API oficial real
- [ ] Almacenamiento de documentos (S3)
- [ ] Notificaciones WhatsApp/SMS
- [ ] MFA completo en UI
- [ ] Panel admin avanzado con filtros
- [ ] Generación de facturas PDF
- [ ] Tests de integración

### Fase 3 — Producción (meses 7-12)
- [ ] Multi-tenant
- [ ] Más conectores (tras revisión compliance)
- [ ] Motor de reglas de elegibilidad avanzado
- [ ] Monitoreo de disponibilidad (solo integraciones permitidas)
- [ ] App móvil (React Native)
- [ ] SLA garantizado y soporte
- [ ] Certificación ISO 27001

---

## Matriz de riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| Cambio en ToS de un portal | Alta | Alto | Revisión periódica de compliance, desactivación automática |
| Brecha de datos personales | Baja | Crítico | Cifrado AES-256, minimización de datos, auditoría |
| Stripe rechaza cuenta | Baja | Alto | Backup con otro PSP (Redsys, PayPal) |
| Portal bloquea IPs | Media | Medio | Solo aplica a integraciones autorizadas; modo manual como fallback |
| Cambio normativo RGPD | Baja | Alto | Arquitectura privacy-by-design, DPO designado |
| Conector mal implementado | Media | Alto | Revisión de código + compliance obligatoria antes de activar |
| Abuso de la plataforma | Media | Medio | Rate limiting, KYC básico, logs de auditoría |

---

## Seguridad y compliance

- Datos personales cifrados en reposo (AES-256-GCM)
- Tokens JWT de corta duración (15 min) + refresh tokens revocables
- MFA opcional (TOTP)
- Logs de auditoría inmutables
- RGPD: consentimiento explícito, derecho al olvido, minimización de datos
- Rate limiting en todos los endpoints
- Helmet.js para cabeceras de seguridad
- Separación de datos personales y documentos
- Roles: USER, OPERATOR, ADMIN, COMPLIANCE_OFFICER

---

## Recomendaciones para ampliar conectores

1. **Evaluar primero**: Antes de desarrollar, verificar ToS, robots.txt y disponibilidad de API oficial.
2. **Compliance obligatorio**: Todo conector pasa por `POST /api/compliance/review` antes de activarse.
3. **Empezar en MANUAL_ASSISTED**: Si hay dudas, activar solo asistencia manual y escalar cuando haya certeza legal.
4. **Documentar la base legal**: Cada conector debe tener `legalBasis` y `termsOfServiceUrl`.
5. **Revisión anual**: Los conectores activos se revisan anualmente para verificar que los ToS no han cambiado.
6. **Nunca implementar**: bypass de CAPTCHA, scraping agresivo, simulación de comportamiento humano.
