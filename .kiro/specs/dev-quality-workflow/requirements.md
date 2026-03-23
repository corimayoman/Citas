# Requirements Document

## Introduction

Este documento define los requisitos para el workflow de calidad de desarrollo de la app **Citas** (gestor de citas para trámites). El objetivo es establecer un proceso sistemático que garantice que cada cambio esté documentado como issue en GitHub, tenga casos de prueba definidos antes de implementarse, sea validado antes de pasar a producción, y que el sistema completo sea verificado diariamente mediante tests de regresión.

El proyecto es un monorepo con backend (Node/Express/TypeScript/Prisma/PostgreSQL) y frontend (Next.js 14/TypeScript), desplegado en Railway, con GitHub Actions y hooks de git ya configurados.

---

## Glossary

- **Issue_Tracker**: El sistema de issues de GitHub del repositorio Citas.
- **Feature_Branch**: Rama de git con prefijo `feature/`, `fix/`, `hotfix/` o `chore/` donde se desarrolla un cambio.
- **Test_Suite**: Conjunto de tests automatizados (unitarios e integración) del backend y frontend.
- **Regression_Suite**: Subconjunto de la Test_Suite que cubre el funcionamiento completo del sistema y se ejecuta diariamente.
- **CI_Pipeline**: El pipeline de GitHub Actions definido en `.github/workflows/ci.yml`.
- **QA_Gate**: Validación obligatoria que debe pasar antes de promover código a la rama `qa`.
- **Bug_Issue**: Issue de GitHub con label `bug` creado cuando un test falla durante el QA_Gate.
- **Test_Report**: Artefacto generado por el CI_Pipeline con el resultado de la ejecución de la Test_Suite.
- **Regression_Report**: Artefacto generado por el CI_Pipeline con el resultado diario de la Regression_Suite.
- **Workflow_Script**: Scripts de shell ubicados en `.workflow/` que automatizan operaciones de git y validación.
- **Developer**: Persona que trabaja en el código de la app Citas.
- **Validator**: Componente del CI_Pipeline que ejecuta typechecking, lint y tests.

---

## Requirements

### Requirement 1: Documentación de cambios como issues

**User Story:** Como Developer, quiero que cada cambio que trabajo esté documentado como un issue en GitHub, para tener trazabilidad completa de qué se hizo, por qué y cuándo.

#### Acceptance Criteria

1. THE Issue_Tracker SHALL requerir que toda Feature_Branch esté asociada a un issue de GitHub antes de poder abrir un Pull Request.
2. WHEN un Developer crea una Feature_Branch, THE Workflow_Script SHALL aceptar un identificador de issue como parte del nombre de la rama (ej: `feature/GCO-42-descripcion`).
3. THE CI_Pipeline SHALL verificar que el título del Pull Request referencie un issue de GitHub mediante el formato `Closes #N` o `Refs #N` en la descripción.
4. WHEN un Pull Request es abierto sin referencia a un issue, THE CI_Pipeline SHALL marcar el check como fallido con un mensaje descriptivo.
5. THE Issue_Tracker SHALL usar templates de issue diferenciados para `feature`, `bug` y `chore`, de modo que cada tipo capture la información relevante.

---

### Requirement 2: Definición de casos de prueba junto con cada feature

**User Story:** Como Developer, quiero definir los casos de prueba al mismo tiempo que trabajo cada feature, para garantizar que el comportamiento esperado esté verificado antes de considerar el trabajo terminado.

#### Acceptance Criteria

1. THE CI_Pipeline SHALL ejecutar la Test_Suite completa en cada push a una Feature_Branch.
2. WHEN la Test_Suite falla en una Feature_Branch, THE CI_Pipeline SHALL bloquear el merge del Pull Request.
3. THE pull_request_template SHALL incluir una sección de checklist que requiera que el Developer confirme que agregó o actualizó tests para el cambio.
4. WHEN un Pull Request modifica archivos en `src/modules/<modulo>/` sin modificar archivos en `src/modules/<modulo>/__tests__/`, THE CI_Pipeline SHALL emitir una advertencia en el Pull Request.
5. THE Test_Suite SHALL incluir tests unitarios para cada service del backend y tests de integración para cada endpoint de la API.
6. WHERE el frontend incluye lógica de negocio en componentes o hooks, THE Test_Suite SHALL incluir tests para esa lógica.

---

### Requirement 3: QA Gate antes de pasar a producción

**User Story:** Como Developer, quiero que haya una validación obligatoria antes de promover código a producción, para asegurarme de que nada roto llegue a los usuarios.

#### Acceptance Criteria

