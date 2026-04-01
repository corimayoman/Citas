# Plan de Implementación: Flujo Real de Reserva con Conectores

## Visión General

Implementación incremental del flujo real de reserva: primero la infraestructura (schema, colas, rate limiter, circuit breaker), luego la clase base de conectores, el worker de búsqueda, las reglas de negocio (validación 24h, auto-cancelación, intercepción de email), y finalmente los conectores reales empezando por Extranjería.

## Tareas

- [x] 1. Cambios en el schema de Prisma y migración
  - [x] 1.1 Añadir campos nuevos a `BookingRequest`, `Connector` y `BookingAttempt`
    - Añadir `maxSearchAttempts Int?`, `searchJobId String?` a `BookingRequest`
    - Añadir `lastHealthCheck DateTime?`, `errorRate Float? @default(0)`, `avgResponseTimeMs Int?`, `suspendedReason String?`, `suspendedAt DateTime?` a `Connector`
    - Añadir `responseTimeMs Int?`, `httpStatusCode Int?` a `BookingAttempt`
    - _Requisitos: 2.5, 7.1, 10.3_

  - [x] 1.2 Crear modelo `InterceptedEmail`
    - Crear tabla `intercepted_emails` con campos: `id`, `bookingRequestId`, `fromAddress`, `subject`, `rawBody`, `parsedData`, `portalOrigin`, `correlationStatus`, `processedAt`, `createdAt`
    - Añadir relación `interceptedEmails` en `BookingRequest`
    - _Requisitos: 9.1, 9.2_

  - [x] 1.3 Generar y aplicar migración de Prisma
    - Ejecutar `npx prisma migrate dev --name add_real_connector_fields`
    - Verificar que el cliente Prisma se regenera correctamente
    - _Requisitos: 1.1, 1.2_

- [x] 2. Checkpoint — Verificar que la migración se aplica correctamente
  - Asegurar que todos los tests existentes pasan, preguntar al usuario si surgen dudas.

- [x] 3. Infraestructura: RateLimiter y CircuitBreaker
  - [x] 3.1 Implementar `RateLimiter` con token bucket en Redis
    - Crear `src/modules/connectors/rate-limiter.ts`
    - Implementar clase `RateLimiter` con constructor `(connectorSlug, requestsPerMinute)`, métodos `acquire()` (blocking) y `tryAcquire()` (non-blocking)
    - Usar Redis MULTI/EXEC para atomicidad del token bucket
    - _Requisitos: 6.5_

  - [ ]* 3.2 Test de propiedad para RateLimiter
    - **Propiedad 15: Enforcement del rate limiter**
    - **Valida: Requisitos 6.5**

  - [x] 3.3 Implementar `CircuitBreakerService`
    - Crear `src/modules/connectors/circuit-breaker.service.ts`
    - Implementar métodos: `recordFailure(connectorId, reason)`, `recordSuccess(connectorId)`, `isOpen(connectorId)`, `suspend(connectorId, reason)`, `reactivate(connectorId, adminUserId)`, `getStatus(connectorId)`
    - Usar Redis para contadores rápidos de fallos y Prisma para persistir estado `SUSPENDED` en tabla `Connector`
    - Al suspender: registrar en `AuditLog` con acción `CONNECTOR_TOGGLE`, notificar a OPERATOR/ADMIN
    - _Requisitos: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 3.4 Tests de propiedad para CircuitBreaker
    - **Propiedad 17: Circuit breaker se activa ante anomalías**
    - **Propiedad 18: Efectos secundarios de la suspensión del circuit breaker**
    - **Valida: Requisitos 7.1, 7.2, 7.3, 7.4**

