# Gestor de Citas Oficiales

> Independent assistant platform for managing appointments with public organizations in Spain and Latin America. Acts exclusively as an intermediary — not affiliated with or authorized by any government body.

[![CI](https://github.com/corimayoman/Citas/actions/workflows/ci.yml/badge.svg)](https://github.com/corimayoman/Citas/actions/workflows/ci.yml)
[![Deploy QA](https://github.com/corimayoman/Citas/actions/workflows/deploy-qa.yml/badge.svg)](https://github.com/corimayoman/Citas/actions/workflows/deploy-qa.yml)

---

## Table of contents

- [Purpose](#purpose)
- [Tech stack](#tech-stack)
- [Data structure](#data-structure)
- [Status values](#status-values)
- [API — controls catalog](#api--controls-catalog)
- [Filters reference](#filters-reference)
- [Dashboard charts](#dashboard-charts)
- [Compliance engine](#compliance-engine)
- [Connector architecture](#connector-architecture)
- [Installation](#installation)
- [How to update data](#how-to-update-data)
- [Environment variables](#environment-variables)
- [Development workflow](#development-workflow)

---

## Purpose

Gestor de Citas Oficiales centralizes the process of booking appointments at public organizations (SEPE, DGT, immigration offices, etc.). It solves three problems:

1. **Fragmentation** — each organization has a different portal, process, and data format.
2. **Availability** — slots disappear quickly and users miss them.
3. **Complexity** — forms require specific documents and data that users often don't have ready.

The platform handles three integration modes per organization:

| Mode | Description |
|------|-------------|
| `OFFICIAL_API` | Fully automated via the organization's public API |
| `AUTHORIZED_INTEGRATION` | Automated via an explicitly authorized integration |
| `MANUAL_ASSISTED` | App prepares all data; user completes booking manually on the official portal |

Automation is only enabled when it does not violate the portal's Terms of Service, robots.txt, or any security controls. The compliance engine enforces this automatically.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| State management | Zustand, TanStack React Query |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16 |
| ORM | Prisma 5 |
| Auth | JWT (15 min) + Refresh tokens (30 days) + TOTP MFA |
| Payments | Stripe Checkout + Webhooks |
| Job queue | BullMQ + Redis |
| Document storage | S3-compatible (AWS S3, Cloudflare R2, MinIO) |
| API docs | Swagger / OpenAPI 3.0 at `/api/docs` |
| CI/CD | GitHub Actions |
| Containerization | Docker + docker-compose |

---

## Data structure

### Entity relationship overview

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

### Entities

#### `User`
Authenticated account. One user can manage multiple applicant profiles (e.g. family members).

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `email` | String | Unique login email |
| `role` | Enum | `USER` `OPERATOR` `ADMIN` `COMPLIANCE_OFFICER` |
| `isActive` | Boolean | Account enabled flag |
| `mfaEnabled` | Boolean | TOTP two-factor active |
| `consentGiven` | Boolean | GDPR consent recorded |
| `consentVersion` | String | Version of accepted terms |
| `dataRetentionDate` | DateTime | Scheduled GDPR deletion date |
| `deletedAt` | DateTime | Soft delete timestamp |

#### `ApplicantProfile`
Personal data of the person the appointment is for. Reusable across multiple bookings.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `userId` | UUID | Owner account |
| `firstName` / `lastName` | String | Full name |
| `documentType` | String | `DNI` `NIE` `Passport` etc. |
| `documentNumber` | String | Encrypted at rest |
| `nationality` | String | ISO country code |
| `birthDate` | DateTime | Date of birth |
| `address` | JSON | `{ street, city, province, postalCode, country }` |
| `isDefault` | Boolean | Default profile for new bookings |

#### `Organization`
A public body or government agency.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `slug` | String | Unique URL-safe identifier |
| `country` | String | ISO country code |
| `region` | String | Optional region/province |
| `isActive` | Boolean | Visible in catalog |

#### `Procedure`
A specific type of appointment or administrative process offered by an organization.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `organizationId` | UUID | Parent organization |
| `connectorId` | UUID | Integration connector (nullable) |
| `category` | String | e.g. `Empleo` `Tráfico` `Extranjería` |
| `formSchema` | JSON | Dynamic form field definitions |
| `eligibilityRules` | JSON | Rules engine configuration |
| `serviceFee` | Decimal | Platform fee in `currency` |
| `slaHours` | Int | Service level commitment in hours |
| `legalBasis` | String | Applicable law or regulation |

#### `Connector`
Integration adapter for a specific organization portal.

| Field | Type | Description |
|-------|------|-------------|
| `integrationType` | Enum | `OFFICIAL_API` `AUTHORIZED_INTEGRATION` `MANUAL_ASSISTED` |
| `status` | Enum | `ACTIVE` `INACTIVE` `PENDING_REVIEW` `SUSPENDED` |
| `canCheckAvailability` | Boolean | Can query available slots |
| `canBook` | Boolean | Can create appointments automatically |
| `canCancel` | Boolean | Can cancel appointments |
| `canReschedule` | Boolean | Can reschedule appointments |
| `complianceLevel` | Enum | `LOW` `MEDIUM` `HIGH` `CRITICAL` |
| `rateLimit` | Int | Max requests per minute |
| `lastComplianceCheck` | DateTime | Last compliance review date |

#### `BookingRequest`
A user's request to book an appointment for a specific procedure.

| Field | Type | Description |
|-------|------|-------------|
| `status` | Enum | See [Booking status values](#booking-status) |
| `formData` | JSON | AES-256-GCM encrypted user-submitted form data |
| `validationResult` | JSON | Result of eligibility/completeness check |
| `preferredDateFrom` | DateTime | User's preferred search start date |
| `preferredDateTo` | DateTime | User's preferred search end date |
| `preferredTimeSlot` | String | `morning` (before 14:00) or `afternoon` (after 14:00) |
| `paymentDeadline` | DateTime | 24h before the found appointment — confirm by this date |
| `selectedDate` | DateTime | Appointment date found by the background search |
| `externalRef` | String | Confirmation code from the official portal |
| `completedAt` | DateTime | Timestamp of successful completion |

#### `Appointment`
Confirmed appointment details, created after a successful booking.

| Field | Type | Description |
|-------|------|-------------|
| `confirmationCode` | String | Official portal reference number |
| `appointmentDate` | DateTime | Date of the appointment |
| `appointmentTime` | String | Time in `HH:mm` format |
| `location` | String | Office address |
| `instructions` | String | What to bring, arrival notes |
| `receiptData` | JSON | Full receipt snapshot from the portal |

#### `Payment`
Stripe payment record for the platform service fee.

| Field | Type | Description |
|-------|------|-------------|
| `status` | Enum | See [Payment status values](#payment-status) |
| `amount` | Decimal | Amount charged |
| `currency` | String | ISO currency code (default `EUR`) |
| `stripePaymentId` | String | Stripe `pi_xxx` reference |
| `stripeSessionId` | String | Stripe Checkout session ID |
| `refundAmount` | Decimal | Amount refunded (partial or full) |

#### `AuditLog`
Immutable append-only record of every significant action. Never updated, only inserted.

| Field | Type | Description |
|-------|------|-------------|
| `action` | Enum | See [Audit actions](#audit-actions) |
| `entityType` | String | e.g. `User` `BookingRequest` `Connector` |
| `entityId` | String | ID of the affected record |
| `before` / `after` | JSON | State snapshot before and after the change |
| `ipAddress` | String | Client IP |

#### `DocumentFile`
Uploaded supporting document linked to a profile or booking.

| Field | Type | Description |
|-------|------|-------------|
| `storageKey` | String | S3 object key |
| `status` | Enum | `PENDING` `VALIDATED` `REJECTED` `EXPIRED` |
| `expiresAt` | DateTime | Document expiry date (e.g. passport) |

---

## Status values

### Booking status

```
DRAFT → (pay) → SEARCHING → PRE_CONFIRMED → (confirm) → CONFIRMED
                                           ↘ EXPIRED (deadline passed without confirm)
         (any) → CANCELLED
         (any) → ERROR
         (any) → REFUNDED
```

| Value | Meaning | Next action |
|-------|---------|-------------|
| `DRAFT` | Form saved, not yet paid | Pay to start search |
| `SEARCHING` | Payment received, background job looking for a slot | Wait for notification |
| `PRE_CONFIRMED` | Slot found, waiting for user confirmation | Confirm before payment deadline |
| `CONFIRMED` | User confirmed, full appointment details sent | View appointment details |
| `IN_PROGRESS` | Connector is attempting the booking (legacy flow) | Wait |
| `COMPLETED` | Appointment confirmed via legacy execute flow | View appointment details |
| `ERROR` | Booking attempt failed or search exhausted | Contact support or retry |
| `REQUIRES_USER_ACTION` | Manual-assisted mode — user must act | Follow portal instructions |
| `CANCELLED` | Booking cancelled by user or system | — |
| `REFUNDED` | Payment refunded | — |
| `EXPIRED` | Payment deadline passed without confirmation | — |

### Payment status

| Value | Meaning |
|-------|---------|
| `PENDING` | Checkout session created, not yet paid |
| `PAID` | Stripe confirmed payment |
| `FAILED` | Payment declined or expired |
| `REFUNDED` | Full refund issued |
| `PARTIALLY_REFUNDED` | Partial refund issued |

### Connector status

| Value | Meaning |
|-------|---------|
| `ACTIVE` | Operational, can process bookings |
| `INACTIVE` | Disabled by admin |
| `PENDING_REVIEW` | Awaiting compliance review |
| `SUSPENDED` | Suspended due to compliance issue |

### Document status

| Value | Meaning |
|-------|---------|
| `PENDING` | Uploaded, not yet reviewed |
| `VALIDATED` | Accepted |
| `REJECTED` | Rejected — resubmission required |
| `EXPIRED` | Document past its expiry date |

### Audit actions

`CREATE` `READ` `UPDATE` `DELETE` `LOGIN` `LOGOUT` `PAYMENT` `BOOKING_ATTEMPT` `COMPLIANCE_CHECK` `CONNECTOR_TOGGLE` `DATA_EXPORT` `DATA_DELETE`

---

## API — controls catalog

Base URL: `http://localhost:3001/api`  
Interactive docs: `http://localhost:3001/api/docs`

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/register` | — | Register new user with GDPR consent |
| `POST` | `/auth/login` | — | Login, returns `accessToken` + `refreshToken` |
| `POST` | `/auth/refresh` | — | Rotate access token using refresh token |
| `POST` | `/auth/logout` | Bearer | Revoke refresh token |
| `POST` | `/auth/mfa/setup` | Bearer | Generate TOTP secret and QR code |
| `POST` | `/auth/mfa/enable` | Bearer | Activate MFA after verifying first code |

### Users & profiles

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users/me` | Bearer | Get own account and profiles |
| `GET` | `/users/me/profiles` | Bearer | List applicant profiles |
| `POST` | `/users/me/profiles` | Bearer | Create applicant profile |
| `DELETE` | `/users/me/profiles/:id` | Bearer | Soft-delete profile |
| `POST` | `/users/me/gdpr/delete-request` | Bearer | Schedule account deletion (GDPR) |

### Organizations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/organizations` | — | List organizations (filterable) |
| `GET` | `/organizations/:id` | — | Organization detail with procedures |
| `POST` | `/organizations` | Admin | Create organization |
| `PUT` | `/organizations/:id` | Admin | Update organization |

### Procedures

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/procedures` | — | Paginated procedure catalog |
| `GET` | `/procedures/:id` | — | Procedure detail with requirements |
| `POST` | `/procedures` | Admin/Operator | Create procedure |
| `PUT` | `/procedures/:id` | Admin/Operator | Update procedure |

### Bookings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/bookings` | Bearer | List own bookings (paginated) |
| `POST` | `/bookings` | Bearer | Create booking draft (accepts `preferredDateFrom`, `preferredDateTo`, `preferredTimeSlot`) |
| `GET` | `/bookings/:id` | Bearer | Booking detail with attempts and appointment |
| `POST` | `/bookings/:id/validate` | Bearer | Run eligibility and completeness check |
| `POST` | `/bookings/:id/execute` | Bearer | Execute booking (legacy — automated or assisted) |
| `POST` | `/bookings/:id/confirm-payment` | Bearer | Confirm slot after `PRE_CONFIRMED` — moves to `CONFIRMED` and sends appointment details |

### Payments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/payments` | Bearer | List own payments with invoices |
| `POST` | `/payments/checkout` | Bearer | Create Stripe Checkout session |
| `POST` | `/payments/demo-checkout` | Bearer | Demo mode — marks payment as paid and starts background search |
| `POST` | `/payments/webhook` | Stripe sig | Handle Stripe webhook events |

### Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/notifications` | Bearer | List own notifications (last 50) |
| `POST` | `/notifications/:id/read` | Bearer | Mark a notification as read |
| `POST` | `/notifications/read-all` | Bearer | Mark all notifications as read |

### Connectors

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/connectors` | — | List all connectors with capabilities |
| `GET` | `/connectors/registry` | Admin/Operator | List registered adapter instances |
| `GET` | `/connectors/:id/availability` | Bearer | Query available time slots |
| `POST` | `/connectors/:id/toggle` | Admin | Enable or disable a connector |

### Compliance

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/compliance/evaluate` | Admin/Compliance | Dry-run compliance check (no save) |
| `POST` | `/compliance/review` | Admin/Compliance | Full compliance review with persistence |
| `GET` | `/compliance/connector/:id` | Admin/Compliance/Operator | Review history for a connector |

### Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/admin/stats` | Admin/Operator | Dashboard KPIs |
| `GET` | `/admin/bookings` | Admin/Operator | All bookings across all users |
| `GET` | `/admin/users` | Admin | All user accounts |
| `GET` | `/admin/audit-logs` | Admin/Compliance | Immutable audit trail |

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | — | Liveness check |

---

## Filters reference

### `GET /procedures`

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `search` | string | `desempleo` | Name contains (case-insensitive) |
| `country` | string | `ES` | ISO country code |
| `organizationId` | UUID | `abc-123` | Filter by organization |
| `category` | string | `Empleo` | Exact category match |
| `page` | number | `1` | Page number (default `1`) |
| `limit` | number | `20` | Results per page (default `20`) |

### `GET /organizations`

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `country` | string | `ES` | ISO country code |
| `region` | string | `Madrid` | Region/province |
| `search` | string | `SEPE` | Name contains (case-insensitive) |

### `GET /bookings`

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Results per page |

### `GET /admin/bookings`

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `status` | BookingStatus | `COMPLETED` | Filter by booking status |
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Results per page |

### `GET /admin/audit-logs`

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `userId` | UUID | `abc-123` | Filter by user |
| `entityType` | string | `BookingRequest` | Filter by entity type |
| `action` | AuditAction | `PAYMENT` | Filter by action type |
| `page` | number | `1` | Page number |
| `limit` | number | `50` | Results per page (default `50`) |

### `GET /connectors/:id/availability`

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `procedureId` | UUID | `abc-123` | Required — procedure to check |
| `fromDate` | ISO date | `2026-04-01` | Start of date range |
| `toDate` | ISO date | `2026-04-15` | End of date range |

---

## Dashboard charts

The admin dashboard (`GET /admin/stats`) returns data that drives the following visualizations:

### Booking status distribution (donut / bar chart)

Source: `bookingRequest.groupBy({ by: ['status'], _count: true })`

```
DRAFT                ██░░░░░░░░  12%
PENDING_PAYMENT      ███░░░░░░░  18%
PAID                 ██░░░░░░░░  10%
IN_PROGRESS          █░░░░░░░░░   5%
COMPLETED            ████████░░  42%
REQUIRES_USER_ACTION ██░░░░░░░░   8%
ERROR                █░░░░░░░░░   3%
CANCELLED            ░░░░░░░░░░   2%
```

### Revenue over time (line chart)

Source: `payment.aggregate({ _sum: { amount }, where: { status: 'PAID' } })`

Group by `paidAt` truncated to day/week/month for time-series display.

### KPI cards

| Metric | Source |
|--------|--------|
| Total users | `user.count` |
| Active procedures | `procedure.count({ isActive: true })` |
| Total revenue | `payment._sum.amount` where `status = PAID` |
| Bookings by status | `bookingRequest.groupBy` |

### Connector health (status table)

Source: `connector.findMany` with `status`, `lastComplianceCheck`, `complianceLevel`

Highlights connectors with `status = SUSPENDED` or `complianceLevel = CRITICAL`.

---

## Compliance engine

Every connector must pass a compliance review before it can operate in automated mode. The engine applies non-negotiable rules:

```
requiresCaptchaBypass   = true  →  MANUAL_ASSISTED (CRITICAL) — cannot activate
requiresAntiBotEvasion  = true  →  MANUAL_ASSISTED (CRITICAL) — cannot activate
requiresRateLimitEvasion = true →  MANUAL_ASSISTED (CRITICAL) — cannot activate
requiresAuthBypass      = true  →  MANUAL_ASSISTED (CRITICAL) — cannot activate

hasOfficialApi + apiDocsChecked + termsChecked = true  →  OFFICIAL_API (LOW)
hasAuthorizedIntegration + termsChecked = true         →  AUTHORIZED_INTEGRATION (MEDIUM)
otherwise                                              →  MANUAL_ASSISTED (HIGH)
```

Reviews are stored in `ComplianceReview` and expire after 1 year. Connectors must be re-reviewed annually.

---

## Connector architecture

Each connector implements the `IConnector` interface:

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

To add a new connector:

1. Create `apps/backend/src/modules/connectors/adapters/<name>.connector.ts`
2. Implement `IConnector`
3. Run `POST /compliance/review` — connector only activates if compliance passes
4. Register in `connector.registry.ts`

A mock connector (`mock-connector-001`) is included for development and testing.

---

## Installation

### Prerequisites

- Node.js >= 20
- PostgreSQL >= 14
- Redis >= 7

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp apps/backend/.env.example apps/backend/.env
# Edit .env — see Environment variables section

# 3. Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Run database migrations
npm run db:migrate

# 5. Load seed data
npm run db:seed

# 6. Start backend (port 3001)
npm run dev --workspace=apps/backend

# 7. Start frontend (port 3000) — separate terminal
npm run dev --workspace=apps/frontend
```

### Docker

```bash
docker-compose up -d
```

### Seed credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@gestorcitas.app` | `Admin1234!` |
| User | `usuario@ejemplo.com` | `User1234!` |

---

## How to update data

### Add a new organization

```bash
curl -X POST http://localhost:3001/api/organizations \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Agencia Tributaria",
    "slug": "aeat",
    "country": "ES",
    "website": "https://www.agenciatributaria.es"
  }'
```

### Add a new procedure

```bash
curl -X POST http://localhost:3001/api/procedures \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "<org-id>",
    "name": "Cita previa IRPF",
    "slug": "cita-irpf",
    "category": "Fiscal",
    "serviceFee": 14.99,
    "currency": "EUR",
    "formSchema": {
      "fields": [
        { "name": "nif", "label": "NIF", "type": "text", "required": true },
        { "name": "phone", "label": "Teléfono", "type": "tel", "required": true }
      ]
    }
  }'
```

### Run a compliance review on a connector

```bash
curl -X POST http://localhost:3001/api/compliance/review \
  -H "Authorization: Bearer <compliance-officer-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "connectorId": "<connector-id>",
    "termsChecked": true,
    "robotsTxtChecked": true,
    "apiDocsChecked": true,
    "hasOfficialApi": true,
    "hasAuthorizedIntegration": false,
    "requiresCaptchaBypass": false,
    "requiresAntiBotEvasion": false,
    "requiresRateLimitEvasion": false,
    "requiresAuthBypass": false,
    "legalBasis": "API pública oficial — ver documentación en portal"
  }'
```

### Toggle a connector on/off

```bash
curl -X POST http://localhost:3001/api/connectors/<id>/toggle \
  -H "Authorization: Bearer <admin-token>"
```

### Update seed data

Edit `apps/backend/prisma/seed.ts` and re-run:

```bash
npm run db:seed
```

### Database migrations

```bash
# Create a new migration after schema changes
npm run db:migrate

# Open Prisma Studio (visual DB browser)
npm run db:studio
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `JWT_EXPIRES_IN` | No | Token TTL (default `15m`) |
| `ENCRYPTION_KEY` | Yes | 64-char hex key for AES-256-GCM |
| `HASH_SALT` | Yes | Salt for one-way hashing |
| `FRONTEND_URL` | Yes | Frontend origin for CORS and Stripe redirects |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (live or test mode) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `STRIPE_DEMO_MODE` | No | Set to `true` to skip Stripe and use demo payments |
| `REDIS_URL` | Yes | Redis connection string for BullMQ |
| `S3_ENDPOINT` | No | S3-compatible storage endpoint |
| `S3_BUCKET` | No | Bucket name for document storage |
| `S3_ACCESS_KEY` | No | S3 access key |
| `S3_SECRET_KEY` | No | S3 secret key |
| `SMTP_HOST` | No | SMTP server for email notifications |
| `PORT` | No | Backend port (default `3001`) |
| `LOG_LEVEL` | No | Winston log level (default `info`) |

---

## Development workflow

See [WORKFLOW.md](./WORKFLOW.md) for the full guide.

```bash
# Install git hooks (once per clone)
bash .workflow/install-hooks.sh

# Start a new task
gw start feature/my-feature

# Push with auto-sync and validation
gw push

# Promote to QA
gw promote qa

# Release to production
gw promote prod
```

Branch model: `feature/*` and `fix/*` branch from `qa`. `hotfix/*` branches from `main`. All automation via the `gw` CLI.

---

## Legal disclaimer

This application is an independent intermediary service. It does not represent, is not affiliated with, and has not been authorized by any government agency or public organization. All trademarks and names of public organizations belong to their respective owners.
