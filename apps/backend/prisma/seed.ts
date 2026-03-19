import { PrismaClient, IntegrationType, ConnectorStatus, ComplianceLevel } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Users ────────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin1234!', 12);
  const userHash = await bcrypt.hash('User1234!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@gestorcitas.app' },
    update: {},
    create: {
      email: 'admin@gestorcitas.app',
      passwordHash: adminHash,
      role: 'ADMIN',
      isEmailVerified: true,
      consentGiven: true,
      consentDate: new Date(),
      consentVersion: '1.0',
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'usuario@ejemplo.com' },
    update: {},
    create: {
      email: 'usuario@ejemplo.com',
      passwordHash: userHash,
      role: 'USER',
      isEmailVerified: true,
      consentGiven: true,
      consentDate: new Date(),
      consentVersion: '1.0',
    },
  });

  // ─── Applicant profile ────────────────────────────────────────────────────
  await prisma.applicantProfile.upsert({
    where: { id: 'profile-seed-001' },
    update: {},
    create: {
      id: 'profile-seed-001',
      userId: user.id,
      firstName: 'María',
      lastName: 'García López',
      documentType: 'DNI',
      documentNumber: '12345678Z',
      nationality: 'ES',
      birthDate: new Date('1985-06-15'),
      email: 'maria@ejemplo.com',
      phone: '+34600000000',
      address: { street: 'Calle Mayor 1', city: 'Madrid', province: 'Madrid', postalCode: '28001', country: 'ES' },
      isDefault: true,
    },
  });

  // ─── Organizations ────────────────────────────────────────────────────────
  const sepe = await prisma.organization.upsert({
    where: { slug: 'sepe' },
    update: {},
    create: {
      name: 'Servicio Público de Empleo Estatal (SEPE)',
      slug: 'sepe',
      country: 'ES',
      website: 'https://www.sepe.es',
      description: 'Organismo autónomo adscrito al Ministerio de Trabajo y Economía Social.',
    },
  });

  const dgt = await prisma.organization.upsert({
    where: { slug: 'dgt' },
    update: {},
    create: {
      name: 'Dirección General de Tráfico (DGT)',
      slug: 'dgt',
      country: 'ES',
      website: 'https://www.dgt.es',
      description: 'Organismo responsable de la gestión del tráfico y la seguridad vial.',
    },
  });

  const mockOrg = await prisma.organization.upsert({
    where: { slug: 'organismo-mock' },
    update: {},
    create: {
      name: 'Organismo Mock (Demo)',
      slug: 'organismo-mock',
      country: 'ES',
      region: 'Madrid',
      description: 'Organismo de demostración para pruebas del sistema.',
    },
  });

  // ─── Connectors ───────────────────────────────────────────────────────────
  const mockConnector = await prisma.connector.upsert({
    where: { slug: 'mock-connector-001' },
    update: {},
    create: {
      organizationId: mockOrg.id,
      name: 'Conector Mock (Demo)',
      slug: 'mock-connector-001',
      integrationType: IntegrationType.OFFICIAL_API,
      status: ConnectorStatus.ACTIVE,
      canCheckAvailability: true,
      canBook: true,
      canCancel: true,
      canReschedule: false,
      baseUrl: 'https://mock.organismo.gob.es/api',
      complianceLevel: ComplianceLevel.LOW,
      legalBasis: 'API pública oficial del organismo mock',
      termsOfServiceUrl: 'https://mock.organismo.gob.es/api/terms',
      lastComplianceCheck: new Date(),
    },
  });

  const sepeConnector = await prisma.connector.upsert({
    where: { slug: 'sepe-manual' },
    update: {},
    create: {
      organizationId: sepe.id,
      name: 'SEPE - Asistencia Manual',
      slug: 'sepe-manual',
      integrationType: IntegrationType.MANUAL_ASSISTED,
      status: ConnectorStatus.ACTIVE,
      canCheckAvailability: false,
      canBook: false,
      canCancel: false,
      canReschedule: false,
      baseUrl: 'https://sede.sepe.gob.es',
      complianceLevel: ComplianceLevel.HIGH,
      legalBasis: 'Solo asistencia manual — no existe API pública autorizada',
      notes: 'El portal del SEPE no dispone de API pública. Solo se ofrece asistencia para completar el proceso manualmente.',
    },
  });

  // ─── Procedures ───────────────────────────────────────────────────────────
  await prisma.procedure.upsert({
    where: { organizationId_slug: { organizationId: mockOrg.id, slug: 'cita-demo' } },
    update: {},
    create: {
      organizationId: mockOrg.id,
      connectorId: mockConnector.id,
      name: 'Cita de Demostración',
      slug: 'cita-demo',
      description: 'Trámite de demostración con integración API oficial.',
      category: 'Demo',
      estimatedTime: 30,
      serviceFee: 9.99,
      currency: 'EUR',
      slaHours: 24,
      formSchema: {
        fields: [
          { name: 'firstName', label: 'Nombre', type: 'text', required: true },
          { name: 'lastName', label: 'Apellidos', type: 'text', required: true },
          { name: 'documentNumber', label: 'Número de documento', type: 'text', required: true },
          { name: 'phone', label: 'Teléfono', type: 'tel', required: true },
          { name: 'reason', label: 'Motivo de la cita', type: 'textarea', required: false },
        ],
      },
      eligibilityRules: { minAge: 18, requiredDocuments: ['DNI'] },
    },
  });

  await prisma.procedure.upsert({
    where: { organizationId_slug: { organizationId: sepe.id, slug: 'prestacion-desempleo' } },
    update: {},
    create: {
      organizationId: sepe.id,
      connectorId: sepeConnector.id,
      name: 'Solicitud de Prestación por Desempleo',
      slug: 'prestacion-desempleo',
      description: 'Solicitud de prestación contributiva por desempleo ante el SEPE.',
      category: 'Empleo',
      estimatedTime: 45,
      serviceFee: 19.99,
      currency: 'EUR',
      slaHours: 48,
      legalBasis: 'Ley 31/2015, de 9 de septiembre',
      formSchema: {
        fields: [
          { name: 'firstName', label: 'Nombre', type: 'text', required: true },
          { name: 'lastName', label: 'Apellidos', type: 'text', required: true },
          { name: 'documentType', label: 'Tipo de documento', type: 'select', options: ['DNI', 'NIE', 'Pasaporte'], required: true },
          { name: 'documentNumber', label: 'Número de documento', type: 'text', required: true },
          { name: 'naf', label: 'Número de Afiliación a la Seguridad Social', type: 'text', required: true },
          { name: 'lastEmployer', label: 'Último empleador', type: 'text', required: true },
          { name: 'terminationDate', label: 'Fecha de baja', type: 'date', required: true },
          { name: 'bankAccount', label: 'IBAN', type: 'text', required: true },
        ],
      },
    },
  });

  await prisma.procedure.upsert({
    where: { organizationId_slug: { organizationId: dgt.id, slug: 'canje-permiso-conducir' } },
    update: {},
    create: {
      organizationId: dgt.id,
      name: 'Canje de Permiso de Conducir Extranjero',
      slug: 'canje-permiso-conducir',
      description: 'Canje de permiso de conducir extranjero por permiso español.',
      category: 'Tráfico',
      estimatedTime: 60,
      serviceFee: 24.99,
      currency: 'EUR',
      slaHours: 72,
      formSchema: {
        fields: [
          { name: 'firstName', label: 'Nombre', type: 'text', required: true },
          { name: 'lastName', label: 'Apellidos', type: 'text', required: true },
          { name: 'nie', label: 'NIE/DNI', type: 'text', required: true },
          { name: 'foreignLicenseNumber', label: 'Número de permiso extranjero', type: 'text', required: true },
          { name: 'issuingCountry', label: 'País emisor', type: 'text', required: true },
          { name: 'licenseCategory', label: 'Categoría del permiso', type: 'text', required: true },
        ],
      },
    },
  });

  console.log('✅ Seed completado');
  console.log(`   Admin: admin@gestorcitas.app / Admin1234!`);
  console.log(`   User:  usuario@ejemplo.com / User1234!`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
