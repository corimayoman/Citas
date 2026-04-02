# Documento de Requisitos — Automatización de Navegador para Conectores de Portales Gubernamentales

## Introducción

Este documento define los requisitos para reemplazar la capa de interacción HTTP (axios) de los conectores reales con automatización de navegador basada en Playwright. Los portales gubernamentales españoles (Extranjería, DGT, AEAT, SEPE, Registro Civil) utilizan aplicaciones JSF que requieren renderizado JavaScript, gestión de ViewState entre pasos de formulario, y en algunos casos resolución de CAPTCHA y verificación por SMS. La implementación actual con `BaseRealConnector` y axios no puede interactuar con estos portales. Se necesita una capa de automatización de navegador que mantenga la interfaz `IConnector` existente para que el `SearchWorker` no requiera cambios.

## Glosario

- **Plataforma**: El sistema Gestor de Citas Oficiales (backend + frontend).
- **Navegador_Automatizado**: Instancia de navegador Chromium controlada por Playwright en modo headless.
- **Pool_de_Navegadores**: Conjunto gestionado de instancias de Navegador_Automatizado que se reutilizan entre operaciones para optimizar recursos.
- **Sesión_de_Portal**: Contexto de navegador (cookies, ViewState JSF, estado de formulario) asociado a una interacción completa con un Portal_Gubernamental.
- **Portal_Gubernamental**: Sitio web oficial de un organismo español donde se gestionan citas (Extranjería, DGT, AEAT, SEPE, Registro Civil).
- **Conector_Browser**: Conector que extiende `BaseBrowserConnector` y usa Playwright para interactuar con un Portal_Gubernamental.
- **BaseBrowserConnector**: Clase abstracta que reemplaza a `BaseRealConnector`, encapsulando la lógica común de automatización de navegador (pool, sesiones, rate limiting, detección de anomalías).
- **Flujo_Multi_Paso**: Secuencia de navegación en un portal JSF que requiere completar múltiples formularios en orden (selección de provincia → procedimiento → datos personales → oficina → fecha → confirmación).
- **ViewState**: Token de sesión JSF que el portal genera en cada paso del formulario y que debe reenviarse en el siguiente paso.
- **CAPTCHA**: Desafío anti-bot (reCAPTCHA v3, captcha de imagen) que algunos portales presentan durante el flujo de reserva.
- **Servicio_Anti_CAPTCHA**: Servicio externo opcional (2Captcha, Anti-Captcha) que resuelve CAPTCHAs programáticamente.
- **Circuit_Breaker**: Mecanismo existente que desactiva automáticamente un conector cuando detecta anomalías.
- **Rate_Limiter**: Mecanismo existente de token bucket en Redis que controla la frecuencia de requests por conector.
- **SearchWorker**: Worker BullMQ existente que orquesta la búsqueda de disponibilidad y reserva de citas.
- **IConnector**: Interfaz existente con los métodos `healthCheck`, `getAvailability`, `book` y `cancel`.
- **Código_Operación**: Código numérico que identifica un trámite en el portal de Extranjería (TOMA_HUELLAS=4010, RECOGIDA_TIE=4036, CERTIFICADOS_NIE=4096, SOLICITUD_ASILO=4078).
- **Código_Provincia**: Código numérico que identifica una provincia en el portal (Barcelona=8, Madrid=28, etc.).
- **Categoría_URL**: Variante de URL del portal de Extranjería según la provincia (icpplus, icpplustieb, icpplustiem, icpco).

## Requisitos

### Requisito 1: Capa base de automatización de navegador

**User Story:** Como desarrollador, quiero una clase base que encapsule la lógica común de automatización con Playwright, para que cada conector solo implemente la navegación específica de su portal.

#### Criterios de Aceptación

1. THE BaseBrowserConnector SHALL implementar la interfaz IConnector con los métodos `healthCheck`, `getAvailability`, `book` y `cancel`, manteniendo compatibilidad total con el SearchWorker existente.
2. THE BaseBrowserConnector SHALL reemplazar el cliente HTTP axios de BaseRealConnector por una instancia de Playwright que controle un Navegador_Automatizado en modo headless.
3. THE BaseBrowserConnector SHALL adquirir un token del Rate_Limiter antes de cada interacción con un Portal_Gubernamental.
4. THE BaseBrowserConnector SHALL invocar la detección de anomalías (CAPTCHA, cambios de estructura) después de cada paso de navegación, lanzando un `CircuitBreakerError` cuando se detecte una anomalía.
5. THE BaseBrowserConnector SHALL definir métodos abstractos para la navegación específica de cada portal: `navigateAvailability`, `navigateBooking`, `navigateCancellation`, `detectCaptcha` y `validateStructure`.
6. THE BaseBrowserConnector SHALL configurar el Navegador_Automatizado con un User-Agent realista, viewport de 1280x720, y locale `es-ES` para evitar detección como bot.
7. WHEN una operación de navegación excede el timeout configurado (por defecto 60 segundos), THE BaseBrowserConnector SHALL abortar la operación, cerrar la Sesión_de_Portal y lanzar un error descriptivo.