- [x] 4. Clase base `BaseRealConnector`
  - [x] 4.1 Crear `BaseRealConnector` abstracta
    - Crear `src/modules/connectors/adapters/base-real.connector.ts`
    - Implementar: constructor con `AxiosInstance` + `RateLimiter`, `healthCheck()`, `getAvailability()`, `book()`, `cancel()`
    - Definir métodos abstractos: `getHealthEndpoint()`, `fetchAvailabilityPage()`, `parseAvailability()`, `submitBookingForm()`, `parseBookingResult()`, `submitCancellation()`, `hasCaptcha()`, `hasExpectedStructure()`
    - Implementar `detectAnomalies()` que lanza `CircuitBreakerError` si detecta CAPTCHA o cambio de estructura
    - _Requisitos: 6.1, 6.2, 6.3, 6.5_

  - [ ]* 4.2 Test de propiedad para email de plataforma en book()
    - **Propiedad 5: El método book usa el email de la plataforma**
    - **Valida: Requisitos 3.1, 6.3**

  - [ ]* 4.3 Test de propiedad para metadata de conectores
    - **Propiedad 14: Completitud de metadata de conectores**
    - **Valida: Requisitos 6.2**

  - [ ]* 4.4 Test de propiedad para HTTPS en conectores reales
    - **Propiedad 26: Conectores usan HTTPS**
    - **Valida: Requisitos 11.2**

- [x] 5. Checkpoint — Verificar infraestructura base
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 6. SearchWorker con BullMQ reemplazando `_runSearchLoop`
  - [x] 6.1 Crear configuración de cola BullMQ
    - Crear `src/modules/bookings/search.queue.ts`
    - Definir cola `booking-search` con configuración de reintentos, backoff exponencial y concurrencia
    - Exportar funciones `enqueueSearchJob(bookingRequestId)` y `removeSearchJob(jobId)`
    - _Requisitos: 1.3, 2.1_

  - [x] 6.2 Implementar `SearchWorker`
    - Crear `src/modules/bookings/search.worker.ts`
    - Implementar worker que: verifica estado SEARCHING, verifica circuit breaker, llama a `getAvailability`, filtra por preferencias, si encuentra slot llama a `book()` → PRE_CONFIRMED, si no re-encola con delay
    - Registrar cada intento en `BookingAttempt` con `responseTimeMs` y `httpStatusCode`
    - Si `CircuitBreakerError` → suspender conector y mover bookings a ERROR
    - Si max intentos → ERROR + notificar usuario
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2_

  - [x] 6.3 Modificar `BookingService.createDraft` para encolar en BullMQ
    - Reemplazar llamada a `_runSearchLoop` por `enqueueSearchJob(booking.id)`
    - Guardar `searchJobId` en el booking
    - Verificar que el conector no esté SUSPENDED antes de encolar
    - _Requisitos: 1.3, 7.5_

  - [ ]* 6.4 Tests de propiedad para SearchWorker
    - **Propiedad 3: Filtrado de slots por preferencias del usuario**
    - **Propiedad 4: Registro de intentos de interacción con portales**
    - **Propiedad 29: Búsqueda solo para bookings en SEARCHING**
    - **Valida: Requisitos 2.1, 2.2, 2.5**

  - [ ]* 6.5 Tests unitarios para SearchWorker
    - Test: max intentos sin disponibilidad → booking pasa a ERROR
    - Test: conector no disponible → error apropiado
    - Test: reserva falla en portal → registra error, continúa búsqueda
    - _Requisitos: 2.4, 3.6_

- [x] 7. Validación de regla 24h en `createDraft` y frontend wizard
  - [x] 7.1 Añadir validación de regla 24h en `BookingService.createDraft`
    - Si `preferredDateFrom` está a menos de 24h del momento actual, rechazar con `AppError(422, ..., 'DATE_TOO_SOON')`
    - Añadir validación en el schema Zod de la ruta POST /bookings
    - _Requisitos: 1.2_

  - [ ]* 7.2 Test de propiedad para regla 24h
    - **Propiedad 1: Validación de regla de 24 horas**
    - **Valida: Requisitos 1.2**

  - [ ]* 7.3 Test de propiedad para elegibilidad del solicitante
    - **Propiedad 2: Validación de elegibilidad del solicitante**
    - **Valida: Requisitos 1.4**

