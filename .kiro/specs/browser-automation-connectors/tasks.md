# Plan de Implementación: Automatización de Navegador para Conectores de Portales Gubernamentales

## Visión General

Implementación incremental de la capa de automatización de navegador con Playwright, reemplazando la interacción HTTP (axios) de los conectores reales. Se comienza por la infraestructura base (pool, clase abstracta), luego el conector concreto de Extranjería, después los servicios auxiliares (CAPTCHA, screenshots, SMS), y finalmente la integración con el registro y el Dockerfile.

## Tareas

- [x] 1. Crear el BrowserPool — pool de instancias Chromium con contextos aislados
  - [x] 1.1 Crear `src/modules/connectors/browser/browser-pool.ts` con la clase `BrowserPool`
    - Definir interfaces `BrowserPoolConfig`, `BrowserPoolMetrics`, `AcquiredContext`
    - Implementar `acquireContext()` que crea un `BrowserContext` aislado con User-Agent realista, viewport 1280x720, locale `es-ES`
    - Implementar `releaseContext()` que cierra el contexto sin cerrar el proceso del navegador
    - Implementar cola de espera cuando todas las instancias están en uso (timeout 30s)
    - Implementar timer de cierre de instancias idle > 30 minutos
    - Implementar `getMetrics()` que expone instancias activas, en uso y solicitudes en cola
    - Implementar `shutdown()` para cierre ordenado en SIGTERM/SIGINT
    - Detectar crash de Chromium vía evento `disconnected` y eliminar instancia del pool
    - Leer configuración de variables de entorno: `BROWSER_POOL_MIN`, `BROWSER_POOL_MAX`, `BROWSER_POOL_IDLE_TIMEOUT_MS`
    - Lanzar Chromium con flags: `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 6.3, 6.4, 6.5_

  - [ ]* 1.2 Escribir tests unitarios para BrowserPool
    - Test de adquisición y liberación de contextos
    - Test de cola de espera cuando el pool está lleno
    - Test de cierre de instancias idle
    - Test de shutdown ordenado
    - Test de detección de crash de instancia
    - _Requisitos: 2.1, 2.2, 2.3, 2.5, 2.6_


- [ ] 2. Crear el BaseBrowserConnector — clase abstracta para conectores basados en navegador
  - [x] 2.1 Crear `src/modules/connectors/browser/portal-config.ts` con las interfaces de configuración
    - Definir `PortalConfig` con: URL base, timeout de navegación, selectores CSS, número máximo de pasos
    - Definir `BrowserConnectorConfig` extendiendo `PortalConfig` con connectorSlug y rateLimit
    - Definir `CaptchaDetection` con tipo de CAPTCHA, siteKey y pageUrl
    - _Requisitos: 9.1, 9.5_

  - [x] 2.2 Crear `src/modules/connectors/browser/base-browser.connector.ts` con la clase `BaseBrowserConnector`
    - Implementar `IConnector` con los métodos concretos: `healthCheck`, `getAvailability`, `book`, `cancel`
    - En `healthCheck`: navegar a la página principal del portal y verificar estructura esperada (no simple HTTP GET)
    - En cada método: adquirir token del RateLimiter → adquirir contexto del BrowserPool → ejecutar navegación → liberar contexto (siempre, incluso en error)
    - Configurar timeout de navegación (default 60s), abortar operación si se excede
    - Invocar `detectCaptcha()` y `validateStructure()` después de cada paso de navegación
    - Si CAPTCHA detectado: intentar resolver con CaptchaSolver → si falla, lanzar `CircuitBreakerError`
    - Definir métodos abstractos: `navigateAvailability`, `navigateBooking`, `navigateCancellation`, `detectCaptcha`, `validateStructure`
    - Implementar métodos utilitarios reutilizables: `waitForSelector`, `fillField`, `selectDropdown`, `clickButton`, `extractText`, `captureScreenshot`
    - Registrar en logs cada paso de navegación completado (nombre del paso, URL actual, tiempo transcurrido)
    - Registrar tiempo total de cada operación (getAvailability, book, cancel, healthCheck)
    - Registrar cada intento con datos compatibles con `BookingAttempt`: connectorId, attemptNumber, success, responseTimeMs
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.5, 8.6, 9.1, 9.2, 9.4, 9.5, 10.1, 10.2_

  - [ ]* 2.3 Escribir tests unitarios para BaseBrowserConnector
    - Test de flujo completo getAvailability (acquire → navigate → release)
    - Test de timeout de navegación (aborta y libera recursos)
    - Test de detección de anomalías (CAPTCHA, estructura cambiada)
    - Test de reintento en error de carga de página
    - Test de liberación de contexto en caso de error
    - _Requisitos: 1.1, 1.3, 1.4, 1.7, 8.1, 8.5_

- [ ] 3. Checkpoint — Verificar que la infraestructura base compila y los tests pasan
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [x] 4. Crear el servicio de resolución de CAPTCHA
  - [x] 4.1 Crear `src/modules/connectors/browser/captcha-solver.ts` con la clase `CaptchaSolver`
    - Implementar `isConfigured()` que verifica si `CAPTCHA_SOLVER_PROVIDER` y `CAPTCHA_SOLVER_API_KEY` están definidos
    - Implementar `solve()` que envía el CAPTCHA al servicio externo (2Captcha o Anti-Captcha) y espera la respuesta
    - Implementar `injectToken()` que inyecta el token resuelto en la página del portal
    - Soportar tipos: reCAPTCHA v3, reCAPTCHA v2, captcha de imagen
    - Detectar presencia de CAPTCHA buscando marcadores en el DOM: `g-recaptcha`, `recaptcha/api.js`, elementos con clase `captcha`, iframes de reCAPTCHA
    - Si el servicio no está configurado o falla, lanzar `CircuitBreakerError` con motivo `CAPTCHA_DETECTED`
    - Registrar cada detección de CAPTCHA en el log de auditoría (tipo, portal, resultado)
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 4.2 Escribir tests unitarios para CaptchaSolver
    - Test de detección de reCAPTCHA v3 en DOM
    - Test de comportamiento cuando el servicio no está configurado
    - Test de inyección de token en página
    - _Requisitos: 4.1, 4.3, 4.4_

- [x] 5. Crear el servicio de screenshots de diagnóstico
  - [x] 5.1 Crear `src/modules/connectors/browser/screenshot.service.ts`
    - Implementar captura de screenshot con nombre: `{connectorSlug}_{timestamp}_{errorType}.png`
    - Almacenar en directorio configurable (`SCREENSHOT_DIR`, default `/tmp/screenshots`)
    - Implementar limpieza automática de screenshots con más de 7 días (`SCREENSHOT_RETENTION_DAYS`)
    - _Requisitos: 8.4, 10.4_

  - [ ]* 5.2 Escribir tests unitarios para ScreenshotService
    - Test de generación de nombre de archivo correcto
    - Test de limpieza de screenshots expirados
    - _Requisitos: 8.4, 10.4_


- [x] 6. Refactorizar ExtranjeriaConnector para usar Playwright
  - [x] 6.1 Crear configuración específica de Extranjería
    - Definir constante `PROVINCE_URL_CATEGORY` con mapeo provincia → categoría URL (icpplus, icpplustieb, icpplustiem, icpco)
    - Definir constante `OPERATION_CODES` con códigos de operación: TOMA_HUELLAS (4010), RECOGIDA_TIE (4036), CERTIFICADOS_NIE (4096), SOLICITUD_ASILO (4078)
    - Definir constante `EXTRANJERIA_SELECTORS` con selectores CSS del portal: `#txtIdCitado`, `#txtPaisNac`, `#rdbTipoDocNie`, `#btnEntrar`, `#btnEnviar`, `#CitaMAP_HORAS`
    - _Requisitos: 3.4, 3.7, 3.8_

  - [x] 6.2 Refactorizar `src/modules/connectors/adapters/extranjeria.connector.ts` para extender `BaseBrowserConnector`
    - Cambiar herencia de `BaseRealConnector` a `BaseBrowserConnector`
    - Recibir `BrowserPool` en el constructor
    - Implementar `navigateAvailability()` con el flujo multi-paso JSF:
      - Construir URL con categoría de provincia y código de provincia
      - Navegar a la página inicial del portal
      - Seleccionar procedimiento (código de operación)
      - Rellenar datos personales mínimos
      - Seleccionar oficina
      - Extraer slots disponibles de `#CitaMAP_HORAS` o radio buttons
    - Gestionar ViewState JSF extrayendo el token de cada respuesta y reenviándolo en el siguiente paso
    - Devolver array de `TimeSlot` con fecha, hora e identificador de cada slot
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8_

  - [x] 6.3 Implementar `navigateBooking()` en ExtranjeriaConnector
    - Completar el flujo completo de reserva: provincia → procedimiento → datos personales → oficina → fecha → confirmación
    - Rellenar datos del solicitante: documento (`#txtIdCitado`), nacionalidad (`#txtPaisNac`), tipo documento (`#rdbTipoDocNie`)
    - Usar Email_Plataforma como dirección de contacto
    - Seleccionar el slot indicado en bookingData
    - Extraer código de confirmación, fecha, hora y ubicación de la página de confirmación
    - _Requisitos: 3.1, 3.4, 3.6_

  - [x] 6.4 Implementar `navigateCancellation()` en ExtranjeriaConnector
    - Navegar a la página de cancelación del portal
    - Introducir código de confirmación y documento
    - Confirmar cancelación y verificar resultado
    - _Requisitos: 1.1_

  - [x] 6.5 Implementar `detectCaptcha()` y `validateStructure()` en ExtranjeriaConnector
    - Detectar CAPTCHA buscando marcadores en el DOM: `g-recaptcha`, `recaptcha/api.js`, clase `captcha`, iframes reCAPTCHA
    - Validar estructura del portal verificando presencia de marcadores esperados (icpplus, citaprevia, sede.administracionespublicas)
    - _Requisitos: 1.4, 4.4_

  - [x] 6.6 Implementar detección de verificación SMS en ExtranjeriaConnector
    - Detectar formulario de verificación SMS en el paso de confirmación
    - Pausar navegación y lanzar error descriptivo indicando que se requiere verificación SMS manual
    - No activar Circuit_Breaker por verificación SMS
    - Registrar evento y marcar reserva con estado intermedio
    - Notificar al equipo de operaciones
    - _Requisitos: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 6.7 Escribir tests unitarios para ExtranjeriaConnector refactorizado
    - Test de construcción de URL con categoría de provincia correcta
    - Test de extracción de slots desde HTML del portal
    - Test de gestión de ViewState JSF
    - Test de detección de CAPTCHA en DOM
    - Test de detección de verificación SMS
    - _Requisitos: 3.1, 3.2, 3.3, 3.5, 4.4, 5.1_

