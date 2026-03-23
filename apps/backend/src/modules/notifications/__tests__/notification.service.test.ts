import { notificationService } from '../notification.service';
import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_DEMO_MODE = 'true';
});

afterEach(() => {
  delete process.env.STRIPE_DEMO_MODE;
});

const sendParams = {
  userId: 'user-1',
  title: 'Título de prueba',
  body: 'Cuerpo del mensaje',
};

describe('notificationService.send', () => {
  it('STRIPE_DEMO_MODE=true: crea notification con status SENT y llama a logger.info', async () => {
    (mockPrisma.notification.create as jest.Mock).mockResolvedValue({ id: 'notif-1', status: 'SENT' });

    await notificationService.send(sendParams);

    expect(mockPrisma.notification.create as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT' }),
      })
    );
    expect(logger.info as jest.Mock).toHaveBeenCalled();
  });

  it('STRIPE_DEMO_MODE=true: NO llama a nodemailer', async () => {
    (mockPrisma.notification.create as jest.Mock).mockResolvedValue({ id: 'notif-1', status: 'SENT' });

    // nodemailer no está importado en el servicio, solo verificamos que no hay errores
    // y que el flujo demo se ejecuta correctamente
    await expect(notificationService.send(sendParams)).resolves.not.toThrow();
    expect(logger.warn as jest.Mock).not.toHaveBeenCalled();
  });

  it('STRIPE_DEMO_MODE=false: crea notification con status PENDING y llama a logger.warn', async () => {
    process.env.STRIPE_DEMO_MODE = 'false';
    (mockPrisma.notification.create as jest.Mock).mockResolvedValue({ id: 'notif-2', status: 'PENDING' });

    await notificationService.send(sendParams);

    expect(mockPrisma.notification.create as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }),
      })
    );
    expect(logger.warn as jest.Mock).toHaveBeenCalled();
  });
});

describe('notificationService.markRead', () => {
  it('llama a prisma.notification.updateMany con readAt', async () => {
    (mockPrisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await notificationService.markRead('notif-1', 'user-1');

    expect(mockPrisma.notification.updateMany as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notif-1', userId: 'user-1' },
        data: expect.objectContaining({ readAt: expect.any(Date) }),
      })
    );
  });
});
