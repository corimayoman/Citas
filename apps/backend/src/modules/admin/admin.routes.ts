import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticate, authorize } from '../../middleware/auth';
import { auditService } from '../audit/audit.service';
import bcrypt from 'bcryptjs';
import { IntegrationType, ConnectorStatus, ComplianceLevel } from '@prisma/client';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'OPERATOR', 'COMPLIANCE_OFFICER'));

// Dashboard stats
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [users, bookings, payments, procedures] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.bookingRequest.groupBy({ by: ['status'], _count: true }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'PAID' } }),
      prisma.procedure.count({ where: { isActive: true } }),
    ]);
    res.json({ data: { users, bookings, totalRevenue: payments._sum.amount, procedures } });
  } catch (err) { next(err); }
});

// All bookings
router.get('/bookings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, page = '1', limit = '20' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [bookings, total] = await Promise.all([
      prisma.bookingRequest.findMany({
        where: { ...(status && { status: status as any }) },
        include: {
          user: { select: { email: true } },
          procedure: { select: { name: true } },
          applicantProfile: { select: { firstName: true, lastName: true } },
          payment: { select: { status: true, amount: true } },
        },
        skip, take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.bookingRequest.count({ where: { ...(status && { status: status as any }) } }),
    ]);
    res.json({ data: bookings, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) { next(err); }
});

// Audit logs
router.get('/audit-logs', authorize('ADMIN', 'COMPLIANCE_OFFICER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, userId, entityType, action } = req.query as Record<string, string>;
    const result = await auditService.getLogs({
      userId, entityType, action: action as any,
      page: parseInt(page || '1'), limit: parseInt(limit || '50'),
    });
    res.json({ data: result });
  } catch (err) { next(err); }
});

// All users
router.get('/users', authorize('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, email: true, role: true, isActive: true, createdAt: true, _count: { select: { bookingRequests: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: users });
  } catch (err) { next(err); }
});

export default router;

// Seed endpoint — solo disponible si NODE_ENV !== 'production'
// POST /api/admin/seed — recrea los datos base (organizaciones, procedimientos, usuarios seed)
router.post('/seed', authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Not available in production' });
    return;
  }
  try {
    const adminHash = await bcrypt.hash('Admin1234!', 12);
    const userHash = await bcrypt.hash('User1234!', 12);

    const admin = await prisma.user.upsert({
      where: { email: 'admin@gestorcitas.app' },
      update: {},
      create: { email: 'admin@gestorcitas.app', passwordHash: adminHash, role: 'ADMIN', isEmailVerified: true, consentGiven: true, consentDate: new Date(), consentVersion: '1.0' },
    });

    const user = await prisma.user.upsert({
      where: { email: 'usuario@ejemplo.com' },
      update: {},
      create: { email: 'usuario@ejemplo.com', passwordHash: userHash, role: 'USER', isEmailVerified: true, consentGiven: true, consentDate: new Date(), consentVersion: '1.0' },
    });

    await prisma.applicantProfile.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: { id: '00000000-0000-0000-0000-000000000001', userId: user.id, firstName: 'María', lastName: 'García López', documentType: 'DNI', documentNumber: '12345678Z', nationality: 'ES', birthDate: new Date('1985-06-15'), isDefault: true },
    });

    const mockOrg = await prisma.organization.upsert({
      where: { slug: 'organismo-mock' },
      update: {},
      create: { name: 'Organismo Mock (Demo)', slug: 'organismo-mock', country: 'ES', region: 'Madrid', description: 'Organismo de demostración para pruebas del sistema.' },
    });

    const sepe = await prisma.organization.upsert({
      where: { slug: 'sepe' },
      update: {},
      create: { name: 'Servicio Público de Empleo Estatal (SEPE)', slug: 'sepe', country: 'ES', website: 'https://www.sepe.es' },
    });

    const dgt = await prisma.organization.upsert({
      where: { slug: 'dgt' },
      update: {},
      create: { name: 'Dirección General de Tráfico (DGT)', slug: 'dgt', country: 'ES', website: 'https://www.dgt.es' },
    });

    const mockConnector = await prisma.connector.upsert({
      where: { slug: 'mock-connector-001' },
      update: {},
      create: { organizationId: mockOrg.id, name: 'Conector Mock (Demo)', slug: 'mock-connector-001', integrationType: IntegrationType.OFFICIAL_API, status: ConnectorStatus.ACTIVE, canCheckAvailability: true, canBook: true, canCancel: true, complianceLevel: ComplianceLevel.LOW, legalBasis: 'API pública oficial del organismo mock', lastComplianceCheck: new Date() },
    });

    const sepeConnector = await prisma.connector.upsert({
      where: { slug: 'sepe-manual' },
      update: {},
      create: { organizationId: sepe.id, name: 'SEPE - Asistencia Manual', slug: 'sepe-manual', integrationType: IntegrationType.MANUAL_ASSISTED, status: ConnectorStatus.ACTIVE, complianceLevel: ComplianceLevel.HIGH, legalBasis: 'Solo asistencia manual' },
    });

    await prisma.procedure.upsert({
      where: { organizationId_slug: { organizationId: mockOrg.id, slug: 'cita-demo' } },
      update: {},
      create: { organizationId: mockOrg.id, connectorId: mockConnector.id, name: 'Cita de Demostración', slug: 'cita-demo', category: 'Demo', serviceFee: 9.99, currency: 'EUR', formSchema: { fields: [{ name: 'firstName', label: 'Nombre', type: 'text', required: true }, { name: 'lastName', label: 'Apellidos', type: 'text', required: true }, { name: 'documentNumber', label: 'Número de documento', type: 'text', required: true }] } },
    });

    await prisma.procedure.upsert({
      where: { organizationId_slug: { organizationId: sepe.id, slug: 'prestacion-desempleo' } },
      update: {},
      create: { organizationId: sepe.id, connectorId: sepeConnector.id, name: 'Solicitud de Prestación por Desempleo', slug: 'prestacion-desempleo', category: 'Empleo', serviceFee: 19.99, currency: 'EUR', formSchema: { fields: [{ name: 'nif', label: 'NIF', type: 'text', required: true }] } },
    });

    await prisma.procedure.upsert({
      where: { organizationId_slug: { organizationId: dgt.id, slug: 'canje-permiso-conducir' } },
      update: {},
      create: { organizationId: dgt.id, name: 'Canje de Permiso de Conducir Extranjero', slug: 'canje-permiso-conducir', category: 'Tráfico', serviceFee: 24.99, currency: 'EUR', formSchema: { fields: [{ name: 'nie', label: 'NIE/DNI', type: 'text', required: true }] } },
    });

    res.json({ data: { ok: true, admin: admin.email, user: user.email } });
  } catch (err) { next(err); }
});