1. WHEN el Developer ejecuta `gw promote prod`, THE Workflow_Script SHALL ejecutar la Test_Suite completa antes de proceder con la promoción.
2. IF la Test_Suite falla durante `gw promote prod`, THEN THE Workflow_Script SHALL abortar la promoción y mostrar un reporte de los tests fallidos.
3. THE CI_Pipeline SHALL generar un Test_Report como artefacto descargable en cada ejecución de la Test_Suite.
4. WHEN un test falla durante el QA_Gate, THE Developer SHALL crear un Bug_Issue en el Issue_Tracker antes de reintentar la promoción.
5. THE CI_Pipeline SHALL requerir aprobación manual en el environment de producción de GitHub antes de ejecutar el deploy.
6. WHILE un Bug_Issue está abierto y referenciado en una Feature_Branch, THE CI_Pipeline SHALL bloquear el merge de esa Feature_Branch a `main`.

---

### Requirement 4: Tests de regresión diarios

**User Story:** Como Developer, quiero que todos los días se ejecute automáticamente un test de regresión completo, para detectar regressions lo antes posible y mantener la confianza en el sistema.

#### Acceptance Criteria

1. THE CI_Pipeline SHALL ejecutar la Regression_Suite todos los días a las 06:00 UTC mediante un schedule de GitHub Actions.
2. WHEN la Regression_Suite falla, THE CI_Pipeline SHALL crear automáticamente un Bug_Issue en el Issue_Tracker con el Test_Report adjunto y label `regression`.
3. THE CI_Pipeline SHALL generar un Regression_Report como artefacto descargable con el detalle de cada test ejecutado y su resultado.
4. WHEN la Regression_Suite pasa completamente, THE CI_Pipeline SHALL actualizar el estado del último Regression_Report como exitoso sin crear issues.
5. THE Regression_Suite SHALL ejecutarse contra la rama `main` (producción) para reflejar el estado real del sistema desplegado.
6. IF la Regression_Suite falla tres días consecutivos en el mismo test, THEN THE CI_Pipeline SHALL escalar la notificación marcando el Bug_Issue con label `critical`.

---

### Requirement 5: Base inicial de tests de regresión

**User Story:** Como Developer, quiero hacer una primera pasada por el código existente creando la base de tests de regresión, para tener cobertura del comportamiento actual del sistema antes de agregar nuevas features.

#### Acceptance Criteria

1. THE Test_Suite SHALL incluir tests para todos los módulos del backend existentes: `auth`, `bookings`, `compliance`, `connectors`, `notifications`, `organizations`, `payments`, `procedures`, `users` y `audit`.
2. THE Test_Suite SHALL incluir al menos un test de integración por cada endpoint de la API documentado en Swagger.
3. WHEN se agrega un nuevo módulo al backend, THE Test_Suite SHALL incluir tests para ese módulo antes de que el Pull Request pueda ser mergeado.
4. THE Test_Suite SHALL incluir tests de round-trip para toda serialización y deserialización de datos entre el frontend y el backend.
5. THE Test_Suite SHALL verificar los invariantes de negocio críticos: una cita no puede tener fecha de inicio posterior a su fecha de fin, un usuario no puede tener dos citas activas para el mismo trámite en el mismo horario, y el estado de una cita sigue la máquina de estados definida.
6. THE Test_Suite SHALL incluir tests de condiciones de error para inputs inválidos en todos los endpoints de la API, verificando que retornan códigos HTTP y mensajes de error apropiados.
7. FOR ALL módulos del backend, ejecutar los tests de la Test_Suite y luego volver a ejecutarlos SHALL producir el mismo resultado (propiedad de idempotencia de la suite).

---

### Requirement 6: Trazabilidad entre issues, branches y tests

**User Story:** Como Developer, quiero poder rastrear fácilmente qué issue originó qué cambio y qué tests lo validan, para entender el historial del sistema y facilitar el debugging.

#### Acceptance Criteria

1. THE Workflow_Script SHALL incluir un comando `gw status` que muestre el issue asociado a la Feature_Branch actual junto con el estado de los últimos tests.
2. WHEN un Pull Request es mergeado, THE Issue_Tracker SHALL cerrar automáticamente el issue referenciado mediante la keyword `Closes #N` en el PR.
3. THE pull_request_template SHALL incluir una sección "Tests agregados" donde el Developer liste los casos de prueba nuevos o modificados.
4. THE CI_Pipeline SHALL publicar un resumen del Test_Report como comentario en el Pull Request, mostrando cuántos tests pasaron, fallaron y fueron omitidos.
5. WHEN se crea un Bug_Issue automáticamente por falla en el QA_Gate o la Regression_Suite, THE Issue_Tracker SHALL incluir en el cuerpo del issue el nombre del test fallido, el mensaje de error y el link al Test_Report.

---

### Requirement 7: Ambiente de QA separado en Railway

**User Story:** Como Developer, quiero tener un ambiente de QA completamente separado en Railway (con su propia base de datos, Redis y URLs), para poder validar los cambios en un entorno idéntico a producción antes de promoverlos.

#### Acceptance Criteria

