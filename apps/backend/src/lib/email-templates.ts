/**
 * Email HTML templates — Gestor de Citas Oficiales
 * Issue #25 — branded dark theme (fuchsia #FF0A6C + dark #080810)
 */

const BASE_URL = process.env.FRONTEND_URL ?? 'https://citas-frontend-production-f2ef.up.railway.app';

const layout = (content: string) => `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080810;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#0d0d1a;border-radius:12px;overflow:hidden;border:1px solid #1f1f35">
        ${content}
        <tr>
          <td style="background:#080810;padding:24px 40px;border-top:1px solid #1f1f35;text-align:center">
            <p style="color:#6b6b8a;font-size:12px;margin:0;line-height:1.6">
              Gestor de Citas Oficiales · Servicio intermediario independiente<br>
              No afiliado ni autorizado por ningún organismo gubernamental
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ─── Template 1: Cita disponible — pagar para confirmar ──────────────────────

export function citaDisponibleHtml(params: {
  procedureName: string;
  paymentDeadline: string;
  bookingId: string;
}): string {
  const paymentUrl = `${BASE_URL}/bookings/${params.bookingId}`;

  return layout(`
    <tr>
      <td style="background:linear-gradient(135deg,#FF0A6C,#CC0055);padding:32px 40px;text-align:center">
        <div style="font-size:32px;margin-bottom:8px">📅</div>
        <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700">Gestor de Citas Oficiales</h1>
      </td>
    </tr>
    <tr>
      <td style="background:#1a1a2e;padding:16px 40px;border-bottom:1px solid #1f1f35">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="24" style="vertical-align:middle"><span style="font-size:20px">⏰</span></td>
          <td style="padding-left:12px;color:#FF3D8A;font-size:14px;font-weight:600">Tenés tiempo limitado para confirmar esta cita</td>
        </tr></table>
      </td>
    </tr>
    <tr>
      <td style="padding:40px">
        <h2 style="color:#ffffff;font-size:20px;margin:0 0 8px">¡Encontramos tu cita!</h2>
        <p style="color:#6b6b8a;font-size:15px;margin:0 0 32px">
          Hay un turno disponible para <strong style="color:#ffffff">${params.procedureName}</strong>.
          Completá el pago para reservarlo antes de que expire.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;border:1px solid #1f1f35;border-radius:8px;margin-bottom:32px">
          <tr><td style="padding:24px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:8px 0;border-bottom:1px solid #1f1f35">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="color:#6b6b8a;font-size:13px;width:40px">🗂️</td>
                  <td style="color:#6b6b8a;font-size:13px">Trámite</td>
                  <td align="right" style="color:#ffffff;font-size:14px;font-weight:600">${params.procedureName}</td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:8px 0">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="color:#6b6b8a;font-size:13px;width:40px">⏳</td>
                  <td style="color:#6b6b8a;font-size:13px">Pagar antes del</td>
                  <td align="right" style="color:#FF0A6C;font-size:14px;font-weight:700">${params.paymentDeadline}</td>
                </tr></table>
              </td></tr>
            </table>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center">
            <a href="${paymentUrl}" style="display:inline-block;background:#FF0A6C;color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.3px">
              💳 &nbsp; Confirmar y pagar
            </a>
          </td></tr>
        </table>
        <p style="color:#6b6b8a;font-size:12px;text-align:center;margin:24px 0 0">
          Si no pagás antes del plazo, la cita se libera automáticamente.
        </p>
      </td>
    </tr>
  `);
}

// ─── Template 2: Cita confirmada ─────────────────────────────────────────────

export function citaConfirmadaHtml(params: {
  procedureName: string;
  appointmentDate: string;
  appointmentTime: string;
  location: string;
  confirmationCode: string;
  instructions: string;
  bookingId: string;
}): string {
  const bookingUrl = `${BASE_URL}/bookings/${params.bookingId}`;

  return layout(`
    <tr>
      <td style="background:linear-gradient(135deg,#059669,#047857);padding:32px 40px;text-align:center">
        <div style="font-size:48px;margin-bottom:8px">✅</div>
        <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700">¡Cita confirmada!</h1>
        <p style="color:#a7f3d0;margin:8px 0 0;font-size:15px">${params.procedureName}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:40px">
        <p style="color:#6b6b8a;font-size:15px;margin:0 0 24px">
          Tu turno está reservado. Guardá los detalles y presentate con tu documentación.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #059669;border-radius:12px;overflow:hidden;margin-bottom:32px">
          <tr>
            <td style="background:#0d2818;padding:16px 24px;border-bottom:2px dashed #059669">
              <table width="100%" cellpadding="0" cellspacing="0"><tr>
                <td style="color:#a7f3d0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px">🎫 &nbsp; Comprobante de cita</td>
                <td align="right" style="color:#34d399;font-size:13px;font-weight:700"># ${params.confirmationCode}</td>
              </tr></table>
            </td>
          </tr>
          <tr><td style="padding:24px;background:#080810">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:10px 0;border-bottom:1px solid #1f1f35">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="font-size:22px;width:40px">📅</td>
                  <td>
                    <div style="color:#6b6b8a;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Fecha</div>
                    <div style="color:#ffffff;font-size:16px;font-weight:700;margin-top:2px">${params.appointmentDate}</div>
                  </td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #1f1f35">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="font-size:22px;width:40px">🕐</td>
                  <td>
                    <div style="color:#6b6b8a;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Hora</div>
                    <div style="color:#ffffff;font-size:16px;font-weight:700;margin-top:2px">${params.appointmentTime}</div>
                  </td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #1f1f35">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="font-size:22px;width:40px">📍</td>
                  <td>
                    <div style="color:#6b6b8a;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Lugar</div>
                    <div style="color:#ffffff;font-size:16px;font-weight:700;margin-top:2px">${params.location}</div>
                  </td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:10px 0">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="font-size:22px;width:40px">🔑</td>
                  <td>
                    <div style="color:#6b6b8a;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Código de confirmación</div>
                    <div style="color:#34d399;font-size:20px;font-weight:800;letter-spacing:2px;margin-top:2px">${params.confirmationCode}</div>
                  </td>
                </tr></table>
              </td></tr>
            </table>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border:1px solid #1f1f35;border-radius:8px;margin-bottom:32px">
          <tr><td style="padding:20px 24px">
            <div style="color:#FF3D8A;font-size:14px;font-weight:700;margin-bottom:8px">📋 &nbsp; Recordá llevar</div>
            <div style="color:#a3a3b8;font-size:14px">${params.instructions}</div>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center">
            <a href="${bookingUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:15px;font-weight:700">
              Ver detalles completos →
            </a>
          </td></tr>
        </table>
      </td>
    </tr>
  `);
}

// ─── Template 3: Verificación de email ───────────────────────────────────────

export function verificacionEmailHtml(params: {
  verificationUrl: string;
}): string {
  return layout(`
    <tr>
      <td style="background:linear-gradient(135deg,#FF0A6C,#CC0055);padding:32px 40px;text-align:center">
        <div style="font-size:48px;margin-bottom:8px">📬</div>
        <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700">Verificá tu email</h1>
        <p style="color:#ffb3d1;margin:8px 0 0;font-size:15px">Gestor de Citas Oficiales</p>
      </td>
    </tr>
    <tr>
      <td style="padding:40px">
        <p style="color:#ffffff;font-size:16px;margin:0 0 8px;font-weight:600">Hola 👋</p>
        <p style="color:#6b6b8a;font-size:15px;margin:0 0 32px;line-height:1.6">
          Gracias por registrarte. Para activar tu cuenta y empezar a gestionar tus citas,
          confirmá tu dirección de email haciendo click en el botón.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px">
          <tr><td align="center">
            <a href="${params.verificationUrl}" style="display:inline-block;background:#FF0A6C;color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:8px;font-size:16px;font-weight:700">
              ✉️ &nbsp; Verificar mi email
            </a>
          </td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border:1px solid #1f1f35;border-radius:8px;margin-bottom:24px">
          <tr><td style="padding:16px 20px;color:#FF3D8A;font-size:13px">
            ⏱️ &nbsp; Este enlace expira en <strong>24 horas</strong>.
          </td></tr>
        </table>
        <p style="color:#6b6b8a;font-size:13px;margin:0;line-height:1.6">
          Si no creaste una cuenta en Gestor de Citas Oficiales, podés ignorar este email.
        </p>
      </td>
    </tr>
  `);
}