- [ ] 7. Checkpoint — Verificar que el conector de Extranjería compila y los tests pasan
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

- [ ] 8. Integrar con ConnectorRegistry y resiliencia
  - [x] 8.1 Modificar `src/modules/connectors/connector.registry.ts` para usar el nuevo ExtranjeriaConnector
    - Instanciar `BrowserPool` compartido
    - Reemplazar `new ExtranjeriaConnector()` (HTTP) por `new ExtranjeriaConnector(browserPool)` (Playwright)
    - Mantener los demás conectores (DGT, AEAT, SEPE, RegistroCivil) con HTTP sin cambios
    - Registrar el conector con el mismo `organizationSlug` para reemplazo transparente
    - Llamar a `browserPool.shutdown()` en el cierre de la aplicación
    - _Requisitos: 7.1, 7.2, 9.3_

  - [ ] 8.2 Implementar resiliencia de navegación en BaseBrowserConnector
    - Reintentar carga de página una vez si no carga dentro del timeout
    - En error genérico del portal (HTTP 500, "servicio no disponible"): lanzar excepción que permita reintento sin activar Circuit_Breaker
    - Cerrar sesión completa cuando un paso del flujo falla (sin dejar sesiones huérfanas)
    - Abortar operación si el portal redirige a URL no esperada, registrando la URL para diagnóstico
    - _Requisitos: 8.1, 8.2, 8.5, 8.6_

  - [ ]* 8.3 Escribir tests unitarios para la integración con ConnectorRegistry
    - Test de que el SearchWorker funciona sin modificaciones con el nuevo conector
    - Test de que el Circuit_Breaker se activa correctamente con CircuitBreakerError
    - Test de reintento en error transitorio sin activar Circuit_Breaker
    - _Requisitos: 7.2, 7.4, 8.2_

