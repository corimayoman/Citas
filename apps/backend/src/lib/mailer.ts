import sgMail from '@sendgrid/mail';
import { logger } from './logger';

let _configured = false;

function configure(): void {
  if (_configured) return;

  const { SENDGRID_API_KEY } = process.env;
  if (!SENDGRID_API_KEY) {
    throw new Error('Mailer not configured: SENDGRID_API_KEY is required');
  }

  sgMail.setApiKey(SENDGRID_API_KEY);
  _configured = true;
  logger.info('Mailer configured: SendGrid');
}

export async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  configure();
  const from = process.env.MAIL_FROM ?? 'noreply@gestorcitas.app';

  await sgMail.send({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html ?? params.text,
  });

  logger.info(`Email sent to ${params.to}: ${params.subject}`);
}

/** Solo para tests */
export function _resetMailer(): void {
  _configured = false;
}
