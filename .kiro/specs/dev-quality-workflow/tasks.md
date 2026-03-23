# Plan de implementación: Dev Quality Workflow

## Overview

Extender la infraestructura existente (GitHub Actions, scripts `.workflow/`, jest) para implementar el workflow completo de calidad: tests unitarios, cobertura, CI robusto, regresión diaria, QA gate, ambiente QA en Railway y documentación de mocks.

Las tareas están ordenadas por dependencia: los tests van primero porque el CI los necesita, luego la infraestructura de CI, luego el ambiente QA.

## Tasks

- [x] 1. Tests unitarios backend
  - [x] 1.1 Crear `src/modules/auth/__tests__/auth.service.test.ts`
    - Mockear `../../lib/prisma` con `jest.mock`
    - Mockear `bcryptjs` y `jsonwebtoken`
    - Cubrir: `register` (happy path, email duplicado), `login` (credenciales válidas, inválidas, usuario inexistente), `refreshToken` (token válido, expirado), `logout`
    - Verificar invariante: no se puede registrar dos usuarios con el mismo email
    - _Requirements: 5.1, 5.5, 5.6_
  - [ ]* 1.2 Escribir property test para auth.service
    - **Property 1: Idempotencia de la suite de auth**
    - **Validates: Requirements 5.7**
  - [x] 1.3 Crear `src/modules/bookings/__tests__/booking.service.test.ts`
    - Mockear prisma, connector.registry y payment.service
    - Cubrir: `createDraft` (happy path, perfil inexistente), `_runSearchLoop` (slot encontrado, sin slots), `confirmAfterPayment` (transición PRE_CONFIRMED → CONFIRMED)
    - Verificar máquina de estados: transiciones válidas e inválidas (ej: CONFIRMED → SEARCHING debe fallar)
    - Verificar invariante: una cita no puede tener fecha de inicio posterior a su fecha de fin
    - Verificar invariante: un usuario no puede tener dos citas activas para el mismo trámite en el mismo horario
    - _Requirements: 5.1, 5.5, 5.6_
  - [ ]* 1.4 Escribir property test para booking.service — máquina de estados
    - **Property 2: Las transiciones de estado del booking siguen la máquina de estados definida**
    - **Validates: Requirements 5.5**
  - [x] 1.5 Crear `src/modules/payments/__tests__/payment.service.test.ts`
    - Mockear prisma y el SDK de Stripe
    - Cubrir: `createDemoCheckout` (STRIPE_DEMO_MODE=true, marca pago como PAID sin llamar a Stripe), `createCheckoutSession` (STRIPE_DEMO_MODE=false, llama a Stripe y retorna URL)
    - Verificar que con STRIPE_DEMO_MODE=true nunca se llama a la API de Stripe real
    - _Requirements: 5.1, 9.3, 9.4_
  - [x] 1.6 Crear `src/modules/users/__tests__/user.service.test.ts`
    - Mockear prisma
    - Cubrir: `getMe` (usuario existente, inexistente), `updateProfile`, `createApplicantProfile`, `deleteApplicantProfile`
    - _Requirements: 5.1, 5.6_
  - [x] 1.7 Crear `src/modules/notifications/__tests__/notification.service.test.ts`
    - Mockear prisma y nodemailer
    - Cubrir: `send` en modo demo (guarda en DB, no llama a nodemailer), comportamiento con distintos tipos de notificación
    - _Requirements: 5.1, 9.2_
  - [x] 1.8 Crear `src/modules/connectors/__tests__/connector.registry.test.ts`
    - Cubrir: `get` (conector registrado, no registrado), `register` (registrar nuevo conector, sobreescribir existente)
    - Verificar que el mock connector retorna estructura de respuesta consistente con el contrato esperado
    - _Requirements: 5.1, 9.2_
  - [x] 1.9 Crear `src/modules/audit/__tests__/audit.service.test.ts`
    - Mockear prisma
    - Cubrir: `log` (happy path, fallo de DB no propaga error al caller)
    - _Requirements: 5.1, 5.6_

- [x] 2. Configurar cobertura jest backend
  - [x] 2.1 Extender `apps/backend/jest.config.js` con `--coverage` y thresholds
    - Agregar `collectCoverage: true`, `coverageDirectory: 'coverage'`, `coverageReporters: ['text', 'lcov', 'json-summary']`
    - Agregar `coverageThresholds`: lines 70%, functions 70%, branches 60%
    - Agregar `collectCoverageFrom` apuntando a `src/modules/**/*.ts` excluyendo `*.routes.ts` y `*.d.ts`
    - Agregar script `"test:coverage": "jest --coverage"` en `package.json` del backend
    - _Requirements: 3.3_
  - [x] 2.2 Checkpoint — correr `npm test` en backend y verificar que todos los tests pasan
    - Asegurarse de que los thresholds no bloquean la suite con la cobertura actual
    - _Requirements: 5.1_

