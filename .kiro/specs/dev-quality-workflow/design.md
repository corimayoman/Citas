# Design Document — Dev Quality Workflow

## Overview

Este documento describe el diseño técnico del sistema de calidad de desarrollo para la app **Citas**. El objetivo es extender la infraestructura existente (GitHub Actions, `.workflow/` scripts, hooks de git) para implementar los 6 requisitos definidos en `requirements.md`.

El diseño se divide en cuatro capas:
1. **GitHub Actions** — CI, regresión diaria, QA gate
2. **Scripts `.workflow/`** — extensiones a `promote.sh` y `validate.sh`
3. **Tests** — estructura y cobertura inicial
4. **GitHub** — templates de issues y PR

---

## Architecture

### Componentes existentes que se extienden

```
.github/
  workflows/
    ci.yml              → extender: tests + cobertura + comentario en PR
    deploy-prod.yml     → extender: QA gate obligatorio antes de deploy
    regression.yml      → NUEVO: schedule diario
  pull_request_template.md  → extender: sección de tests + referencia a issue
  ISSUE_TEMPLATE/           → NUEVO: templates para feature, bug, chore

.workflow/
  validate.sh           → extender: incluir tests en validación local
  promote.sh            → extender: QA gate en promote prod

apps/backend/
  src/modules/*/
    __tests__/          → tests unitarios por módulo (ya existe en compliance)
  jest.config.js        → ya existe, extender para cobertura

apps/frontend/
  src/
    __tests__/          → NUEVO: tests de componentes críticos
```

### Flujo completo de un cambio

```
Developer
  │
  ├─ gw start feature/GCO-42-descripcion
  │     └─ crea rama asociada al issue #42
  │
  ├─ [trabaja, commitea]
  │     └─ pre-commit hook: detecta secrets, bloquea commits a main/qa
  │
  ├─ gw push
  │     └─ validate.sh: typecheck + lint + tests
  │     └─ si falla → bloquea push, muestra errores
  │
  ├─ Pull Request → qa
  │     └─ CI: typecheck + lint + tests + cobertura
  │     └─ CI: verifica que PR referencie un issue (Closes #N)
  │     └─ CI: publica resumen de tests como comentario en el PR
  │     └─ si falla → bloquea merge
  │
  ├─ gw promote prod
  │     └─ QA gate: corre Test_Suite completa
  │     └─ si falla → aborta, muestra reporte, Developer crea Bug_Issue
  │     └─ si pasa → merge qa → main con aprobación manual en GitHub
  │
GitHub Actions (schedule diario 06:00 UTC)
  └─ regression.yml: corre Regression_Suite contra main
        └─ si falla → crea Bug_Issue automáticamente con label `regression`
        └─ si falla 3 días seguidos → agrega label `critical`
```

---

## Detailed Design

### 1. GitHub Actions — `ci.yml` (extensión)

**Cambios sobre el archivo existente:**

- Agregar step `Tests — frontend` (cuando existan tests de frontend)
- Agregar step `Coverage report` usando `--coverage` en jest backend
- Agregar step `Check issue reference` en PRs: verifica que la descripción del PR contenga `Closes #N` o `Refs #N`
- Agregar step `Comment test results` en PRs: publica resumen de tests como comentario usando `actions/github-script`
- Agregar upload de artefacto `test-report` con el output de jest

```yaml
# Nuevo step: verificar referencia a issue
- name: Check issue reference
  if: github.event_name == 'pull_request'
  run: |
    BODY="${{ github.event.pull_request.body }}"
    if ! echo "$BODY" | grep -qE '(Closes|Refs|Fixes) #[0-9]+'; then
      echo "El PR debe referenciar un issue con 'Closes #N' o 'Refs #N'"
      exit 1
    fi

# Nuevo step: publicar resumen de tests como comentario
- name: Comment test results
  if: github.event_name == 'pull_request' && always()
  uses: actions/github-script@v7
  with:
    script: |
      const fs = require('fs');
      // Lee el reporte generado por jest --json
      // Publica como comentario en el PR
```