- [x] 8. Reserva exitosa → PRE_CONFIRMED con deadline y ocultación de detalles
  - [x] 8.1 Refactorizar `_confirmSlot` para calcular deadline y ocultar detalles
    - Asegurar que `paymentDeadline = selectedDate - 24h`
    - Asegurar que `externalRef` se guarda correctamente
    - _Requisitos: 3.2, 3.3_

  - [x] 8.2 Modificar `getBookingById` para ocultar detalles en PRE_CONFIRMED
    - Si estado es `PRE_CONFIRMED`, excluir `confirmationCode` y `location` del `Appointment` en la respuesta
    - Si estado es `CONFIRMED`, incluir todos los detalles
    - _Requisitos: 3.5_

  - [ ]* 8.3 Tests de propiedad para PRE_CONFIRMED
    - **Propiedad 6: Reserva exitosa produce PRE_CONFIRMED con deadline correcto**
    - **Propiedad 7: PRE_CONFIRMED oculta detalles hasta el pago**
    - **Valida: Requisitos 3.2, 3.3, 3.5**

- [x] 9. Restricción de checkout solo para PRE_CONFIRMED y transición a CONFIRMED
  - [x] 9.1 Modificar `PaymentService` para validar estado PRE_CONFIRMED
    - Rechazar creación de checkout si el booking no está en `PRE_CONFIRMED` con error `NOT_PRE_CONFIRMED`
    - Rechazar si `paymentDeadline` ya venció con error `PAYMENT_DEADLINE_EXPIRED`
    - _Requisitos: 4.1_

  - [x] 9.2 Verificar transición CONFIRMED tras pago exitoso
    - Asegurar que `confirmAfterPayment` actualiza a `CONFIRMED` con `completedAt`
    - Asegurar que la notificación incluye fecha, hora, ubicación y código de confirmación
    - _Requisitos: 4.2, 4.3_

  - [ ]* 9.3 Tests de propiedad para flujo de pago
    - **Propiedad 8: Solo PRE_CONFIRMED permite crear checkout**
    - **Propiedad 9: Pago exitoso transiciona a CONFIRMED**
    - **Propiedad 10: Unicidad de número de factura**
    - **Propiedad 11: Tarifa de servicio dentro del rango válido**
    - **Valida: Requisitos 4.1, 4.2, 4.4, 4.6**

- [x] 10. Checkpoint — Verificar flujo completo SEARCHING → PRE_CONFIRMED → CONFIRMED
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 11. Cron job de auto-cancelación por impago
  - [x] 11.1 Implementar `AutoCancellationCronJob`
    - Crear `src/modules/bookings/auto-cancellation.cron.ts`
    - Usar BullMQ repeatable job cada 5 minutos
    - Buscar `BookingRequest` WHERE `status = PRE_CONFIRMED AND paymentDeadline < NOW()`
    - Para cada uno: obtener conector, llamar `cancel(confirmationCode)`, si éxito → EXPIRED + notificar, si fallo → ERROR + alertar operaciones
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 11.2 Tests de propiedad para auto-cancelación
    - **Propiedad 12: Deadline vencido produce cancelación y estado EXPIRED**
    - **Valida: Requisitos 5.1, 5.2**

  - [ ]* 11.3 Tests unitarios para auto-cancelación
    - Test: cancelación en portal falla → ERROR + alerta operaciones
    - _Requisitos: 5.5_