### Requisito 2: Pool de navegadores

**User Story:** Como operador de la plataforma, quiero que las instancias de navegador se gestionen eficientemente en un pool, para optimizar el uso de memoria y CPU en el entorno Docker/Railway.

#### Criterios de Aceptación

1. THE Pool_de_Navegadores SHALL mantener un número configurable de instancias de Navegador_Automatizado (por defecto: mínimo 1, máximo 3).
2. WHEN un Conector_Browser solicita un navegador y todas las instancias están en uso, THE Pool_de_Navegadores SHALL encolar la solicitud y esperar hasta que una instancia esté disponible o se alcance un timeout de 30 segundos.
3. WHEN un Conector_Browser finaliza una operación, THE Pool_de_Navegadores SHALL devolver la instancia al pool limpiando cookies y estado de navegación, sin cerrar el proceso del navegador.
4. THE Pool_de_Navegadores SHALL crear contextos de navegador aislados (BrowserContext de Playwright) para cada operación, de modo que las sesiones de diferentes usuarios no compartan estado.
5. WHEN una instancia de Navegador_Automatizado lleva más de 30 minutos sin uso, THE Pool_de_Navegadores SHALL cerrar la instancia para liberar recursos.
6. WHEN el proceso de la aplicación se cierra (señal SIGTERM o SIGINT), THE Pool_de_Navegadores SHALL cerrar todas las instancias de navegador de forma ordenada.
7. THE Pool_de_Navegadores SHALL exponer métricas del estado del pool: instancias activas, instancias en uso, solicitudes en cola.

### Requisito 3: Conector de Extranjería con Playwright

**User Story:** Como operador de la plataforma, quiero que el conector de Extranjería navegue el portal JSF real paso a paso usando Playwright, para consultar disponibilidad y reservar citas de forma automatizada.

#### Criterios de Aceptación

1. THE Conector_Browser de Extranjería SHALL navegar el Flujo_Multi_Paso del portal: selección de provincia → selección de procedimiento → datos personales del solicitante → selección de oficina → selección de fecha y hora → confirmación.
2. WHEN el Conector_Browser de Extranjería inicia una consulta de disponibilidad, THE Conector_Browser SHALL construir la URL del portal usando la Categoría_URL correspondiente a la provincia y el Código_Provincia: `https://icp.administracionelectronica.gob.es/{categoria}/citar?p={codigo_provincia}`.
3. THE Conector_Browser de Extranjería SHALL gestionar el ViewState JSF extrayendo el token de cada respuesta del portal y reenviándolo en el siguiente paso del formulario.
4. THE Conector_Browser de Extranjería SHALL interactuar con los elementos del formulario JSF usando los selectores conocidos: `#txtIdCitado` para documento, `#txtPaisNac` para nacionalidad, `#rdbTipoDocNie` para tipo de documento, `#btnEntrar` y `#btnEnviar` para botones de avance.
5. WHEN el portal muestra slots disponibles en el elemento `#CitaMAP_HORAS` o como radio buttons, THE Conector_Browser de Extranjería SHALL extraer fecha, hora e identificador de cada slot y devolverlos como array de `TimeSlot`.
6. WHEN el Conector_Browser de Extranjería ejecuta una reserva, THE Conector_Browser SHALL completar los datos del solicitante en el formulario, seleccionar el slot indicado, y usar el Email_Plataforma como dirección de contacto.
7. THE Conector_Browser de Extranjería SHALL soportar los Códigos_Operación principales: TOMA_HUELLAS (4010), RECOGIDA_TIE (4036), CERTIFICADOS_NIE (4096) y SOLICITUD_ASILO (4078).
8. THE Conector_Browser de Extranjería SHALL mapear cada provincia a su Categoría_URL correcta (icpplus, icpplustieb, icpplustiem, icpco) usando una tabla de configuración.

### Requisito 4: Gestión de CAPTCHA

**User Story:** Como operador de la plataforma, quiero que el sistema detecte CAPTCHAs en los portales y reaccione adecuadamente, para mantener la fiabilidad del servicio sin violar las políticas anti-bot.