### 2. GitHub Actions — `regression.yml` (nuevo)

**Schedule:** todos los días a las 06:00 UTC contra `main`.

**Flujo:**
1. Checkout de `main`
2. Levantar Postgres efímero (igual que `ci.yml`)
3. Correr `npm test` en backend con `--coverage`
4. Si falla → usar `actions/github-script` para crear un issue con label `regression`
5. Si el mismo test falla 3 días seguidos → agregar label `critical` al issue existente (detectado por título del issue)
6. Subir artefacto `regression-report-YYYY-MM-DD`

**Detección de fallas consecutivas:** el workflow busca issues abiertos con label `regression` y título que contenga el nombre del test fallido. Si encuentra uno con más de 2 días de antigüedad, agrega `critical`.

### 3. GitHub Actions — `deploy-prod.yml` (extensión)

**Cambio:** agregar job `qa-gate` que corre antes de `deploy-prod` y bloquea si los tests fallan.

```yaml
jobs:
  qa-gate:
    name: QA Gate
    runs-on: ubuntu-latest
    # mismo setup que ci.yml con postgres
    steps:
      - run: npm test
        working-directory: apps/backend
      # si falla, el job deploy-prod no corre (needs: qa-gate)

  deploy-prod:
    needs: qa-gate
    environment: production  # ya tiene aprobación manual
    ...
```

### 4. Scripts `.workflow/` — extensiones

**`promote.sh` (promote prod):**
Antes del merge qa → main, correr `validate.sh` con `RUN_TESTS=true RUN_BUILD=true`. Si falla, mostrar instrucciones para crear un Bug_Issue y abortar.

```bash
# En la sección PROMOTE QA → PRODUCTION, antes del confirm:
info "Running QA gate (full test suite)..."
if ! RUN_TESTS=true RUN_BUILD=true "$SCRIPT_DIR/validate.sh"; then
  error "QA gate failed. Fix the issues and create a Bug Issue before retrying."
  error "Create issue: gh issue create --label bug --title 'QA Gate failure: <test name>'"
  exit 1
fi
```

**`validate.sh`:**
Ya corre tests cuando `RUN_TESTS=true`. No requiere cambios estructurales, solo asegurarse de que el output de jest se guarde en un archivo para el reporte.

**`start.sh` (nuevo comportamiento):**
Cuando se crea una rama, sugerir el formato `feature/GCO-{issue_number}-descripcion` y validar que el número de issue exista (opcional, requiere `gh` CLI).

### 5. Estructura de tests

#### Backend — cobertura objetivo inicial

Cada módulo tiene su carpeta `__tests__/`. Ya existe `compliance/__tests__/`. Hay que crear el resto.

```
src/modules/
  auth/__tests__/
    auth.service.test.ts      → register, login, refresh, logout
  bookings/__tests__/
    booking.service.test.ts   → createDraft, _runSearchLoop, confirmAfterPayment
  payments/__tests__/
    payment.service.test.ts   → createDemoCheckout, createCheckoutSession
  users/__tests__/
    user.service.test.ts      → getMe, updateProfile, createApplicantProfile
  notifications/__tests__/
    notification.service.test.ts → send (demo mode)
  connectors/__tests__/
    connector.registry.test.ts   → get, register
  audit/__tests__/
    audit.service.test.ts        → log
```

**Patrón de test unitario (backend):**
- Mockear `prisma` con `jest.mock('../../lib/prisma')`
- Mockear dependencias externas (stripe, nodemailer)
- Testear happy path + casos de error + invariantes de negocio

**Tests de integración (API):**
- Usar `supertest` + instancia real de Express con DB de test
- Un test por endpoint documentado en Swagger
- Verificar status codes, estructura de respuesta y errores

#### Frontend — cobertura objetivo inicial