- [x] 12. Servicio de intercepción de email
  - [x] 12.1 Implementar `EmailInterceptionService`
    - Crear `src/modules/email-interception/email-interception.service.ts`
    - Implementar: `processInboundEmail(payload)`, `parseConfirmation(body, from)`, `correlateToBooking(parsed)`, `formatConfirmation(parsed)`
    - Guardar emails en tabla `InterceptedEmail` con estado de correlación
    - Si no correlaciona → registrar anomalía en audit log
    - _Requisitos: 9.1, 9.2, 9.3_

  - [x] 12.2 Crear endpoint webhook para inbound email
    - Crear `src/modules/email-interception/email-interception.routes.ts`
    - Endpoint POST `/webhooks/inbound-email` que recibe payload de SendGrid Inbound Parse
    - Validar firma/autenticidad del webhook
    - _Requisitos: 9.1_

  - [x] 12.3 Crear parsers por portal
    - Crear `src/modules/email-interception/parsers/extranjeria.parser.ts`
    - Crear `src/modules/email-interception/parsers/generic.parser.ts`
    - Cada parser extrae: `confirmationCode`, `appointmentDate`, `appointmentTime`, `location`
    - _Requisitos: 9.4_

  - [ ]* 12.4 Tests de propiedad para intercepción de email
    - **Propiedad 22: Parsing de emails de confirmación**
    - **Propiedad 23: Correlación de email a reserva**
    - **Propiedad 24: Round-trip de parsing/formateo de emails**
    - **Valida: Requisitos 9.1, 9.2, 9.5**

- [x] 13. Notificaciones en transiciones de estado
  - [x] 13.1 Asegurar notificaciones en todas las transiciones clave
    - Verificar/añadir notificación en transición a `PRE_CONFIRMED` (ya existe en `_confirmSlot`)
    - Verificar/añadir notificación en transición a `CONFIRMED` (ya existe en `confirmAfterPayment`)
    - Añadir notificación en transición a `EXPIRED` (en auto-cancelación)
    - Añadir notificación en transición a `ERROR` por conector suspendido
    - _Requisitos: 3.4, 4.3, 5.3, 7.6_

  - [ ]* 13.2 Test de propiedad para notificaciones
    - **Propiedad 13: Notificaciones en transiciones de estado**
    - **Valida: Requisitos 3.4, 4.3, 5.3**

- [x] 14. Conector suspendido: rechazar búsquedas y cascada SEARCHING → ERROR
  - [x] 14.1 Implementar rechazo de búsquedas para conector suspendido
    - En `createDraft`: verificar estado del conector, si `SUSPENDED` → error `CONNECTOR_SUSPENDED` (503)
    - En `SearchWorker`: verificar estado antes de cada intento
    - _Requisitos: 7.5_

  - [x] 14.2 Implementar cascada SEARCHING → ERROR al suspender conector
    - En `CircuitBreakerService.suspend()`: buscar bookings en SEARCHING del conector, moverlos a ERROR, notificar usuarios
    - _Requisitos: 7.6_

  - [ ]* 14.3 Tests de propiedad para conector suspendido
    - **Propiedad 19: Conector suspendido rechaza nuevas búsquedas**
    - **Propiedad 20: Suspensión cascada SEARCHING → ERROR**
    - **Valida: Requisitos 7.5, 7.6**

- [x] 15. Checkpoint — Verificar flujo completo incluyendo cancelación y circuit breaker
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 16. Auditoría y observabilidad
  - [x] 16.1 Añadir auditoría de transiciones de estado
    - Registrar en `AuditLog` cada cambio de estado de BookingRequest con datos antes/después
    - Registrar accesos a datos personales con acción `READ`
    - _Requisitos: 10.1, 11.4_

  - [ ]* 16.2 Tests de propiedad para auditoría
    - **Propiedad 28: Auditoría de acceso a datos personales**
    - **Propiedad 30: Auditoría de transiciones de estado**
    - **Valida: Requisitos 10.1, 11.4**

