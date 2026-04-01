# Documento de Requisitos — Flujo Real de Reserva con Conectores

## Introducción

Este documento define los requisitos para implementar el flujo real de reserva de citas en portales gubernamentales españoles (Extranjería, DGT, AEAT, SEPE, Registro Civil) en la plataforma Gestor de Citas Oficiales. Actualmente solo existe un conector mock. El flujo real implica: búsqueda en background por agentes, reserva con email propio de la plataforma para interceptar confirmaciones, cobro post-reserva vía Stripe, y cancelación automática si no se paga antes de 24h de la cita.

## Glosario

- **Plataforma**: El sistema Gestor de Citas Oficiales (backend + frontend).
- **Agente_de_Búsqueda**: Proceso en background que busca citas disponibles en portales gubernamentales según las preferencias del usuario.
- **Conector**: Adaptador que implementa la interfaz `IConnector` para interactuar con un portal gubernamental específico.
- **Registro_de_Conectores**: Módulo `ConnectorRegistry` que gestiona los conectores disponibles y su estado.
- **Portal_Gubernamental**: Sitio web oficial de un organismo español donde se gestionan citas (Extranjería, DGT, AEAT, SEPE, Registro Civil).
- **Circuit_Breaker**: Mecanismo que desactiva automáticamente un conector cuando detecta cambios en el portal o presencia de CAPTCHA.
- **Reserva**: Entidad `BookingRequest` que representa la solicitud de cita de un usuario.
- **Cita**: Entidad `Appointment` con los datos concretos de fecha, hora, lugar y código de confirmación.
- **Email_Plataforma**: Dirección de email controlada por la Plataforma, usada para interceptar confirmaciones de los portales.
- **Servicio_de_Pago**: Módulo de pagos integrado con Stripe que gestiona el cobro post-reserva.
- **Servicio_de_Notificaciones**: Módulo que envía notificaciones al usuario por email o SMS.
- **Deadline_de_Pago**: Momento límite para pagar, calculado como 24 horas antes de la fecha de la cita.
- **Tarifa_de_Servicio**: Importe cobrado al usuario por la gestión (entre 9,99€ y 29,99€ según complejidad del trámite).

## Requisitos

### Requisito 1: Solicitud de búsqueda de cita

**User Story:** Como usuario, quiero solicitar la búsqueda de una cita indicando mis preferencias (provincia, tipo de trámite, rango de fechas, franja horaria), para que un agente busque disponibilidad en mi nombre.

#### Criterios de Aceptación

1. WHEN un usuario envía una solicitud de búsqueda, THE Plataforma SHALL crear una Reserva en estado `SEARCHING` con las preferencias indicadas (provincia, procedimiento, rango de fechas, franja horaria).
2. WHEN un usuario envía una solicitud con `preferredDateFrom` a menos de 24 horas del momento actual, THE Plataforma SHALL rechazar la solicitud con el código de error `DATE_TOO_SOON` y un mensaje indicando que la fecha mínima es 24 horas en el futuro.
3. WHEN una Reserva se crea en estado `SEARCHING`, THE Agente_de_Búsqueda SHALL iniciar la búsqueda en background sin bloquear la respuesta al usuario.
4. THE Plataforma SHALL validar la elegibilidad del solicitante (tipo de documento, nacionalidad, edad, campos requeridos) antes de crear la Reserva.

### Requisito 2: Búsqueda de disponibilidad en portales gubernamentales

**User Story:** Como operador de la plataforma, quiero que los agentes busquen citas en los portales reales sin acumular inventario, para que solo se reserve cuando un usuario lo solicita.

#### Criterios de Aceptación