**Herramienta:** `@testing-library/react` + `jest-environment-jsdom`. Jest ya está en devDependencies, solo hay que agregar `@testing-library/react`, `@testing-library/user-event` y `jest-environment-jsdom`.

```
src/__tests__/
  auth/
    login.test.tsx              → login exitoso → redirect dashboard
                                  login fallido → muestra error
                                  sesión expirada → redirect login
    register.test.tsx           → registro exitoso, validaciones de formulario

  bookings/
    booking-wizard.test.tsx     → paso 0: selección de perfil (bloquea sin perfil)
                                  paso 1: validación de fechas (bloquea sin rango)
                                  paso 2: campos del formulario pre-poblados desde perfil
                                  paso 3: revisión y submit → llama POST /bookings
                                  submit exitoso → redirect a /bookings/:id

    booking-detail.test.tsx     → estado SEARCHING: muestra spinner, polling activo
                                  estado PRE_CONFIRMED: muestra botón de pago, oculta detalles de cita
                                  estado CONFIRMED: muestra detalles completos, oculta botón de pago
                                  estado COMPLETED: igual que CONFIRMED
                                  estado ERROR: muestra mensaje, botón reintentar si hay pago
                                  estado REQUIRES_USER_ACTION: muestra link al portal externo
                                  estado CANCELLED/EXPIRED: muestra mensaje sin acciones

    booking-list.test.tsx       → lista vacía, lista con items, paginación

  payments/
    payment-flow.test.tsx       → demo mode: botón "Pagar (Demo)" → llama /payments/demo-checkout
                                  demo mode: tras pago exitoso → booking pasa a CONFIRMED
                                  stripe mode: botón "Pagar con Stripe" → redirect a URL de Stripe

  profile/
    profile-page.test.tsx       → crear perfil → aparece en lista
                                  editar perfil → cambios reflejados
                                  eliminar perfil → desaparece de lista y del wizard
                                  perfil eliminado no aparece en BookingWizard

  navigation/
    auth-guard.test.tsx         → rutas del dashboard sin sesión → redirect /login
                                  rutas de auth con sesión activa → redirect /dashboard
```

**Patrón de test de UI (coherencia de estado):**
```tsx
// Ejemplo: verificar que el botón de pago desaparece tras confirmar
it('oculta el botón de pago cuando el booking pasa a CONFIRMED', async () => {
  // 1. Renderizar con estado PRE_CONFIRMED
  // 2. Verificar que el botón de pago existe
  // 3. Simular pago exitoso (mock de API)
  // 4. Verificar que el botón desaparece y aparecen los detalles de la cita
});
```

**Mock de API en tests de frontend:** usar `msw` (Mock Service Worker) para interceptar llamadas HTTP y simular respuestas del backend sin levantar el servidor real.

#### Regression Suite

La Regression_Suite es un subconjunto de la Test_Suite marcado con el tag `@regression` en los nombres de los tests. Se ejecuta con:

```bash
npm test -- --testNamePattern="@regression"
```

Los tests de regresión cubren los flujos críticos end-to-end:
- Auth: registro → login → refresh → logout
- Booking: crear → SEARCHING → PRE_CONFIRMED → pagar → CONFIRMED
- Payments: demo checkout completo
- Profiles: crear → listar → eliminar

### 6. Templates de GitHub Issues

**`.github/ISSUE_TEMPLATE/feature.yml`**
```yaml
name: Feature
labels: ["feature"]
body:
  - type: textarea
    id: description
    label: Descripción
  - type: textarea
    id: acceptance
    label: Criterios de aceptación
  - type: textarea
    id: tests
    label: Casos de prueba a implementar
```

**`.github/ISSUE_TEMPLATE/bug.yml`**
```yaml
name: Bug
labels: ["bug"]
body:
  - type: textarea
    id: description
    label: Descripción del problema
  - type: textarea
    id: reproduction
    label: Pasos para reproducir
  - type: textarea
    id: expected
    label: Comportamiento esperado
  - type: input
    id: test
    label: Test fallido (si aplica)
```

