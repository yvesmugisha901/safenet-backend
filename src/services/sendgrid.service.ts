// SendGrid service - lazy initialization (won't crash if credentials not set)
interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export const sendEmail = async ({ to, subject, text, html }: EmailOptions) => {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.log(`[EMAIL SKIPPED - no SendGrid credentials] To: ${to} | Subject: ${subject}`);
    return;
  }

  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(apiKey);
    await sgMail.send({ to, from: fromEmail, subject, text, html: html || `<p>${text}</p>` });
    console.log(`Email sent to ${to}`);
  } catch (err) {
    console.error('Email failed:', err);
  }
};