1. THE Agente_de_Búsqueda SHALL consultar disponibilidad en el Portal_Gubernamental únicamente cuando exista una Reserva activa en estado `SEARCHING`.
2. THE Agente_de_Búsqueda SHALL filtrar los slots devueltos por el Portal_Gubernamental según las preferencias del usuario (rango de fechas y franja horaria mañana/tarde).
3. WHEN el Agente_de_Búsqueda no encuentra slots disponibles en un intento, THE Agente_de_Búsqueda SHALL reintentar la búsqueda respetando el rate limit configurado en el Conector.
4. WHEN el Agente_de_Búsqueda alcanza el número máximo de intentos sin encontrar disponibilidad, THE Plataforma SHALL actualizar la Reserva a estado `ERROR` y notificar al usuario.
5. THE Plataforma SHALL registrar cada intento de búsqueda en la tabla `BookingAttempt` con el resultado y timestamp.

### Requisito 3: Reserva de cita con email de la plataforma

**User Story:** Como operador de la plataforma, quiero que al encontrar un slot disponible se reserve la cita usando el email de la plataforma (no el del usuario), para controlar la confirmación hasta que se complete el pago.

#### Criterios de Aceptación

1. WHEN el Agente_de_Búsqueda encuentra un slot disponible, THE Conector SHALL reservar la cita en el Portal_Gubernamental usando los datos del solicitante y el Email_Plataforma como dirección de contacto.
2. WHEN la reserva en el Portal_Gubernamental es exitosa, THE Plataforma SHALL actualizar la Reserva a estado `PRE_CONFIRMED` con la fecha, hora, ubicación y código de confirmación.
3. WHEN la reserva en el Portal_Gubernamental es exitosa, THE Plataforma SHALL calcular el Deadline_de_Pago como 24 horas antes de la fecha de la cita y almacenarlo en la Reserva.
4. WHEN la reserva en el Portal_Gubernamental es exitosa, THE Servicio_de_Notificaciones SHALL enviar una notificación al usuario indicando que se encontró una cita y el plazo para pagar.
5. WHILE la Reserva está en estado `PRE_CONFIRMED`, THE Plataforma SHALL ocultar los detalles completos de la cita (código de confirmación, ubicación exacta) hasta que el pago se confirme.
6. IF la reserva en el Portal_Gubernamental falla, THEN THE Plataforma SHALL registrar el error en `BookingAttempt` y continuar la búsqueda si quedan intentos disponibles.

### Requisito 4: Cobro post-reserva vía Stripe

**User Story:** Como usuario, quiero pagar la tarifa de servicio después de que se encuentre y reserve mi cita, para confirmar la reserva y recibir los detalles completos.

#### Criterios de Aceptación

1. WHEN la Reserva está en estado `PRE_CONFIRMED`, THE Servicio_de_Pago SHALL permitir crear una sesión de checkout de Stripe con el importe de la Tarifa_de_Servicio del trámite.
2. WHEN el pago se completa exitosamente (webhook `checkout.session.completed`), THE Plataforma SHALL actualizar la Reserva a estado `CONFIRMED` y revelar al usuario los detalles completos de la cita (fecha, hora, ubicación, código de confirmación).
3. WHEN el pago se completa exitosamente, THE Servicio_de_Notificaciones SHALL enviar al usuario una notificación con todos los detalles de la cita confirmada.
4. WHEN el pago se completa exitosamente, THE Servicio_de_Pago SHALL generar una factura con número único asociada al pago.
5. IF el webhook de Stripe no llega, THEN THE Servicio_de_Pago SHALL verificar el estado del pago directamente con la API de Stripe cuando el usuario acceda a la página de éxito.
6. THE Tarifa_de_Servicio SHALL estar configurada por trámite en el campo `serviceFee` de la entidad `Procedure`, con valores entre 9,99€ y 29,99€.

### Requisito 5: Cancelación automática por impago

**User Story:** Como operador de la plataforma, quiero que las citas no pagadas se cancelen automáticamente antes de las 24 horas previas a la cita, para liberar el slot y no bloquear disponibilidad de otros ciudadanos.

#### Criterios de Aceptación