**`.github/ISSUE_TEMPLATE/chore.yml`**
```yaml
name: Chore
labels: ["chore"]
body:
  - type: textarea
    id: description
    label: Descripción
```

### 7. Pull Request template (extensión)

Agregar al template existente:

```markdown
## Issue relacionado

Closes #<!-- número de issue obligatorio -->

## Tests agregados / modificados

<!-- Lista los casos de prueba nuevos o modificados -->
- [ ] `describe('...') → it('...')`
```

---

### 8. Ambiente QA en Railway

#### Infraestructura

El QA environment es un **proyecto Railway separado** con los mismos servicios que producción:

```
Railway Project: citas-qa
  ├── backend-qa      (mismo Dockerfile que prod)
  ├── frontend-qa     (mismo Dockerfile que prod)
  ├── postgres-qa     (PostgreSQL 16)
  └── redis-qa        (Redis 7)
```

#### Variables de entorno QA (backend-qa)

| Variable | Valor |
|---|---|
| `DATABASE_URL` | URL interna de postgres-qa |
| `REDIS_URL` | URL interna de redis-qa |
| `JWT_SECRET` | secreto distinto al de prod |
| `ENCRYPTION_KEY` | clave distinta a la de prod |
| `STRIPE_DEMO_MODE` | `true` |
| `FRONTEND_URL` | URL de frontend-qa |
| `NODE_ENV` | `production` |

#### Variables de entorno QA (frontend-qa)

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL de backend-qa + `/api` |
| `NEXT_PUBLIC_STRIPE_DEMO_MODE` | `true` |

#### Deploy automático a QA

Railway expone un **deploy hook** (webhook URL) por servicio. El workflow `deploy-qa.yml` lo llama con `curl` cuando hay un push a la rama `qa`.

```yaml
# .github/workflows/deploy-qa.yml (extensión del existente)
- name: Deploy backend to QA
  run: curl -X POST "${{ secrets.QA_BACKEND_DEPLOY_HOOK }}"

- name: Deploy frontend to QA
  run: curl -X POST "${{ secrets.QA_FRONTEND_DEPLOY_HOOK }}"

- name: Wait and run post-deploy setup
  run: |
    sleep 30  # esperar que Railway levante el contenedor
    curl -X POST "${{ secrets.QA_BACKEND_URL }}/api/admin/db-push" \
      -H "Authorization: Bearer ${{ secrets.QA_ADMIN_TOKEN }}"
```

**Alternativa más simple para db:push y seed:** configurar el start command de Railway QA para que siempre corra `prisma db push && prisma db seed && npm start`, igual que producción actualmente.

#### Secrets de GitHub necesarios

```
QA_BACKEND_DEPLOY_HOOK    → webhook URL de backend-qa en Railway
QA_FRONTEND_DEPLOY_HOOK   → webhook URL de frontend-qa en Railway
QA_BACKEND_URL            → https://citas-backend-qa.up.railway.app
QA_FRONTEND_URL           → https://citas-frontend-qa.up.railway.app
```

#### Flujo completo con QA environment

```
feature/GCO-42-descripcion
  │
  ├─ gw push → CI pasa
  ├─ PR → qa (merge)
  │     └─ deploy-qa.yml → Railway QA deploy automático
  │     └─ QA environment disponible para validación manual
  │
  ├─ [Developer valida en QA_Environment]
  │
  ├─ gw promote prod
  │     └─ QA gate (tests)
  │     └─ aprobación manual en GitHub
  │     └─ deploy-prod.yml → Railway prod deploy
```

### 9. Registro de mocks — `MOCKS.md`

Archivo en la raíz del proyecto que documenta el estado de cada integración externa. Se mantiene actualizado manualmente con cada PR que modifica un módulo mock.

#### Estado actual de mocks (al momento de crear este spec)

