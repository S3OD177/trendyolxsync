import nodemailer from "nodemailer";
import { env } from "@/lib/config/env";

export interface NotificationPayload {
  title: string;
  body: string;
}

const hasEmailConfig =
  !!env.SMTP_HOST &&
  !!env.SMTP_PORT &&
  !!env.SMTP_USER &&
  !!env.SMTP_PASS &&
  !!env.ALERT_EMAIL_TO;

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!hasEmailConfig) {
    return null;
  }

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: Number(env.SMTP_PORT) === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    });
  }

  return cachedTransporter;
}

export async function sendEmailNotification(payload: NotificationPayload) {
  const transporter = getTransporter();
  if (!transporter) {
    return { sent: false, reason: "Email is not configured" };
  }

  await transporter.sendMail({
    from: env.SMTP_USER,
    to: env.ALERT_EMAIL_TO,
    subject: payload.title,
    text: payload.body
  });

  return { sent: true };
}

export async function sendTelegramNotification(payload: NotificationPayload) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { sent: false, reason: "Telegram is not configured" };
  }

  const message = `${payload.title}\n\n${payload.body}`;

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message
      })
    }
  );

  if (!response.ok) {
    return { sent: false, reason: `Telegram API returned ${response.status}` };
  }

  return { sent: true };
}

export async function notifyAllChannels(payload: NotificationPayload) {
  const [email, telegram] = await Promise.allSettled([
    sendEmailNotification(payload),
    sendTelegramNotification(payload)
  ]);

  return {
    email,
    telegram
  };
}