- [x] 3. Extender `ci.yml`
  - [x] 3.1 Agregar step `Check issue reference` en PRs
    - Verificar que el body del PR contenga `Closes #N`, `Refs #N` o `Fixes #N` (regex `(Closes|Refs|Fixes) #[0-9]+`)
    - Si no encuentra la referencia, fallar con mensaje descriptivo en español
    - Solo ejecutar cuando `github.event_name == 'pull_request'`
    - _Requirements: 1.3, 1.4_
  - [x] 3.2 Agregar step `Tests — frontend` condicional
    - Ejecutar `npm test -- --passWithNoTests` en `apps/frontend`
    - Usar `--passWithNoTests` para no bloquear hasta que existan tests
    - _Requirements: 2.1_
  - [x] 3.3 Agregar upload de artefacto `test-report`
    - Agregar `--json --outputFile=test-report.json` al comando de jest del backend
    - Usar `actions/upload-artifact@v4` para subir `apps/backend/test-report.json`
    - Retención de 30 días
    - _Requirements: 3.3, 6.4_
  - [x] 3.4 Agregar step `Comment test results` en PRs
    - Usar `actions/github-script@v7` para leer `test-report.json` y publicar comentario con: tests pasados, fallados, omitidos y link al artefacto
    - Ejecutar con `if: github.event_name == 'pull_request' && always()`
    - _Requirements: 6.4_

- [x] 4. Crear `regression.yml`
  - [x] 4.1 Crear `.github/workflows/regression.yml` con schedule diario 06:00 UTC
    - Trigger: `schedule: cron: '0 6 * * *'` contra rama `main`
    - Levantar postgres efímero igual que `ci.yml`
    - Correr `npm test` en backend con `--json --outputFile=regression-report.json`
    - _Requirements: 4.1, 4.5_
  - [x] 4.2 Agregar step de creación automática de Bug_Issue cuando falla
    - Usar `actions/github-script@v7` con `if: failure()`
    - Crear issue con: label `regression`, título `[Regression] Falla en suite - YYYY-MM-DD`, body con nombre del test fallido y link al artefacto
    - _Requirements: 4.2_
  - [x] 4.3 Agregar lógica de escalado a label `critical` tras 3 días consecutivos
    - Buscar issues abiertos con label `regression` usando `github.rest.issues.listForRepo`
    - Si existe un issue con más de 2 días de antigüedad (mismo título base), agregar label `critical`
    - _Requirements: 4.6_
  - [x] 4.4 Agregar upload de artefacto `regression-report-YYYY-MM-DD`
    - Usar `actions/upload-artifact@v4` con nombre dinámico usando `$(date +%Y-%m-%d)`
    - Retención de 90 días
    - _Requirements: 4.3_

- [x] 5. Extender `deploy-prod.yml` con QA gate
  - [x] 5.1 Agregar job `qa-gate` con postgres efímero antes de `deploy-prod`
    - Mismo setup de postgres que `ci.yml` (imagen `postgres:16-alpine`, mismas credenciales)
    - Correr `npm ci`, `prisma generate`, `prisma migrate deploy` y `npm test` en backend
    - Agregar `needs: qa-gate` al job `deploy-prod` existente
    - _Requirements: 3.1, 3.5_
  - [ ]* 5.2 Verificar que el job `deploy-prod` no corre si `qa-gate` falla
    - Test manual: introducir un test que falla y verificar que el deploy no se dispara
    - _Requirements: 3.1, 3.2_

- [x] 6. Extender `promote.sh` con QA gate local
  - [x] 6.1 Agregar ejecución de `validate.sh` con `RUN_TESTS=true RUN_BUILD=true` antes del confirm en `promote prod`
    - Insertar antes del bloque `if confirm "Merge..."` en la sección `PROMOTE QA → PRODUCTION`
    - Si `validate.sh` falla, mostrar mensaje de error con instrucciones para crear Bug_Issue usando `gh issue create`
    - Abortar con `exit 1` si falla
    - _Requirements: 3.1, 3.2, 3.4_

- [x] 7. Templates de issues GitHub
  - [x] 7.1 Crear `.github/ISSUE_TEMPLATE/feature.yml`
    - Campos: `name: Feature`, labels `["feature"]`, body con: `description` (textarea), `acceptance` (textarea "Criterios de aceptación"), `tests` (textarea "Casos de prueba a implementar")
    - _Requirements: 1.5_
  - [x] 7.2 Crear `.github/ISSUE_TEMPLATE/bug.yml`
    - Campos: `name: Bug`, labels `["bug"]`, body con: `description` (textarea "Descripción del problema"), `reproduction` (textarea "Pasos para reproducir"), `expected` (textarea "Comportamiento esperado"), `test` (input "Test fallido, si aplica")
    - _Requirements: 1.5_
  - [x] 7.3 Crear `.github/ISSUE_TEMPLATE/chore.yml`
    - Campos: `name: Chore`, labels `["chore"]`, body con: `description` (textarea "Descripción")
    - _Requirements: 1.5_

