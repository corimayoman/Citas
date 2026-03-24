import nodemailer, { Transporter } from 'nodemailer';
import { logger } from './logger';

let _transporter: Transporter | null = null;

export function getTransporter(): Transporter {
  if (_transporter) return _transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP not configured: SMTP_HOST, SMTP_USER and SMTP_PASS are required');
  }

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT ?? 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  logger.info(`Mailer configured: ${SMTP_HOST}:${SMTP_PORT ?? 587}`);
  return _transporter;
}

export async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const transporter = getTransporter();
  const from = process.env.SMTP_USER;

  await transporter.sendMail({ from, ...params });
  logger.info(`Email sent to ${params.to}: ${params.subject}`);
}

/** Solo para tests — permite inyectar un transporter mock */
export function _setTransporter(t: Transporter | null): void {
  _transporter = t;
}
