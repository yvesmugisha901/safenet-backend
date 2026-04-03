// Twilio service - lazy initialization (won't crash if credentials not set)
export const sendSMS = async (to: string, body: string) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromPhone) {
    console.log(`[SMS SKIPPED - no Twilio credentials] To: ${to} | Message: ${body}`);
    return;
  }

  try {
    const twilio = require('twilio');
    const client = twilio(accountSid, authToken);
    await client.messages.create({ from: fromPhone, to, body });
    console.log(`SMS sent to ${to}`);
  } catch (err) {
    console.error('SMS failed:', err);
  }
};