#### Criterios de Aceptación

1. WHEN el Conector_Browser detecta un reCAPTCHA v3 en la página del portal, THE Conector_Browser SHALL intentar resolver el CAPTCHA usando el Servicio_Anti_CAPTCHA si está configurado.
2. WHEN el Conector_Browser detecta un captcha de imagen en la página del portal, THE Conector_Browser SHALL intentar resolver el captcha usando el Servicio_Anti_CAPTCHA si está configurado.
3. IF el Servicio_Anti_CAPTCHA no está configurado o falla en resolver el CAPTCHA, THEN THE Conector_Browser SHALL lanzar un `CircuitBreakerError` con motivo `CAPTCHA_DETECTED` para suspender el conector.
4. THE Conector_Browser SHALL detectar la presencia de CAPTCHA buscando los marcadores conocidos en el DOM: `g-recaptcha`, `recaptcha/api.js`, elementos con clase `captcha`, e iframes de reCAPTCHA.
5. WHEN el Servicio_Anti_CAPTCHA resuelve un CAPTCHA exitosamente, THE Conector_Browser SHALL inyectar el token de respuesta en el formulario del portal y continuar la navegación.
6. THE Plataforma SHALL registrar cada detección de CAPTCHA en el log de auditoría con el tipo de CAPTCHA, el portal de origen y si se resolvió exitosamente.

### Requisito 5: Gestión de verificación SMS

**User Story:** Como operador de la plataforma, quiero que el sistema maneje la verificación por SMS que algunos portales requieren en el paso final de confirmación, para completar el flujo de reserva.

#### Criterios de Aceptación

1. WHEN el portal de Extranjería solicita verificación por SMS en el paso de confirmación, THE Conector_Browser SHALL detectar el formulario de verificación SMS y pausar la navegación.
2. WHEN el Conector_Browser detecta una solicitud de verificación SMS, THE Plataforma SHALL registrar el evento y marcar la Reserva con un estado intermedio que indique que se requiere intervención.
3. IF el portal requiere verificación SMS y el sistema no puede completarla automáticamente, THEN THE Conector_Browser SHALL lanzar un error descriptivo indicando que se requiere verificación SMS manual, sin suspender el conector vía Circuit_Breaker.
4. THE Plataforma SHALL notificar al equipo de operaciones cuando se detecte una solicitud de verificación SMS para que puedan intervenir manualmente si es necesario.

### Requisito 6: Despliegue en Docker/Railway

**User Story:** Como desarrollador, quiero que la automatización de navegador funcione en el entorno Docker de Railway, para que el sistema pueda desplegarse en producción.

#### Criterios de Aceptación

1. THE Plataforma SHALL incluir en el Dockerfile las dependencias del sistema necesarias para ejecutar Chromium headless (librerías de sistema: libnss3, libatk-bridge2.0, libdrm2, libxkbcommon0, libgbm1, entre otras).
2. THE Plataforma SHALL configurar Playwright para usar el navegador Chromium bundled, sin requerir descarga de navegadores en tiempo de ejecución.
3. THE Plataforma SHALL configurar el Navegador_Automatizado con los flags de Chromium necesarios para entornos containerizados: `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`.
4. THE Plataforma SHALL limitar el consumo de memoria del Pool_de_Navegadores a un máximo configurable (por defecto 512MB por instancia) para respetar los límites de Railway.
5. WHEN la variable de entorno `BROWSER_POOL_MAX` está definida, THE Pool_de_Navegadores SHALL usar ese valor como número máximo de instancias en lugar del valor por defecto.
6. THE Dockerfile SHALL cambiar la imagen base de `node:20-alpine` a `node:20-slim` (Debian) para soportar las dependencias de Chromium que no están disponibles en Alpine.

### Requisito 7: Integración con infraestructura existente

**User Story:** Como desarrollador, quiero que los nuevos conectores basados en navegador se integren con la infraestructura existente (CircuitBreaker, RateLimiter, ConnectorRegistry, SearchWorker), para no duplicar lógica ni romper el flujo actual.

#### Criterios de Aceptación

