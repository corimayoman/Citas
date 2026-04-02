# Estado de integraciones mock

Este documento registra qué integraciones están en modo mock y cuáles llaman a APIs reales.
Debe actualizarse en el mismo PR que modifique cualquiera de los módulos listados.

> **Regla:** Todo PR que modifique `connectors/`, `payments/` o `notifications/` debe incluir en su cuerpo una de estas líneas:
> - `Updates MOCKS.md` — si este documento fue actualizado
> - `Mock unchanged` — si el comportamiento mock no cambió
> - `Implements real: <descripción>` — si se implementó la integración real

---

## Integraciones

| Estado | Módulo | Descripción | Variable de control | Criterio para producción | Issue de seguimiento |
|--------|--------|-------------|---------------------|--------------------------|----------------------|
| 🟡 Mock | Búsqueda de citas (mock) | El `MockConnector` genera un slot ficticio con código `DEMO-{timestamp}` y fecha aleatoria dentro del rango preferido. No llama a ningún sistema externo. | `CONNECTOR_TYPE=mock` (hardcodeado en registry) | Implementar conector real para cada organismo (ej: RENAPER, ANSES) | — |
| 🟢 Browser | Extranjería (Playwright) | `ExtranjeriaBrowserConnector` usa Playwright para navegar el portal JSF de Extranjería. Requiere Chromium instalado; si no está disponible, cae automáticamente al conector HTTP. | Detección automática de Playwright/Chromium en `connector.registry.ts` | Instalar Chromium en Docker (ver comentarios en Dockerfile) y configurar `BROWSER_POOL_*`, `CAPTCHA_SOLVER_*` | — |
| 🟡 Mock | Pagos (Stripe) | Con `STRIPE_DEMO_MODE=true`, el pago se marca como `PAID` directamente en la DB sin llamar a la API de Stripe. El booking pasa a `CONFIRMED` inmediatamente. | `STRIPE_DEMO_MODE=true` (backend) / `NEXT_PUBLIC_STRIPE_DEMO_MODE=true` (frontend) | Configurar cuenta Stripe real, setear `STRIPE_DEMO_MODE=false` y proveer `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` válidos | — |
| ✅ Real | Notificaciones (email/SMS) | Email via SendGrid HTTP API. SMS via Twilio. El usuario elige su canal preferido en el perfil. Demo mode activo solo si `NOTIFICATIONS_DEMO_MODE=true` o si no hay `SENDGRID_API_KEY` configurado. | `NOTIFICATIONS_DEMO_MODE` + `SENDGRID_API_KEY` para email, `TWILIO_*` para SMS | ✅ Email implementado y verificado en QA. SMS deshabilitado en UI (cuenta Twilio trial — solo permite números verificados). Pendiente: habilitar SMS con cuenta Twilio de producción y WhatsApp | #23 |
| 🔴 No implementado | SSO / OAuth | No existe integración con proveedores de identidad externos (Google, SAML, etc.). Solo autenticación local con email/password. | N/A | Implementar OAuth2/OIDC con el proveedor requerido | — |
| 🟡 Mock | Validación de elegibilidad | El mock connector siempre retorna `eligible: true` sin validar requisitos reales del trámite. | Hardcodeado en `mock.connector.ts` | Implementar validación real contra el sistema del organismo | — |

---

## Leyenda

| Ícono | Significado |
|-------|-------------|
| ✅ Real | Integración real activa en producción |
| 🟡 Mock | Integración simulada, no llama a sistemas externos |
| 🔴 No implementado | Funcionalidad no desarrollada aún |

---

## Cómo activar integraciones reales

### Pagos (Stripe)
```env
# backend .env
STRIPE_DEMO_MODE=false
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# frontend .env
NEXT_PUBLIC_STRIPE_DEMO_MODE=false
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Notificaciones (Email)
```env
# backend .env
NOTIFICATIONS_DEMO_MODE=false
SENDGRID_API_KEY=SG....
MAIL_FROM=noreply@gestorcitas.app
```

### Notificaciones (SMS) — pendiente cuenta Twilio de producción
SMS está deshabilitado en la UI (la cuenta Twilio trial solo permite enviar a números verificados). Para habilitarlo:
1. Actualizar a una cuenta Twilio de producción
2. Configurar las variables:
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890
```
3. Re-habilitar el selector de canal SMS en `apps/frontend/src/app/(dashboard)/profile/page.tsx`

Ver issue #23.

### Conectores de organismos
Implementar la interfaz `IConnector` en `apps/backend/src/modules/connectors/adapters/` y registrar el conector en `connector.registry.ts`.

### Extranjería (Browser Automation)
El conector de Extranjería usa Playwright con Chromium headless. Para activarlo:
1. Instalar Chromium: `npx playwright install chromium --with-deps`
2. Configurar variables de entorno:
```env
BROWSER_POOL_MIN=1
BROWSER_POOL_MAX=3
BROWSER_POOL_IDLE_TIMEOUT_MS=1800000
BROWSER_NAVIGATION_TIMEOUT_MS=60000
CAPTCHA_SOLVER_PROVIDER=2captcha
CAPTCHA_SOLVER_API_KEY=your-api-key
SCREENSHOT_DIR=/tmp/screenshots
SCREENSHOT_RETENTION_DAYS=7
```
Si Playwright/Chromium no está disponible, el registry cae automáticamente al conector HTTP.