- [x] 8. Extender PR template
  - [x] 8.1 Agregar sección "Issue relacionado" al inicio de `.github/pull_request_template.md`
    - Sección con `Closes #<!-- número de issue obligatorio -->` marcada como obligatoria en el comentario
    - _Requirements: 1.3, 6.2_
  - [x] 8.2 Agregar sección "Tests agregados / modificados"
    - Checklist donde el Developer lista los casos de prueba nuevos o modificados
    - Formato: `- [ ] describe('...') → it('...')`
    - _Requirements: 2.3, 6.3_

- [x] 9. Checkpoint — CI y scripts funcionando
  - Verificar que `ci.yml` pasa en una PR de prueba con referencia a issue
  - Verificar que `ci.yml` falla en una PR sin referencia a issue
  - Asegurarse de que todos los tests pasan, consultar si hay dudas antes de continuar.

- [x] 10. Tests de frontend
  - [x] 10.1 Instalar dependencias de testing en `apps/frontend`
    - Agregar a devDependencies: `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jest-environment-jsdom`, `msw`
    - Agregar `@types/jest` si no está
    - Crear `apps/frontend/jest.config.js` con `testEnvironment: 'jsdom'`, `setupFilesAfterFramework`, soporte para path aliases de Next.js
    - Crear `apps/frontend/jest.setup.ts` con `import '@testing-library/jest-dom'`
    - _Requirements: 8.1_
  - [x] 10.2 Crear handlers MSW para mock de API
    - Crear `apps/frontend/src/__tests__/mocks/handlers.ts` con handlers para: `POST /api/auth/login`, `GET /api/bookings/:id`, `POST /api/bookings`, `POST /api/payments/demo-checkout`, `GET /api/users/me/profiles`
    - Crear `apps/frontend/src/__tests__/mocks/server.ts` con `setupServer(...handlers)`
    - _Requirements: 8.1_
  - [x] 10.3 Crear `src/__tests__/bookings/booking-wizard.test.tsx`
    - Paso 0: sin perfil creado, el wizard bloquea el avance
    - Paso 1: sin rango de fechas válido, el botón "Siguiente" está deshabilitado
    - Paso 2: los campos del formulario se pre-populan con datos del perfil seleccionado
    - Paso 3: revisión y submit llama a `POST /api/bookings` con los datos correctos
    - Submit exitoso redirige a `/bookings/:id`
    - _Requirements: 8.5_
  - [ ]* 10.4 Escribir property test para BookingWizard
    - **Property 3: El wizard nunca avanza al siguiente paso si el paso actual tiene validaciones fallidas**
    - **Validates: Requirements 8.5**
  - [x] 10.5 Crear `src/__tests__/bookings/booking-detail.test.tsx`
    - Estado `SEARCHING`: muestra spinner, no muestra botón de pago ni detalles de cita
    - Estado `PRE_CONFIRMED`: muestra botón de pago, no muestra detalles de cita (fecha, hora, lugar, código)
    - Estado `CONFIRMED`: muestra detalles completos, no muestra botón de pago
    - Estado `COMPLETED`: igual que CONFIRMED
    - Estado `ERROR`: muestra mensaje de error, muestra botón de reintentar si hay pago previo
    - Estado `REQUIRES_USER_ACTION`: muestra link al portal externo
    - Estado `CANCELLED`: muestra mensaje sin acciones disponibles
    - _Requirements: 8.1, 8.3, 8.4_
  - [ ]* 10.6 Escribir property test para BookingDetail
    - **Property 4: El botón de pago aparece si y solo si el estado es PRE_CONFIRMED**
    - **Validates: Requirements 8.3**
  - [x] 10.7 Crear `src/__tests__/payments/payment-flow.test.tsx`
    - Demo mode: botón "Pagar (Demo)" llama a `POST /api/payments/demo-checkout`
    - Demo mode: tras pago exitoso, el booking pasa a estado `CONFIRMED` y el botón desaparece
    - Demo mode: los detalles de la cita se vuelven visibles tras el pago
    - _Requirements: 8.3, 8.4, 9.3_
  - [x] 10.8 Crear `src/__tests__/profile/profile-page.test.tsx`
    - Crear perfil: aparece en la lista inmediatamente
    - Editar perfil: los cambios se reflejan en la lista
    - Eliminar perfil: desaparece de la lista y no aparece en el BookingWizard
    - _Requirements: 8.8_
  - [x] 10.9 Crear `src/__tests__/navigation/auth-guard.test.tsx`
    - Sin sesión activa, todas las rutas del dashboard redirigen a `/login`
    - Con sesión activa, las rutas de auth (`/login`, `/register`) redirigen al dashboard
    - _Requirements: 8.9_
  - [ ]* 10.10 Escribir property test para auth guard
    - **Property 5: Ninguna ruta del dashboard es accesible sin sesión activa**
    - **Validates: Requirements 8.9**

