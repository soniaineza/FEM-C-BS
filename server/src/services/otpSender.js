const { config } = require('../config');

/**
 * SMS delivery for OTP codes. The provider is chosen by SMS_PROVIDER:
 *   pindo           — https://api.pindo.io/v1/sms/ (Rwanda; SMS_API_KEY = Pindo token)
 *   africastalking  — Africa's Talking messaging API (SMS_API_KEY + AT_USERNAME)
 *   generic         — POST { to, sender, message } JSON to SMS_GATEWAY_URL
 *   OTP_MODE=demo   — nothing is sent, whatever the provider: the app
 *                     shows the code on screen (a pilot setting).
 *   (unset)         — local database only: the code is logged server-side.
 *                     On a hosted database sending fails instead, so codes
 *                     never reach the log. Production refuses to start
 *                     without a provider (see config.js).
 *
 * Codes are never returned in API responses unless DEV_REVEAL_CODES=1.
 */

/** E.164 for Rwandan numbers: 078... / 78... / 250... -> +25078... */
function toE164(phone) {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('250')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+250${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('7')) return `+250${digits}`;
  return `+${digits}`;
}

async function expectOk(res, provider) {
  if (res.ok) return res.json().catch(() => ({}));
  const body = await res.text().catch(() => '');
  throw new Error(`${provider} responded ${res.status}: ${body.slice(0, 300)}`);
}

async function sendViaPindo(to, text) {
  const res = await fetch('https://api.pindo.io/v1/sms/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.smsApiKey}`,
    },
    body: JSON.stringify({ to, text, sender: config.smsSenderName }),
    signal: AbortSignal.timeout(10000),
  });
  await expectOk(res, 'Pindo');
}

async function sendViaAfricasTalking(to, text) {
  const host = config.atUsername === 'sandbox'
    ? 'https://api.sandbox.africastalking.com'
    : 'https://api.africastalking.com';
  const form = new URLSearchParams({ username: config.atUsername, to, message: text });
  if (config.smsSenderName && config.atUsername !== 'sandbox') form.set('from', config.smsSenderName);
  const res = await fetch(`${host}/version1/messaging`, {
    method: 'POST',
    headers: {
      apiKey: config.smsApiKey,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
    signal: AbortSignal.timeout(10000),
  });
  const data = await expectOk(res, "Africa's Talking");
  const recipient = data?.SMSMessageData?.Recipients?.[0];
  if (!recipient || recipient.status !== 'Success') {
    throw new Error(`Africa's Talking rejected the message: ${recipient?.status || JSON.stringify(data).slice(0, 200)}`);
  }
}

async function sendViaGeneric(to, text) {
  const res = await fetch(config.smsGatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.smsApiKey}`,
    },
    body: JSON.stringify({ to, sender: config.smsSenderName, message: text }),
    signal: AbortSignal.timeout(10000),
  });
  await expectOk(res, 'SMS gateway');
}

const PROVIDERS = {
  pindo: sendViaPindo,
  africastalking: sendViaAfricasTalking,
  generic: sendViaGeneric,
};

/** Sends an SMS. Throws when the provider rejects it. */
async function sendSms(phone, text) {
  // Demo mode sends nothing and logs nothing: the code reaches the person
  // through the app (auth.routes.js devPayload), never through an SMS.
  if (config.otpMode === 'demo') return;
  const send = PROVIDERS[config.smsProvider];
  if (!send && !config.localDatabase) {
    // Real people's login codes must never end up in the server log.
    throw new Error('No SMS provider is configured (set SMS_PROVIDER and SMS_API_KEY).');
  }
  if (!send) {
    console.log(`[otpSender] (no SMS provider — dev log) to ${phone}: ${text}`);
    return;
  }
  await send(toE164(phone), text);
}

/**
 * Delivers a verification code to a passenger. Throws if the SMS could not
 * be sent, so callers can tell the user to retry.
 *
 * @param {{phone: string}} passenger
 * @param {{code: string, purpose: 'signup'|'reset'}} params
 */
async function sendOtp(passenger, { code, purpose }) {
  const purposeLabel = purpose === 'reset' ? 'password reset' : 'verification';
  const text = `${config.smsSenderName}: your ${purposeLabel} code is ${code}. It expires in ${Math.round(
    config.otpTtlSeconds / 60
  )} minutes. Do not share it with anyone.`;
  try {
    await sendSms(passenger.phone, text);
  } catch (err) {
    console.error('[otpSender] SMS delivery failed:', err.message);
    throw err;
  }
}

module.exports = { sendOtp, sendSms, toE164, SMS_PROVIDERS: Object.keys(PROVIDERS) };
