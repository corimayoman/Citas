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
| 🟡 Mock | Búsqueda de citas | El `MockConnector` genera un slot ficticio con código `DEMO-{timestamp}` y fecha aleatoria dentro del rango preferido. No llama a ningún sistema externo. | `CONNECTOR_TYPE=mock` (hardcodeado en registry) | Implementar conector real para cada organismo (ej: RENAPER, ANSES) | — |
| 🟡 Mock | Pagos (Stripe) | Con `STRIPE_DEMO_MODE=true`, el pago se marca como `PAID` directamente en la DB sin llamar a la API de Stripe. El booking pasa a `CONFIRMED` inmediatamente. | `STRIPE_DEMO_MODE=true` (backend) / `NEXT_PUBLIC_STRIPE_DEMO_MODE=true` (frontend) | Configurar cuenta Stripe real, setear `STRIPE_DEMO_MODE=false` y proveer `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` válidos | — |
| ✅ Real | Notificaciones (email/SMS) | Email via SendGrid HTTP API. SMS via Twilio. El usuario elige su canal preferido en el perfil. Demo mode activo solo si `NOTIFICATIONS_DEMO_MODE=true` o si no hay `SENDGRID_API_KEY` configurado. | `NOTIFICATIONS_DEMO_MODE` + `SENDGRID_API_KEY` para email, `TWILIO_*` para SMS | ✅ Implementado y verificado en QA. Pendiente: WhatsApp | — |
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

### Notificaciones
```env
# backend .env
STRIPE_DEMO_MODE=false
SENDGRID_API_KEY=SG....
MAIL_FROM=noreply@gestorcitas.app
```

### Conectores de organismos
Implementar la interfaz `IConnector` en `apps/backend/src/modules/connectors/adapters/` y registrar el conector en `connector.registry.ts`.