1. THE QA_Environment SHALL ser un proyecto Railway independiente con sus propios servicios: backend, frontend, PostgreSQL y Redis.
2. THE QA_Environment SHALL tener variables de entorno propias, completamente separadas de las de producción (distintas `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, etc.).
3. WHEN un Developer hace merge de una Feature_Branch a la rama `qa`, THE CI_Pipeline SHALL disparar automáticamente el deploy al QA_Environment via Railway deploy hook.
4. THE CI_Pipeline SHALL ejecutar `prisma db push` y `prisma db seed` en el QA_Environment después de cada deploy exitoso, para mantener el esquema y datos de prueba actualizados.
5. THE QA_Environment SHALL tener `STRIPE_DEMO_MODE=true` y `NEXT_PUBLIC_STRIPE_DEMO_MODE=true` para evitar transacciones reales.
6. WHEN el deploy al QA_Environment falla, THE CI_Pipeline SHALL notificar el fallo sin bloquear la rama `qa`.
7. THE QA_Environment URLs SHALL estar documentadas en el README del proyecto y ser accesibles para el Developer para validación manual antes de `gw promote prod`.
8. THE Regression_Suite SHALL poder ejecutarse opcionalmente contra el QA_Environment además de contra `main`, para detectar problemas antes de que lleguen a producción.

---

### Requirement 8: Tests de frontend con foco en coherencia de UX

**User Story:** Como Developer, quiero que el frontend tenga tests que verifiquen la coherencia entre el estado del sistema y lo que ve el usuario, para evitar situaciones donde la UI muestra información incorrecta o desactualizada respecto al estado real del backend.

#### Acceptance Criteria

1. THE Test_Suite SHALL incluir tests de renderizado para cada estado posible del booking: `SEARCHING`, `PRE_CONFIRMED`, `CONFIRMED`, `COMPLETED`, `ERROR`, `REQUIRES_USER_ACTION` y `CANCELLED`.
2. WHEN el estado de un booking cambia en el backend, THE Test_Suite SHALL verificar que la UI refleja el nuevo estado sin requerir recarga manual de la página.
3. THE Test_Suite SHALL verificar que el botón de pago solo aparece cuando el booking está en estado `PRE_CONFIRMED` y desaparece una vez completado el pago.
4. THE Test_Suite SHALL verificar que los detalles de la cita (fecha, hora, lugar, código) solo son visibles cuando el booking está en estado `CONFIRMED` o `COMPLETED`.
5. THE Test_Suite SHALL verificar que el BookingWizard completa los 4 pasos en orden, que las validaciones de cada paso bloquean el avance si los datos son inválidos, y que el submit final llama al endpoint correcto con los datos correctos.
6. THE Test_Suite SHALL verificar que los mensajes de error del backend se muestran correctamente en la UI y no quedan estados de carga infinitos ante fallos de red.
7. THE Test_Suite SHALL incluir tests para los flujos de autenticación: login exitoso redirige al dashboard, login fallido muestra error, sesión expirada redirige al login.
8. THE Test_Suite SHALL verificar que la página de perfil permite crear, editar y eliminar perfiles de solicitante, y que los cambios se reflejan inmediatamente en el wizard de booking.
9. FOR ALL páginas del dashboard, THE Test_Suite SHALL verificar que un usuario no autenticado es redirigido al login en lugar de ver un error o pantalla en blanco.

---

### Requirement 9: Registro y documentación de mocks y funcionalidades pendientes

**User Story:** Como Developer, quiero tener un registro centralizado de qué funcionalidades están simuladas (mock) y cuáles llaman a APIs reales, para saber exactamente qué falta implementar antes de un lanzamiento real y evitar que funcionalidades mock lleguen a producción sin ser detectadas.

#### Acceptance Criteria

1. THE proyecto SHALL mantener un archivo `MOCKS.md` en la raíz que liste todas las funcionalidades en modo mock con: nombre, descripción, módulo afectado, y criterio de "listo para producción real".
2. THE Test_Suite SHALL incluir tests que verifiquen que las funcionalidades mock se comportan de forma consistente con el contrato esperado de la API real (misma estructura de respuesta, mismos códigos HTTP).
3. WHEN `STRIPE_DEMO_MODE=true`, THE Test_Suite SHALL verificar que el flujo de pago completo funciona end-to-end sin llamar a la API de Stripe real.
4. WHEN `STRIPE_DEMO_MODE=false`, THE Test_Suite SHALL verificar que el flujo de pago redirige correctamente a Stripe Checkout y maneja el webhook de confirmación.
5. THE `MOCKS.md` SHALL documentar el estado actual de cada integración externa: búsqueda de citas (conector mock vs conector real), pagos (Stripe demo vs Stripe real), notificaciones (DB-only vs email/SMS real), y SSO (no implementado).
6. WHEN se implementa una funcionalidad que reemplaza un mock, THE Developer SHALL actualizar `MOCKS.md` y agregar un test que verifique la integración real antes de que el Pull Request pueda ser mergeado.
7. THE CI_Pipeline SHALL verificar en cada PR que si se modifica código en un módulo marcado como mock en `MOCKS.md`, el PR incluya una actualización de ese archivo o una justificación explícita en la descripción.
