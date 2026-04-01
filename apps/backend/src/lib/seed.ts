import { PrismaClient, IntegrationType, ConnectorStatus, ComplianceLevel } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function main() {
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
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
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

  const extranjeria = await prisma.organization.upsert({
    where: { slug: 'extranjeria' },
    update: {},
    create: {
      name: 'Oficina de Extranjería',
      slug: 'extranjeria',
      country: 'ES',
      website: 'https://icp.administracionelectronica.gob.es',
      description: 'Oficinas de Extranjería para trámites de inmigración y permisos de residencia.',
    },
  });

  const aeat = await prisma.organization.upsert({
    where: { slug: 'aeat' },
    update: {},
    create: {
      name: 'Agencia Estatal de Administración Tributaria (AEAT)',
      slug: 'aeat',
      country: 'ES',
      website: 'https://sede.agenciatributaria.gob.es',
      description: 'Agencia responsable de la gestión del sistema tributario estatal.',
    },
  });

  const registroCivil = await prisma.organization.upsert({
    where: { slug: 'registro-civil' },
    update: {},
    create: {
      name: 'Registro Civil — Ministerio de Justicia',
      slug: 'registro-civil',
      country: 'ES',
      website: 'https://sede.mjusticia.gob.es',
      description: 'Registro Civil dependiente del Ministerio de Justicia para actos de estado civil.',
    },
  });

  // ─── Connectors ───────────────────────────────────────────────────────────

  // Existing mock connector
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

  // Existing SEPE manual connector (kept as-is)
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

  // ── Real connectors ───────────────────────────────────────────────────────

  const extranjeriaConnector = await prisma.connector.upsert({
    where: { slug: 'extranjeria' },
    update: {},
    create: {
      organizationId: extranjeria.id,
      name: 'Extranjería — Oficina de Extranjería',
      slug: 'extranjeria',
      integrationType: IntegrationType.AUTHORIZED_INTEGRATION,
      status: ConnectorStatus.ACTIVE,
      canCheckAvailability: true,
      canBook: true,
      canCancel: true,
      canReschedule: false,
      baseUrl: 'https://icp.administracionelectronica.gob.es',
      complianceLevel: ComplianceLevel.CRITICAL,
      legalBasis: 'Integración autorizada con el portal de Extranjería',
      termsOfServiceUrl: 'https://icp.administracionelectronica.gob.es/icpplus/condiciones',
    },
  });

  const dgtConnector = await prisma.connector.upsert({
    where: { slug: 'dgt' },
    update: {},
    create: {
      organizationId: dgt.id,
      name: 'DGT — Dirección General de Tráfico',
      slug: 'dgt',
      integrationType: IntegrationType.AUTHORIZED_INTEGRATION,
      status: ConnectorStatus.ACTIVE,
      canCheckAvailability: true,
      canBook: true,
      canCancel: true,
      canReschedule: false,
      baseUrl: 'https://sedeclave.dgt.gob.es',
      complianceLevel: ComplianceLevel.HIGH,
      legalBasis: 'Integración autorizada con el portal de la DGT',
      termsOfServiceUrl: 'https://sedeclave.dgt.gob.es/condiciones',
    },
  });

  const aeatConnector = await prisma.connector.upsert({
    where: { slug: 'aeat' },
    update: {},
    create: {
      organizationId: aeat.id,
      name: 'AEAT — Agencia Estatal de Administración Tributaria',
      slug: 'aeat',
      integrationType: IntegrationType.AUTHORIZED_INTEGRATION,
      status: ConnectorStatus.ACTIVE,
      canCheckAvailability: true,
      canBook: true,
      canCancel: true,
      canReschedule: false,
      baseUrl: 'https://sede.agenciatributaria.gob.es',
      complianceLevel: ComplianceLevel.HIGH,
      legalBasis: 'Integración autorizada con el portal de la AEAT',
      termsOfServiceUrl: 'https://sede.agenciatributaria.gob.es/condiciones',
    },
  });

  const sepeRealConnector = await prisma.connector.upsert({
    where: { slug: 'sepe' },
    update: {},
    create: {
      organizationId: sepe.id,
      name: 'SEPE — Servicio Público de Empleo Estatal',
      slug: 'sepe',
      integrationType: IntegrationType.AUTHORIZED_INTEGRATION,
      status: ConnectorStatus.ACTIVE,
      canCheckAvailability: true,
      canBook: true,
      canCancel: true,
      canReschedule: false,
      baseUrl: 'https://sede.sepe.gob.es',
      complianceLevel: ComplianceLevel.MEDIUM,
      legalBasis: 'Integración autorizada con el portal del SEPE',
      termsOfServiceUrl: 'https://sede.sepe.gob.es/condiciones',
    },
  });

  const registroCivilConnector = await prisma.connector.upsert({
    where: { slug: 'registro-civil' },
    update: {},
    create: {
      organizationId: registroCivil.id,
      name: 'Registro Civil — Ministerio de Justicia',
      slug: 'registro-civil',
      integrationType: IntegrationType.AUTHORIZED_INTEGRATION,
      status: ConnectorStatus.ACTIVE,
      canCheckAvailability: true,
      canBook: true,
      canCancel: true,
      canReschedule: false,
      baseUrl: 'https://sede.mjusticia.gob.es',
      complianceLevel: ComplianceLevel.HIGH,
      legalBasis: 'Integración autorizada con el portal del Registro Civil',
      termsOfServiceUrl: 'https://sede.mjusticia.gob.es/condiciones',
    },
  });

  // ─── Procedures ───────────────────────────────────────────────────────────

  // Existing mock procedure
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

  // Existing SEPE manual procedure (kept as-is, linked to sepe-manual connector)
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

  // Existing DGT procedure — now linked to the real dgt connector
  await prisma.procedure.upsert({
    where: { organizationId_slug: { organizationId: dgt.id, slug: 'canje-permiso-conducir' } },
    update: { connectorId: dgtConnector.id },
    create: {
      organizationId: dgt.id,
      connectorId: dgtConnector.id,
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

  // ── Extranjería procedures ────────────────────────────────────────────────

  await prisma.procedure.upsert({
    where: { organizationId_slug: { organizationId: extranjeria.id, slug: 'toma-huellas' } },
    update: {},
    create: {
      organizationId: extranjeria.id,
      connectorId: extranjeriaConnector.id,
      name: 'Toma de Huellas y Renovación de Tarjeta',
      slug: 'toma-huellas',
      description: 'Cita para toma de huellas, renovación o expedición de la Tarjeta de Identidad de Extranjero (TIE).',
      category: 'Extranjería',
      estimatedTime: 30,
      serviceFee: 14.99,
      currency: 'EUR',
      slaHours: 48,
      legalBasis: 'Real Decreto 557/2011, Reglamento de la Ley Orgánica 4/2000',
      formSchema: {
        fields: [
          { name: 'firstName', label: 'Nombre', type: 'text', required: true },
          { name: 'lastName', label: 'Apellidos', type: 'text', required: true },
          { name: 'nie', label: 'NIE', type: 'text', required: true },
          { name: 'nationality', label: 'Nacionalidad', type: 'text', required: true },
          { name: 'phone', label: 'Teléfono', type: 'tel', required: true },
          { name: 'email', label: 'Correo electrónico', type: 'email', required: true },
        ],
      },
      eligibilityRules: {
        requiredDocuments: ['NIE', 'Pasaporte'],
        validDocumentTypes: ['NIE'],
        notes: 'Debe tener NIE asignado previamente.',
      },
    },
  });

  await prisma.procedure.upsert({
    where: { organizationId_slug: { organizationId: extranjeria.id, slug: 'recogida-tie' } },
    update: {},
    create: {
      organizationId: extranjeria.id,
      connectorId: extranjeriaConnector.id,
      name: 'Recogida de Tarjeta de Identidad de Extranjero (TIE)',
      slug: 'recogida-tie',
      description: 'Cita para recoger la Tarjeta de Identidad de Extranjero una vez expedida.',
      category: 'Extranjería',
      estimatedTime: 15,
      serviceFee: 14.99,
      currency: 'EUR',
      slaHours: 48,
      formSchema: {
        fields: [
          { name: 'firstName', label: 'Nombre', type: 'text', required: true },
          { name: 'lastName', label: 'Apellidos', type: 'text', required: true },
          { name: 'documentType', label: 'Tipo de documento', type: 'select', options: ['NIE', 'Pasaporte'], required: true },
          { name: 'documentNumber', label: 'Número de documento', type: 'text', required: true },
          { name: 'nationality', label: 'Nacionalidad', type: 'text', required: true },
          { name: 'phone', label: 'Teléfono', type: 'tel', required: false },
        ],
      },
      eligibilityRules: {
        requiredDocuments: ['NIE', 'Pasaporte'],
        notes: 'La tarjeta debe estar lista para recogida.',
      },
    },
  });

  await prisma.procedure.upsert({
    where: { organizationId_slug: { organizationId: extranjeria.id, slug: 'certificados-nie' } },
    update: {},
    create: {
      organizationId: extranjeria.id,
      connectorId: extranjeriaConnector.id,
      name: 'Certificados y Asignación NIE',
      slug: 'certificados-nie',
      description: 'Cita para solicitud de certificados de extranjería y asignación de NIE.',
      category: 'Extranjería',
      estimatedTime: 30,
      serviceFee: 14.99,
      currency: 'EUR',
      slaHours: 48,
      formSchema: {
        fields: [
          { name: 'firstName', label: 'Nombre', type: 'text', required: true },
          { name: 'lastName', label: 'Apellidos', type: 'text', required: true },
          { name: 'documentType', label: 'Tipo de documento', type: 'select', options: ['Pasaporte', 'NIE', 'Documento de identidad'], required: true },
          { name: 'documentNumber', label: 'Número de documento', type: 'text', required: true },
          { name: 'nationality', label: 'Nacionalidad', type: 'text', required: true },
          { name: 'reason', label: 'Motivo de la solicitud', type: 'textarea', required: false },
        ],
      },
      eligibilityRules: {
        requiredDocuments: ['Pasaporte'],
        notes: 'Válido para ciudadanos extranjeros que necesiten NIE o certificados.',
      },
    },
  });

  // ── AEAT procedures ───────────────────────────────────────────────────────

  await prisma.procedure.upsert({
    where: { organizationId_slug: { organizationId: aeat.id, slug: 'declaracion-renta' } },
    update: {},
    create: {
      organizationId: aeat.id,
      connectorId: aeatConnector.id,
      name: 'Declaración de la Renta (IRPF)',
      slug: 'declaracion-renta',
      description: 'Cita previa para la confección y presentación de la declaración del IRPF.',
      category: 'Hacienda',
      estimatedTime: 45,
      serviceFee: 19.99,
      currency: 'EUR',
      slaHours: 72,
      legalBasis: 'Ley 35/2006, de 28 de noviembre, del IRPF',
      formSchema: {
        fields: [
          { name: 'firstName', label: 'Nombre', type: 'text', required: true },
          { name: 'lastName', label: 'Apellidos', type: 'text', required: true },
          { name: 'documentType', label: 'Tipo de documento', type: 'select', options: ['DNI', 'NIE'], required: true },
          { name: 'documentNumber', label: 'Número de documento', type: 'text', required: true },
          { name: 'fiscalYear', label: 'Ejercicio fiscal', type: 'text', required: true },
          { name: 'phone', label: 'Teléfono', type: 'tel', required: true },
          { name: 'email', label: 'Correo electrónico', type: 'email', required: false },
        ],
      },
      eligibilityRules: {
        requiredDocuments: ['DNI', 'NIE'],
        notes: 'Obligatorio para contribuyentes con rentas superiores al mínimo legal.',
      },
    },
  });

  await prisma.procedure.upsert({
    where: { organizationId_slug: { organizationId: aeat.id, slug: 'consulta-tributaria' } },
    update: {},
    create: {
      organizationId: aeat.id,
      connectorId: aeatConnector.id,
      name: 'Consulta Tributaria General',
      slug: 'consulta-tributaria',
      description: 'Cita previa para consultas tributarias generales en oficinas de la AEAT.',
      category: 'Hacienda',
      estimatedTime: 30,
      serviceFee: 14.99,
      currency: 'EUR',
      slaHours: 48,
      formSchema: {
        fields: [
          { name: 'firstName', label: 'Nombre', type: 'text', required: true },
          { name: 'lastName', label: 'Apellidos', type: 'text', required: true },
          { name: 'documentType', label: 'Tipo de documento', type: 'select', options: ['DNI', 'NIE', 'Pasaporte'], required: true },
          { name: 'documentNumber', label: 'Número de documento', type: 'text', required: true },
          { name: 'consultType', label: 'Tipo de consulta', type: 'select', options: ['IVA', 'IRPF', 'Sociedades', 'Otros'], required: true },
          { name: 'description', label: 'Descripción de la consulta', type: 'textarea', required: false },
        ],
      },
      eligibilityRules: {
        requiredDocuments: ['DNI', 'NIE', 'Pasaporte'],
      },
    },
  });

  // ── Registro Civil procedures ─────────────────────────────────────────────

  await prisma.procedure.upsert({
    where: { organizationId_slug: { organizationId: registroCivil.id, slug: 'certificado-nacimiento' } },
    update: {},
    create: {
      organizationId: registroCivil.id,
      connectorId: registroCivilConnector.id,
      name: 'Certificado de Nacimiento',
      slug: 'certificado-nacimiento',
      description: 'Solicitud de certificado literal o extracto de nacimiento del Registro Civil.',
      category: 'Registro Civil',
      estimatedTime: 20,
      serviceFee: 9.99,
      currency: 'EUR',
      slaHours: 48,
      formSchema: {
        fields: [
          { name: 'firstName', label: 'Nombre', type: 'text', required: true },
          { name: 'lastName', label: 'Apellidos', type: 'text', required: true },
          { name: 'documentType', label: 'Tipo de documento', type: 'select', options: ['DNI', 'NIE', 'Pasaporte'], required: true },
          { name: 'documentNumber', label: 'Número de documento', type: 'text', required: true },
          { name: 'birthDate', label: 'Fecha de nacimiento', type: 'date', required: true },
          { name: 'birthPlace', label: 'Lugar de nacimiento', type: 'text', required: true },
          { name: 'certificateType', label: 'Tipo de certificado', type: 'select', options: ['Literal', 'Extracto', 'Plurilingüe'], required: true },
        ],
      },
      eligibilityRules: {
        requiredDocuments: ['DNI', 'NIE', 'Pasaporte'],
        notes: 'Puede solicitarlo el titular o un familiar directo.',
      },
    },
  });

  await prisma.procedure.upsert({
    where: { organizationId_slug: { organizationId: registroCivil.id, slug: 'matrimonio-civil' } },
    update: {},
    create: {
      organizationId: registroCivil.id,
      connectorId: registroCivilConnector.id,
      name: 'Matrimonio Civil',
      slug: 'matrimonio-civil',
      description: 'Cita previa para la tramitación del expediente de matrimonio civil.',
      category: 'Registro Civil',
      estimatedTime: 60,
      serviceFee: 19.99,
      currency: 'EUR',
      slaHours: 72,
      legalBasis: 'Código Civil, artículos 49 y siguientes',
      formSchema: {
        fields: [
          { name: 'firstName', label: 'Nombre (solicitante 1)', type: 'text', required: true },
          { name: 'lastName', label: 'Apellidos (solicitante 1)', type: 'text', required: true },
          { name: 'documentType', label: 'Tipo de documento (solicitante 1)', type: 'select', options: ['DNI', 'NIE', 'Pasaporte'], required: true },
          { name: 'documentNumber', label: 'Número de documento (solicitante 1)', type: 'text', required: true },
          { name: 'partnerFirstName', label: 'Nombre (solicitante 2)', type: 'text', required: true },
          { name: 'partnerLastName', label: 'Apellidos (solicitante 2)', type: 'text', required: true },
          { name: 'partnerDocumentType', label: 'Tipo de documento (solicitante 2)', type: 'select', options: ['DNI', 'NIE', 'Pasaporte'], required: true },
          { name: 'partnerDocumentNumber', label: 'Número de documento (solicitante 2)', type: 'text', required: true },
        ],
      },
      eligibilityRules: {
        requiredDocuments: ['DNI', 'NIE', 'Pasaporte'],
        notes: 'Ambos contrayentes deben ser mayores de edad o estar emancipados.',
        minAge: 18,
      },
    },
  });

  console.log('✅ Seed completado');
  console.log(`   Admin: admin@gestorcitas.app / Admin1234!`);
  console.log(`   User:  usuario@ejemplo.com / User1234!`);
}

// Este archivo es importado por reset-and-seed.ts y por prisma/seed.ts (script directo)
