import { auditService } from '../audit.service';
import { prisma } from '../../../lib/prisma';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('auditService.log', () => {
  it('llama a prisma.auditLog.create con los parámetros correctos', async () => {
    const params = {
      userId: 'user-1',
      action: 'CREATE' as const,
      entityType: 'User',
      entityId: 'user-1',
    };
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'log-1', ...params });

    await auditService.log(params);

    expect(mockPrisma.auditLog.create as jest.Mock).toHaveBeenCalledWith({ data: params });
  });

  it('si prisma falla, el error se propaga (audit logs son críticos)', async () => {
    const dbError = new Error('DB connection failed');
    (mockPrisma.auditLog.create as jest.Mock).mockRejectedValue(dbError);

    await expect(
      auditService.log({ action: 'LOGIN', userId: 'user-1' })
    ).rejects.toThrow('DB connection failed');
  });
});