1. WHEN el Deadline_de_Pago de una Reserva en estado `PRE_CONFIRMED` se alcanza sin que el pago se haya completado, THE Plataforma SHALL cancelar la cita en el Portal_Gubernamental usando el Conector.
2. WHEN la cancelación automática se ejecuta, THE Plataforma SHALL actualizar la Reserva a estado `EXPIRED`.
3. WHEN la cancelación automática se ejecuta, THE Servicio_de_Notificaciones SHALL informar al usuario de que la cita fue cancelada por falta de pago.
4. THE Plataforma SHALL ejecutar un proceso periódico (cron job) que revise las Reservas en estado `PRE_CONFIRMED` cuyo Deadline_de_Pago haya vencido.
5. IF la cancelación en el Portal_Gubernamental falla, THEN THE Plataforma SHALL registrar el error, marcar la Reserva como `ERROR` y alertar al equipo de operaciones.

### Requisito 6: Interfaz de conector real

**User Story:** Como desarrollador, quiero que cada conector real implemente una interfaz estandarizada con capacidades de búsqueda, reserva y cancelación, para mantener la arquitectura extensible.

#### Criterios de Aceptación

1. THE Conector SHALL implementar la interfaz `IConnector` con los métodos: `healthCheck`, `getAvailability`, `book` y `cancel`.
2. THE Conector SHALL incluir en su metadata el `organizationSlug`, `integrationType`, `complianceLevel` y las capacidades soportadas (`canCheckAvailability`, `canBook`, `canCancel`).
3. WHEN el método `book` se invoca, THE Conector SHALL enviar los datos del solicitante y el Email_Plataforma al Portal_Gubernamental y devolver un `BookingResult` con código de confirmación, fecha, hora y ubicación.
4. WHEN el método `cancel` se invoca con un código de confirmación, THE Conector SHALL cancelar la cita en el Portal_Gubernamental y devolver un booleano indicando éxito o fallo.
5. THE Conector SHALL respetar el rate limit configurado en su registro (`rateLimit` requests por minuto).
6. THE Registro_de_Conectores SHALL permitir registrar y obtener conectores por `id` o por `organizationSlug`.

### Requisito 7: Circuit breaker para cambios en portales

**User Story:** Como operador de la plataforma, quiero que un conector se desactive automáticamente si el portal gubernamental cambia su flujo o introduce CAPTCHA, para evitar errores y mantener la fiabilidad del servicio.

#### Criterios de Aceptación

1. WHEN un Conector detecta un cambio inesperado en la estructura del Portal_Gubernamental (respuesta HTML diferente, nuevos campos requeridos, redirecciones no esperadas), THE Circuit_Breaker SHALL desactivar el Conector cambiando su estado a `SUSPENDED`.
2. WHEN un Conector detecta la presencia de un CAPTCHA o sistema anti-bot en el Portal_Gubernamental, THE Circuit_Breaker SHALL desactivar el Conector inmediatamente cambiando su estado a `SUSPENDED`.
3. WHEN el Circuit_Breaker desactiva un Conector, THE Plataforma SHALL registrar el evento en el log de auditoría con la acción `CONNECTOR_TOGGLE` y los detalles del motivo.
4. WHEN el Circuit_Breaker desactiva un Conector, THE Servicio_de_Notificaciones SHALL alertar al equipo de operaciones (rol `OPERATOR` o `ADMIN`).
5. WHILE un Conector está en estado `SUSPENDED`, THE Plataforma SHALL rechazar nuevas solicitudes de búsqueda para trámites asociados a ese Conector con un mensaje indicando que el servicio está temporalmente no disponible.
6. WHILE un Conector está en estado `SUSPENDED`, THE Plataforma SHALL mover las Reservas activas en estado `SEARCHING` de ese Conector a estado `ERROR` y notificar a los usuarios afectados.
7. THE Conector en estado `SUSPENDED` SHALL requerir revisión manual y reactivación explícita por un usuario con rol `ADMIN` o `COMPLIANCE_OFFICER`.

### Requisito 8: Conectores por organismo

**User Story:** Como operador de la plataforma, quiero tener conectores específicos para cada organismo gubernamental soportado, para gestionar las particularidades de cada portal.

#### Criterios de Aceptación

