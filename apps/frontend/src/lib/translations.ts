export const roleLabels: Record<string, string> = {
  ADMIN: 'Administrador',
  USER: 'Usuario',
  OPERATOR: 'Operador',
  COMPLIANCE_OFFICER: 'Oficial de cumplimiento',
};

export const connectorStatusLabels: Record<string, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  SUSPENDED: 'Suspendido',
  PENDING_REVIEW: 'Pendiente de revisión',
};

export const complianceLevelLabels: Record<string, string> = {
  LOW: 'Bajo',
  MEDIUM: 'Medio',
  HIGH: 'Alto',
  CRITICAL: 'Crítico',
};

export const channelLabels: Record<string, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
};

export const integrationTypeLabels: Record<string, string> = {
  OFFICIAL_API: 'API Oficial',
  AUTHORIZED_INTEGRATION: 'Integración autorizada',
  MANUAL_ASSISTED: 'Asistencia manual',
};