- [x] 17. Seguridad y protección de datos
  - [x] 17.1 Verificar cifrado round-trip de formData
    - Asegurar que `encrypt()`/`decrypt()` funcionan correctamente para formData
    - _Requisitos: 11.1_

  - [ ]* 17.2 Test de propiedad para cifrado round-trip
    - **Propiedad 25: Round-trip de cifrado de formData**
    - **Valida: Requisitos 11.1**

  - [x] 17.3 Implementar purga de datos sensibles tras 30 días
    - Crear cron job o extensión del cron existente que busque Reservas CONFIRMED/EXPIRED con cita > 30 días atrás
    - Reemplazar `formData` con marcador de datos purgados
    - _Requisitos: 11.3_

  - [ ]* 17.4 Test de propiedad para purga de datos
    - **Propiedad 27: Purga de datos sensibles tras 30 días**
    - **Valida: Requisitos 11.3**

- [x] 18. Conector Extranjería (prioridad alta)
  - [x] 18.1 Implementar `ExtranjeriaConnector` extendiendo `BaseRealConnector`
    - Crear `src/modules/connectors/adapters/extranjeria.connector.ts`
    - Implementar todos los métodos abstractos: `getHealthEndpoint()`, `fetchAvailabilityPage()`, `parseAvailability()`, `submitBookingForm()`, `parseBookingResult()`, `submitCancellation()`, `hasCaptcha()`, `hasExpectedStructure()`
    - Configurar metadata con `organizationSlug: 'extranjeria'`, `integrationType: 'AUTHORIZED_INTEGRATION'`, `complianceLevel: 'CRITICAL'`
    - _Requisitos: 8.1, 8.2_

  - [x] 18.2 Registrar `ExtranjeriaConnector` en `ConnectorRegistry`
    - Añadir registro en el constructor de `ConnectorRegistry`
    - Ejecutar `healthCheck()` al registrar
    - _Requisitos: 8.5, 8.6_

  - [x] 18.3 Crear parser de email para Extranjería
    - Ya creado en tarea 12.3, verificar que funciona con emails reales del portal
    - _Requisitos: 9.4_

  - [ ]* 18.4 Tests de propiedad para registro de conector
    - **Propiedad 16: Round-trip del registro de conectores**
    - **Propiedad 21: HealthCheck al registrar conector**
    - **Valida: Requisitos 6.6, 8.6**

  - [ ]* 18.5 Tests unitarios para ExtranjeriaConnector
    - Test: conectores registrados al bootstrap incluyen Extranjería
    - Test: healthCheck falla → no bloquea registro
    - _Requisitos: 8.1, 8.6_

- [x] 19. Checkpoint — Verificar conector Extranjería integrado end-to-end
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 20. Conectores adicionales (DGT, AEAT, SEPE, Registro Civil)
  - [x] 20.1 Implementar `DgtConnector` extendiendo `BaseRealConnector`
    - Crear `src/modules/connectors/adapters/dgt.connector.ts`
    - Implementar métodos abstractos específicos para el portal de DGT
    - Registrar en `ConnectorRegistry`
    - _Requisitos: 8.1, 8.3_

  - [x] 20.2 Implementar `AeatConnector` extendiendo `BaseRealConnector`
    - Crear `src/modules/connectors/adapters/aeat.connector.ts`
    - Implementar métodos abstractos específicos para el portal de AEAT
    - Registrar en `ConnectorRegistry`
    - _Requisitos: 8.1, 8.3_

  - [x] 20.3 Implementar `SepeConnector` extendiendo `BaseRealConnector`
    - Crear `src/modules/connectors/adapters/sepe.connector.ts`
    - Implementar métodos abstractos específicos para el portal de SEPE
    - Registrar en `ConnectorRegistry`
    - _Requisitos: 8.1, 8.3_

  - [x] 20.4 Implementar `RegistroCivilConnector` extendiendo `BaseRealConnector`
    - Crear `src/modules/connectors/adapters/registro-civil.connector.ts`
    - Implementar métodos abstractos específicos para el portal de Registro Civil
    - Registrar en `ConnectorRegistry`
    - _Requisitos: 8.1, 8.4_

  - [x] 20.5 Crear parsers de email para DGT, AEAT, SEPE y Registro Civil
    - Crear `src/modules/email-interception/parsers/dgt.parser.ts`
    - Crear `src/modules/email-interception/parsers/aeat.parser.ts`
    - Crear `src/modules/email-interception/parsers/sepe.parser.ts`
    - Crear `src/modules/email-interception/parsers/registro-civil.parser.ts`
    - _Requisitos: 9.4_

  - [ ]* 20.6 Tests unitarios para conectores adicionales
    - Test: todos los conectores registrados al bootstrap
    - Test: healthCheck de cada conector
    - _Requisitos: 8.1, 8.5_