1. THE Conector_Browser SHALL registrarse en el Registro_de_Conectores con el mismo `organizationSlug` que el conector HTTP actual, reemplazándolo de forma transparente.
2. THE SearchWorker SHALL funcionar sin modificaciones al usar los nuevos Conector_Browser, ya que la interfaz IConnector se mantiene idéntica.
3. THE Conector_Browser SHALL usar el Rate_Limiter existente (token bucket en Redis) adquiriendo un token antes de cada navegación al portal.
4. WHEN el Conector_Browser detecta una anomalía (CAPTCHA no resuelto, estructura cambiada), THE Conector_Browser SHALL lanzar un `CircuitBreakerError` que el SearchWorker ya maneja para suspender el conector vía Circuit_Breaker.
5. THE Conector_Browser SHALL registrar cada intento de interacción con datos compatibles con la tabla `BookingAttempt` existente: `connectorId`, `attemptNumber`, `success`, `responseTimeMs`.
6. WHEN el Conector_Browser completa un healthCheck, THE Conector_Browser SHALL navegar a la página principal del portal y verificar que la estructura esperada está presente, en lugar de hacer un simple HTTP GET.

### Requisito 8: Resiliencia y manejo de errores de navegación

**User Story:** Como operador de la plataforma, quiero que la automatización de navegador maneje errores de navegación de forma robusta, para que fallos transitorios no suspendan innecesariamente los conectores.

#### Criterios de Aceptación

1. WHEN una página del portal no carga dentro del timeout configurado, THE Conector_Browser SHALL reintentar la carga una vez antes de reportar el error.
2. WHEN el portal devuelve una página de error genérica (HTTP 500, "servicio no disponible"), THE Conector_Browser SHALL registrar el error y lanzar una excepción que permita al SearchWorker reintentar, sin activar el Circuit_Breaker.
3. WHEN el Navegador_Automatizado se cierra inesperadamente (crash del proceso Chromium), THE Pool_de_Navegadores SHALL detectar la instancia muerta, eliminarla del pool y crear una nueva instancia.
4. THE Conector_Browser SHALL capturar un screenshot de la página cuando ocurre un error inesperado y almacenarlo temporalmente para diagnóstico.
5. WHEN un paso del Flujo_Multi_Paso falla, THE Conector_Browser SHALL cerrar la Sesión_de_Portal completa y liberar los recursos del navegador, sin dejar sesiones huérfanas.
6. IF el portal redirige a una URL no esperada durante la navegación, THEN THE Conector_Browser SHALL abortar la operación y registrar la URL de redirección para diagnóstico.

### Requisito 9: Configuración y extensibilidad para otros portales

**User Story:** Como desarrollador, quiero que la arquitectura de automatización de navegador sea extensible, para poder implementar conectores para DGT, AEAT, SEPE y Registro Civil siguiendo el mismo patrón.

#### Criterios de Aceptación

1. THE BaseBrowserConnector SHALL definir una interfaz de configuración que incluya: URL base del portal, timeout de navegación, selectores CSS esperados, y número máximo de pasos del flujo.
2. THE BaseBrowserConnector SHALL proporcionar métodos utilitarios reutilizables para operaciones comunes: esperar un selector, rellenar un campo de texto, seleccionar una opción de dropdown, hacer click en un botón, extraer texto de un elemento.
3. THE Plataforma SHALL mantener los conectores HTTP actuales (DGT, AEAT, SEPE, Registro Civil) como fallback con sus TODOs, registrando solo el Conector_Browser de Extranjería como implementación activa en esta fase.
4. WHEN se implemente un nuevo Conector_Browser para otro portal, THE Conector_Browser SHALL extender BaseBrowserConnector e implementar únicamente los métodos abstractos de navegación específica del portal.
5. THE BaseBrowserConnector SHALL soportar configuración de selectores CSS por portal mediante un objeto de configuración, para facilitar la actualización cuando un portal cambie su estructura HTML.

### Requisito 10: Observabilidad de la automatización de navegador

**User Story:** Como operador de la plataforma, quiero tener visibilidad sobre el estado y rendimiento de la automatización de navegador, para diagnosticar problemas y optimizar el uso de recursos.

#### Criterios de Aceptación

1. THE Plataforma SHALL registrar en logs cada paso de navegación completado en un Flujo_Multi_Paso, incluyendo el nombre del paso, la URL actual y el tiempo transcurrido.
2. THE Plataforma SHALL registrar en logs el tiempo total de cada operación de navegación (getAvailability, book, cancel, healthCheck).
3. THE Pool_de_Navegadores SHALL registrar en logs eventos de ciclo de vida: creación de instancia, reutilización, cierre por inactividad, cierre por shutdown.
4. WHEN un Conector_Browser captura un screenshot por error, THE Plataforma SHALL almacenar el screenshot con un nombre que incluya el connectorSlug, timestamp y tipo de error, y eliminarlo automáticamente después de 7 días.
5. THE Plataforma SHALL exponer las métricas del Pool_de_Navegadores (instancias activas, en uso, en cola) junto con las métricas existentes de salud de conectores en el endpoint de administración.