- [x] 9. Actualizar Dockerfile para soportar Chromium headless
  - [x] 9.1 Modificar `Dockerfile` para entorno Playwright
    - Cambiar imagen base de `node:20-alpine` a `node:20-slim` (Debian)
    - Instalar dependencias de sistema para Chromium: libnss3, libatk-bridge2.0-0, libdrm2, libxkbcommon0, libgbm1, libpango-1.0-0, libcairo2, libasound2, libxshmfence1, libx11-xcb1, openssl
    - Configurar `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`
    - Ejecutar `npx playwright install chromium --with-deps` en build time
    - _Requisitos: 6.1, 6.2, 6.3, 6.6_

- [x] 10. Exponer métricas de observabilidad del pool de navegadores
  - [x] 10.1 Integrar métricas del BrowserPool en el endpoint de administración existente
    - Exponer `BrowserPoolMetrics` (instancias activas, en uso, en cola) junto con las métricas de salud de conectores
    - Registrar en logs eventos de ciclo de vida del pool: creación, reutilización, cierre por inactividad, cierre por shutdown
    - _Requisitos: 2.7, 10.3, 10.5_

  - [x] 10.2 Agregar variables de entorno nuevas al archivo `.env.example`
    - Añadir: `BROWSER_POOL_MIN`, `BROWSER_POOL_MAX`, `BROWSER_POOL_IDLE_TIMEOUT_MS`, `BROWSER_NAVIGATION_TIMEOUT_MS`, `CAPTCHA_SOLVER_PROVIDER`, `CAPTCHA_SOLVER_API_KEY`, `PLAYWRIGHT_BROWSERS_PATH`, `SCREENSHOT_DIR`, `SCREENSHOT_RETENTION_DAYS`
    - _Requisitos: 6.4, 6.5_

- [ ] 11. Checkpoint final — Verificar que todo compila, los tests pasan y la integración es correcta
  - Asegurar que todos los tests pasan, preguntar al usuario si surgen dudas.

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia los requisitos específicos para trazabilidad
- Los checkpoints aseguran validación incremental
- Los conectores HTTP existentes (DGT, AEAT, SEPE, Registro Civil) no se modifican en esta fase
- Solo el conector de Extranjería se implementa como Conector_Browser activo