- [x] 21. Integración final y wiring
  - [x] 21.1 Registrar rutas de email interception en main.ts
    - Añadir `app.use('/webhooks', emailInterceptionRoutes)`
    - Inicializar SearchWorker y cron jobs al arrancar la aplicación
    - _Requisitos: 9.1_

  - [x] 21.2 Inicializar BullMQ workers y cron jobs en bootstrap
    - Arrancar `SearchWorker` al iniciar la app
    - Arrancar `AutoCancellationCronJob` (repeatable cada 5 min)
    - Arrancar cron de purga de datos sensibles
    - _Requisitos: 1.3, 5.4_

  - [x] 21.3 Exponer métricas de salud de conectores para ADMIN
    - Añadir endpoint GET `/admin/connectors/health` con datos de último healthCheck, errorRate, avgResponseTimeMs
    - Proteger con middleware de autenticación + rol ADMIN
    - _Requisitos: 10.4_

- [x] 22. Tablero de salud de conectores (Admin Frontend)
  - [x] 22.1 Crear página `/admin/connectors` en el frontend
    - Tabla con todos los conectores: nombre, slug, estado (ACTIVE/SUSPENDED/INACTIVE), último healthCheck, errorRate, avgResponseTimeMs, suspendedReason
    - Indicador visual de estado: verde (ACTIVE), rojo (SUSPENDED), gris (INACTIVE)
    - Botón "Reactivar" para conectores SUSPENDED (llama a endpoint de reactivación)
    - Botón "Ejecutar healthCheck" para verificar manualmente un conector
    - Auto-refresh cada 30 segundos
    - _Requisitos: 10.4_

  - [x] 22.2 Añadir endpoint POST `/admin/connectors/:id/reactivate` en backend
    - Llama a `circuitBreakerService.reactivate(connectorId, adminUserId)`
    - Proteger con middleware de autenticación + rol ADMIN
    - _Requisitos: 7.3_

  - [x] 22.3 Añadir endpoint POST `/admin/connectors/:id/health-check` en backend
    - Ejecuta `healthCheck()` del conector y actualiza `lastHealthCheck` en DB
    - Devuelve resultado del healthCheck (ok/fail + responseTime)
    - Proteger con middleware de autenticación + rol ADMIN
    - _Requisitos: 10.4_

  - [x] 22.4 Modo dry-run para testing de conectores reales
    - Añadir endpoint POST `/admin/connectors/:id/dry-run` que ejecuta `getAvailability()` sin hacer booking
    - Devuelve los slots encontrados o el error si el portal no responde
    - Útil para verificar que el scraping/parsing sigue funcionando
    - Proteger con middleware de autenticación + rol ADMIN
    - _Requisitos: 8.5, 10.4_

- [x] 23. Checkpoint final — Verificar todo el flujo integrado
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido.
- Cada tarea referencia los requisitos específicos para trazabilidad.
- Los checkpoints aseguran validación incremental.
- Los tests de propiedades validan propiedades universales de corrección.
- Los tests unitarios validan ejemplos específicos y edge cases.
- El orden de implementación respeta las dependencias: schema → infraestructura → clase base → worker → reglas de negocio → conectores reales.
