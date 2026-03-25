import { notificationService } from '../notification.service';
import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';
import * as mailer from '../../../lib/mailer';
import * as sms from '../../../lib/sms';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    notification: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));
jest.mock('../../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../lib/mailer', () => ({ sendMail: jest.fn() }));
jest.mock('../../../lib/sms', () => ({ sendSms: jest.fn() }));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const sendParams = { userId: 'user-1', title: 'Título', body: 'Cuerpo' };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_DEMO_MODE = 'true';
  process.env.NOTIFICATIONS_DEMO_MODE = 'true';
  delete process.env.SMTP_HOST;
  (mockPrisma.notification.create as jest.Mock).mockResolvedValue({ id: 'notif-1', status: 'PENDING' });
  (mockPrisma.notification.update as jest.Mock).mockResolvedValue({});
  (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
    email: 'user@example.com',
    notificationChannel: 'EMAIL',
    notificationPhone: null,
  });
});

afterEach(() => {
  delete process.env.STRIPE_DEMO_MODE;
  delete process.env.NOTIFICATIONS_DEMO_MODE;
});

describe('notificationService.send — demo mode', () => {
  it('marca la notificación como SENT sin llamar a sendMail ni sendSms', async () => {
    await notificationService.send(sendParams);

    expect(mailer.sendMail as jest.Mock).not.toHaveBeenCalled();
    expect(sms.sendSms as jest.Mock).not.toHaveBeenCalled();
    expect(mockPrisma.notification.update as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) })
    );
  });

  it('loguea con [DEMO] y el canal usado', async () => {
    await notificationService.send(sendParams);
    expect(logger.info as jest.Mock).toHaveBeenCalledWith(expect.stringContaining('[DEMO]'));
  });
});

describe('notificationService.send — modo real, canal EMAIL', () => {
  beforeEach(() => {
    process.env.STRIPE_DEMO_MODE = 'false';
    process.env.NOTIFICATIONS_DEMO_MODE = 'false';
  });

  it('llama a sendMail con el email del usuario', async () => {
    (mailer.sendMail as jest.Mock).mockResolvedValue(undefined);

    await notificationService.send(sendParams);

    expect(mailer.sendMail as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com', subject: sendParams.title })
    );
  });

  it('si sendMail falla, marca FAILED y no propaga el error', async () => {
    (mailer.sendMail as jest.Mock).mockRejectedValue(new Error('SMTP error'));

    await expect(notificationService.send(sendParams)).resolves.not.toThrow();

    expect(mockPrisma.notification.update as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
    );
    expect(logger.error as jest.Mock).toHaveBeenCalled();
  });
});

describe('notificationService.send — modo real, canal SMS', () => {
  beforeEach(() => {
    process.env.STRIPE_DEMO_MODE = 'false';
    process.env.NOTIFICATIONS_DEMO_MODE = 'false';
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      email: 'user@example.com',
      notificationChannel: 'SMS',
      notificationPhone: '+5491112345678',
    });
  });

  it('usa el canal preferido del usuario (SMS) cuando no se fuerza canal', async () => {
    (sms.sendSms as jest.Mock).mockResolvedValue(undefined);

    await notificationService.send(sendParams);

    expect(sms.sendSms as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+5491112345678', body: sendParams.body })
    );
    expect(mailer.sendMail as jest.Mock).not.toHaveBeenCalled();
  });

  it('si el usuario no tiene notificationPhone, marca FAILED y no propaga', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      notificationChannel: 'SMS',
      notificationPhone: null,
    });

    await expect(notificationService.send(sendParams)).resolves.not.toThrow();

    expect(mockPrisma.notification.update as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
    );
  });

  it('si sendSms falla, marca FAILED y no propaga el error', async () => {
    (sms.sendSms as jest.Mock).mockRejectedValue(new Error('Twilio error'));

    await expect(notificationService.send(sendParams)).resolves.not.toThrow();

    expect(mockPrisma.notification.update as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
    );
  });
});

describe('notificationService.send — canal forzado override preferencia', () => {
  beforeEach(() => {
    process.env.STRIPE_DEMO_MODE = 'false';
    process.env.NOTIFICATIONS_DEMO_MODE = 'false';
  });

  it('si se pasa channel=EMAIL explícito, usa email aunque la preferencia sea SMS', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      email: 'user@example.com',
      notificationChannel: 'SMS',
      notificationPhone: '+5491112345678',
    });
    (mailer.sendMail as jest.Mock).mockResolvedValue(undefined);

    await notificationService.send({ ...sendParams, channel: 'EMAIL' as any });

    expect(mailer.sendMail as jest.Mock).toHaveBeenCalled();
    expect(sms.sendSms as jest.Mock).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// Demo mode — lógica de fallback (NOTIFICATIONS_DEMO_MODE no seteado)
// Cubre el cambio documentado en MOCKS.md: la variable correcta es
// NOTIFICATIONS_DEMO_MODE, no STRIPE_DEMO_MODE, para controlar el modo demo.
// ---------------------------------------------------------------------------

describe('notificationService.send — demo mode fallback (sin NOTIFICATIONS_DEMO_MODE)', () => {
  beforeEach(() => {
    delete process.env.NOTIFICATIONS_DEMO_MODE;
  });

  it('activa demo si STRIPE_DEMO_MODE=true y no hay SENDGRID_API_KEY', async () => {
    process.env.STRIPE_DEMO_MODE = 'true';
    delete process.env.SENDGRID_API_KEY;

    await notificationService.send(sendParams);

    expect(mailer.sendMail as jest.Mock).not.toHaveBeenCalled();
    expect(logger.info as jest.Mock).toHaveBeenCalledWith(expect.stringContaining('[DEMO]'));
  });

  it('NO activa demo si STRIPE_DEMO_MODE=true pero hay SENDGRID_API_KEY', async () => {
    process.env.STRIPE_DEMO_MODE = 'true';
    process.env.SENDGRID_API_KEY = 'SG.fake';
    (mailer.sendMail as jest.Mock).mockResolvedValue(undefined);

    await notificationService.send(sendParams);

    expect(mailer.sendMail as jest.Mock).toHaveBeenCalled();
    expect(logger.info as jest.Mock).not.toHaveBeenCalledWith(expect.stringContaining('[DEMO]'));

    delete process.env.SENDGRID_API_KEY;
  });

  it('NOTIFICATIONS_DEMO_MODE=false fuerza modo real aunque STRIPE_DEMO_MODE=true', async () => {
    process.env.NOTIFICATIONS_DEMO_MODE = 'false';
    process.env.STRIPE_DEMO_MODE = 'true';
    (mailer.sendMail as jest.Mock).mockResolvedValue(undefined);

    await notificationService.send(sendParams);

    expect(mailer.sendMail as jest.Mock).toHaveBeenCalled();
    expect(logger.info as jest.Mock).not.toHaveBeenCalledWith(expect.stringContaining('[DEMO]'));
  });
});