1. THE Plataforma SHALL soportar conectores para los siguientes organismos: Extranjería (sede.administracionespublicas.gob.es/icpplus), DGT (sedeclave.dgt.gob.es), AEAT (agenciatributaria.gob.es), SEPE (citaprevia-sede.sepe.gob.es) y Registro Civil (sede.mjusticia.gob.es).
2. THE Conector de Extranjería SHALL tener prioridad alta de implementación.
3. THE Conector de DGT, THE Conector de AEAT y THE Conector de SEPE SHALL tener prioridad media de implementación.
4. THE Conector de Registro Civil SHALL tener prioridad baja de implementación.
5. THE Plataforma SHALL registrar cada Conector en el Registro_de_Conectores al iniciar la aplicación.
6. WHEN un nuevo Conector se registra, THE Plataforma SHALL ejecutar un `healthCheck` para verificar la conectividad con el Portal_Gubernamental.

### Requisito 9: Intercepción de email de confirmación

**User Story:** Como operador de la plataforma, quiero interceptar los emails de confirmación que envían los portales gubernamentales, para extraer los datos de la cita y asociarlos a la reserva correspondiente.

#### Criterios de Aceptación

1. WHEN el Portal_Gubernamental envía un email de confirmación al Email_Plataforma, THE Plataforma SHALL recibir y procesar el email para extraer los datos de la cita (código de confirmación, fecha, hora, ubicación).
2. WHEN la Plataforma procesa un email de confirmación, THE Plataforma SHALL asociar los datos extraídos a la Reserva correspondiente usando el código de confirmación o los datos del solicitante como clave de correlación.
3. IF la Plataforma recibe un email de confirmación que no puede asociar a ninguna Reserva, THEN THE Plataforma SHALL registrar el evento como anomalía en el log de auditoría.
4. THE Plataforma SHALL parsear los emails de confirmación de cada Portal_Gubernamental según el formato específico de cada organismo.
5. FOR ALL emails de confirmación válidos, parsear y luego formatear y luego parsear de nuevo SHALL producir datos equivalentes (propiedad round-trip).

### Requisito 10: Observabilidad y auditoría del flujo

**User Story:** Como operador de la plataforma, quiero tener visibilidad completa del flujo de reserva (búsqueda, reserva, pago, confirmación, cancelación), para diagnosticar problemas y cumplir con requisitos de auditoría.

#### Criterios de Aceptación

1. THE Plataforma SHALL registrar en `AuditLog` cada transición de estado de una Reserva con la acción correspondiente, el usuario, y los datos antes/después del cambio.
2. THE Plataforma SHALL registrar en `BookingAttempt` cada intento de interacción con un Portal_Gubernamental, incluyendo el conector usado, el número de intento, el resultado y el mensaje de error si aplica.
3. WHEN un Conector interactúa con un Portal_Gubernamental, THE Plataforma SHALL registrar el tiempo de respuesta y el código de estado HTTP de la interacción.
4. THE Plataforma SHALL exponer métricas de salud de cada Conector (último healthCheck exitoso, tasa de errores, tiempo medio de respuesta) accesibles para usuarios con rol `ADMIN`.

### Requisito 11: Seguridad y protección de datos del solicitante

**User Story:** Como usuario, quiero que mis datos personales estén protegidos durante todo el flujo de reserva, para cumplir con la normativa de protección de datos.

#### Criterios de Aceptación

1. THE Plataforma SHALL cifrar los datos del formulario del solicitante (`formData`) antes de almacenarlos en la base de datos.
2. THE Conector SHALL transmitir los datos del solicitante al Portal_Gubernamental exclusivamente mediante conexiones HTTPS.
3. WHEN una Reserva alcanza el estado `CONFIRMED` o `EXPIRED`, THE Plataforma SHALL eliminar los datos sensibles del formulario (`formData`) transcurridos 30 días desde la fecha de la cita.
4. THE Plataforma SHALL registrar en `AuditLog` cada acceso a datos personales del solicitante con la acción `READ`.