| Funcionalidad | Módulo | Estado | Comportamiento mock | Criterio para producción real |
|---|---|---|---|---|
| Búsqueda de citas | `connectors/` | **MOCK** | `_runSearchLoop` simula un slot disponible con `DEMO-{timestamp}` cuando no hay conector real | Implementar conector real para cada organismo |
| Pagos | `payments/` | **MOCK** (`STRIPE_DEMO_MODE=true`) | `createDemoCheckout` marca el pago como PAID sin llamar a Stripe | Configurar Stripe real con `STRIPE_DEMO_MODE=false` y webhook real |
| Notificaciones | `notifications/` | **MOCK** | Guarda en DB, no envía email ni SMS real | Configurar SMTP o servicio de SMS real |
| SSO / Login social | `auth/` | **NO IMPLEMENTADO** | No existe | Implementar OAuth con Google/GitHub |
| Validación de elegibilidad | `bookings/` | **MOCK** | `validateBooking` siempre retorna `eligible: true` | Conectar con lógica real de validación por trámite |

#### Formato de entrada en `MOCKS.md`

```markdown
## [Nombre de la funcionalidad]
- **Estado**: MOCK | PARCIAL | REAL
- **Módulo**: ruta al módulo
- **Descripción**: qué hace el mock
- **Variable de control**: (si aplica, ej: STRIPE_DEMO_MODE)
- **Criterio de producción**: qué hay que hacer para reemplazarlo
- **Issue de seguimiento**: #N (cuando se crea el issue para implementarlo)
```

#### Verificación en CI

El CI verifica que si un PR modifica archivos en módulos listados como MOCK en `MOCKS.md`, la descripción del PR incluya una de estas keywords:
- `Updates MOCKS.md` — el PR actualiza el registro
- `Mock unchanged` — el cambio no afecta el comportamiento mock
- `Implements real: <nombre>` — el PR reemplaza el mock por la implementación real

---

Las tareas están ordenadas por dependencia. Cada tarea es un issue en GitHub.

1. **[chore] Estructura base de tests backend** — crear carpetas `__tests__/` y tests unitarios para los 7 módulos sin cobertura. Sin esto, el CI no tiene nada que correr.

2. **[chore] Configurar cobertura en jest** — agregar `--coverage` y thresholds mínimos en `jest.config.js`.

3. **[ci] Extender `ci.yml`** — agregar check de referencia a issue, comentario de resultados en PR, upload de artefacto.

4. **[ci] Crear `regression.yml`** — schedule diario, creación automática de issues, escalado a `critical`.

5. **[ci] Extender `deploy-prod.yml`** — agregar job `qa-gate` como prerequisito del deploy.

6. **[chore] Extender `promote.sh`** — QA gate local antes de promote prod.

7. **[chore] Templates de issues** — crear los 3 templates en `.github/ISSUE_TEMPLATE/`.

8. **[chore] Extender PR template** — agregar sección de issue obligatorio y lista de tests.

9. **[chore] Tests de frontend** — agregar `@testing-library/react`, `@testing-library/user-event`, `msw` y `jest-environment-jsdom`. Implementar tests de coherencia de estado para booking wizard, booking detail (todos los estados), flujo de pago, perfil y auth guard.

10. **[chore] Crear `MOCKS.md`** — documentar el estado actual de todas las integraciones mock: búsqueda de citas, pagos demo, notificaciones, SSO y validación de elegibilidad.

10. **[infra] Crear proyecto QA en Railway** — nuevo proyecto con backend-qa, frontend-qa, postgres-qa y redis-qa. Configurar variables de entorno separadas.

11. **[ci] Extender `deploy-qa.yml`** — agregar llamadas a los deploy hooks de Railway QA al hacer push a la rama `qa`. Configurar los secrets en GitHub.

12. **[docs] Documentar URLs de QA en README** — agregar sección con URLs del QA environment y credenciales de prueba.
