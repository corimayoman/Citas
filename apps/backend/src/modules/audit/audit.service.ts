import { AuditAction } from '@prisma/client';
import { prisma } from '../../lib/prisma';

interface AuditParams {
  userId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  before?: object;
  after?: object;
  metadata?: object;
}

export const auditService = {
  async log(params: AuditParams) {
    // Audit logs are immutable — never update, only insert
    return prisma.auditLog.create({ data: params });
  },

  async getLogs(filters: {
    userId?: string;
    entityType?: string;
    entityId?: string;
    action?: AuditAction;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 50, ...where } = filters;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          ...(where.userId && { userId: where.userId }),
          ...(where.entityType && { entityType: where.entityType }),
          ...(where.entityId && { entityId: where.entityId }),
          ...(where.action && { action: where.action }),
          ...(where.from || where.to
            ? { createdAt: { gte: where.from, lte: where.to } }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total, page, limit };
  },
};
