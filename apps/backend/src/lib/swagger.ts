export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Gestor de Citas Oficiales API',
    version: '1.0.0',
    description: 'API para gestión de citas en organismos públicos. Esta aplicación actúa como asistente/intermediario y no representa a ningún organismo público.',
    contact: { name: 'Soporte', email: 'soporte@gestorcitas.app' },
  },
  servers: [
    { url: 'http://localhost:3001/api', description: 'Desarrollo' },
    { url: 'https://api.gestorcitas.app/api', description: 'Producción' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth', description: 'Autenticación y autorización' },
    { name: 'Users', description: 'Gestión de usuarios y perfiles' },
    { name: 'Organizations', description: 'Organismos públicos' },
    { name: 'Procedures', description: 'Catálogo de trámites' },
    { name: 'Connectors', description: 'Conectores de integración' },
    { name: 'Bookings', description: 'Reservas y citas' },
    { name: 'Payments', description: 'Pagos y facturas' },
    { name: 'Compliance', description: 'Revisión de cumplimiento' },
    { name: 'Admin', description: 'Panel de administración' },
  ],
};
