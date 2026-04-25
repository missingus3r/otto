// otto — outbound email helper.
//
// If SMTP_HOST is set, send via nodemailer (real SMTP).
// Otherwise log emails to the console for dev.

import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'otto <noreply@otto.local>';

let _transporter = null;
function getTransporter() {
  if (!SMTP_HOST) return null;
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return _transporter;
}

/**
 * Send an email. Returns { sent: boolean, info|null }.
 * If SMTP not configured, logs to console (dev).
 */
export async function sendMail({ to, subject, text, html }) {
  if (!to || !subject) {
    console.warn('[email] missing to/subject — skipping');
    return { sent: false, info: null };
  }

  const tx = getTransporter();
  if (!tx) {
    console.log(
      `[email] (dev — no SMTP) → to=${to} · subject="${subject}"\n${text || html || ''}`
    );
    return { sent: false, info: null };
  }

  try {
    const info = await tx.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text,
      html,
    });
    console.log(`[email] sent to=${to} subject="${subject}" id=${info.messageId}`);
    return { sent: true, info };
  } catch (err) {
    console.error(`[email] send error to=${to}:`, err.message);
    return { sent: false, info: null };
  }
}

export default { sendMail };
