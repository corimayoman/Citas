import { logger } from './logger';

export async function sendSms(params: { to: string; body: string }): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    throw new Error('SMS not configured: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are required');
  }

  // Import dinámico para no romper el arranque si twilio no está configurado
  const twilio = (await import('twilio')).default;
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  await client.messages.create({
    to: params.to,
    from: TWILIO_FROM_NUMBER,
    body: params.body,
  });

  logger.info(`SMS sent to ${params.to}`);
}