- [x] 11. Crear `MOCKS.md`
  - [x] 11.1 Crear `MOCKS.md` en la raíz del proyecto con el estado actual de cada integración
    - Documentar: búsqueda de citas (mock connector con `DEMO-{timestamp}`), pagos (`STRIPE_DEMO_MODE=true`), notificaciones (DB-only), SSO (no implementado), validación de elegibilidad (siempre `eligible: true`)
    - Usar el formato definido en el diseño: Estado, Módulo, Descripción, Variable de control, Criterio de producción, Issue de seguimiento
    - _Requirements: 9.1, 9.5_
  - [x] 11.2 Agregar step en `ci.yml` para verificar que PRs que modifican módulos mock actualizan `MOCKS.md`
    - Detectar si el PR modifica archivos en `apps/backend/src/modules/connectors/`, `payments/` o `notifications/`
    - Si los modifica, verificar que el body del PR contenga `Updates MOCKS.md`, `Mock unchanged` o `Implements real:`
    - _Requirements: 9.7_

- [x] 12. Checkpoint — tests de frontend y MOCKS.md
  - Correr `npm test` en frontend y verificar que todos los tests pasan
  - Verificar que `MOCKS.md` está completo y refleja el estado real del código
  - Asegurarse de que todos los tests pasan, consultar si hay dudas antes de continuar.

- [ ] 13. Crear proyecto QA en Railway (paso manual)
  - [ ]* 13.1 Instrucciones para crear el proyecto Railway QA
    - Crear proyecto `citas-qa` en Railway con servicios: `backend-qa`, `frontend-qa`, `postgres-qa`, `redis-qa`
    - Configurar variables de entorno de `backend-qa`: `DATABASE_URL` (interna de postgres-qa), `REDIS_URL` (interna de redis-qa), `JWT_SECRET` (distinto al de prod), `ENCRYPTION_KEY` (distinta a la de prod), `STRIPE_DEMO_MODE=true`, `FRONTEND_URL` (URL de frontend-qa), `NODE_ENV=production`
    - Configurar variables de entorno de `frontend-qa`: `NEXT_PUBLIC_API_URL` (URL de backend-qa + `/api`), `NEXT_PUBLIC_STRIPE_DEMO_MODE=true`
    - Obtener los deploy hooks de Railway para `backend-qa` y `frontend-qa`
    - Agregar los secrets en GitHub: `QA_BACKEND_DEPLOY_HOOK`, `QA_FRONTEND_DEPLOY_HOOK`, `QA_BACKEND_URL`, `QA_FRONTEND_URL`
    - _Requirements: 7.1, 7.2, 7.5_

- [x] 14. Extender `deploy-qa.yml`
  - [x] 14.1 Agregar trigger `push` a rama `qa` en `deploy-qa.yml`
    - Trigger: `on: push: branches: [qa]`
    - _Requirements: 7.3_
  - [x] 14.2 Agregar steps de deploy a Railway QA via deploy hooks
    - Step `Deploy backend to QA`: `curl -X POST "${{ secrets.QA_BACKEND_DEPLOY_HOOK }}"`
    - Step `Deploy frontend to QA`: `curl -X POST "${{ secrets.QA_FRONTEND_DEPLOY_HOOK }}"`
    - Si el deploy falla, notificar sin bloquear la rama `qa` (usar `continue-on-error: true`)
    - _Requirements: 7.3, 7.6_

- [x] 15. Documentar QA environment en README
  - [x] 15.1 Agregar sección "QA Environment" al `README.md`
    - URLs del QA environment (backend-qa y frontend-qa)
    - Credenciales de prueba (usuario demo, contraseña demo)
    - Variables de entorno necesarias para conectarse al QA
    - Instrucciones para ejecutar la Regression_Suite contra QA
    - _Requirements: 7.7, 7.8_

- [x] 16. Checkpoint final — verificar todo el workflow
  - Asegurarse de que todos los tests pasan, consultar si hay dudas antes de continuar.

## Notes

- Las tareas marcadas con `*` son opcionales y se pueden saltear para un MVP más rápido
- La tarea 13 (Railway QA) requiere acción manual en la plataforma Railway antes de poder ejecutar la tarea 14
- Cada tarea referencia los requisitos específicos que implementa para trazabilidad
- Los property tests validan invariantes universales; los unit tests validan ejemplos y casos de error concretos
- La Regression_Suite se define con el tag `@regression` en los nombres de los tests y se corre con `--testNamePattern="@regression"`
