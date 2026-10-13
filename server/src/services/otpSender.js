const { config } = require('../config');
const _internals = { fetch: (...args) => fetch(...args) };

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
  throw new Error(`${provider} responded ${res.status}: ${describeError(body)}`);
}

const META_HINTS = {
  131030: 'while the Meta app is in test mode, the number must be added to the allowed test recipients',
  131026: 'that number cannot receive WhatsApp messages (no WhatsApp, old version, or terms not accepted)',
  131056: 'too many messages to this number in a short time; wait and retry',
  131049: 'Meta held the message back; wait 24 hours before resending',
  132001: 'the template does not exist in this language or is not approved yet (check WHATSAPP_OTP_TEMPLATE and WHATSAPP_TEMPLATE_LANGUAGE, e.g. en vs en_US)',
  132000: 'the template expects a different number of parameters',
  132012: 'a parameter does not match the template\'s format',
  133010: 'the sender phone number is not registered on the WhatsApp Business Platform',
  190: 'the access token has expired; generate a permanent system-user token',
  10: 'the token lacks the whatsapp_business_messaging permission',
  200: 'no valid access token was sent',
  100: 'a request parameter is wrong (phone number ID, template name or recipient format)',
  80007: 'the WhatsApp Business Account hit its rate limit',
  130429: 'message throughput limit reached; retry shortly',
};
function describeError(body) {
  try {
    const err = JSON.parse(body).error;
    if (err && (err.message || err.code)) {
      const details = err.error_data && err.error_data.details ? ` — ${err.error_data.details}` : '';
      const hint = META_HINTS[err.code] ? ` (${META_HINTS[err.code]})` : '';
      return `error ${err.code}${err.error_subcode ? `/${err.error_subcode}` : ''}: ${err.message}${details}${hint}`;
    }
  } catch {
  
  }
  return body.slice(0, 300);
}

async function sendViaWhatsApp(to, code) {
  // Meta caps the code parameter at 15 characters.
  if (String(code).length > 15) throw new Error('WhatsApp authentication templates accept codes of at most 15 characters.');
  const url = `https://graph.facebook.com/${config.whatsappApiVersion}/${config.whatsappPhoneNumberId}/messages`;
  const res = await _internals.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.whatsappAccessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      // E.164 with the plus sign: without it Meta prepends the business
      // number's country code and can send the code to the wrong number.
      to,
      type: 'template',
      template: {
        name: config.whatsappOtpTemplate,
        language: { code: config.whatsappTemplateLanguage },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await expectOk(res, 'WhatsApp');
  if (!data?.messages?.[0]?.id) {
    throw new Error(`WhatsApp accepted the request without a message id: ${JSON.stringify(data).slice(0, 200)}`);
  }
}

function whatsappConfigured() {
  return Boolean(config.whatsappAccessToken && config.whatsappPhoneNumberId);
}

// ---- SMS ------------------------------------------------------------------

async function sendViaPindo(to, text) {
  const res = await _internals.fetch('https://api.pindo.io/v1/sms/', {
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
  const res = await _internals.fetch(`${host}/version1/messaging`, {
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
  const res = await _internals.fetch(config.smsGatewayUrl, {
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

function smsConfigured() {
  return Boolean(PROVIDERS[config.smsProvider]);
}

/** Sends an SMS. Throws when the provider rejects it. */
async function sendSms(phone, text) {
  const send = PROVIDERS[config.smsProvider];
  if (!send && config.localDatabase && config.devRevealCodes) return;
  if (!send) throw new Error('No SMS provider is configured (set SMS_PROVIDER and SMS_API_KEY).');
  await send(toE164(phone), text);
}

// ---- Email (SMTP) ---------------------------------------------------------

function emailConfigured() {
  return Boolean(config.smtpHost && config.smtpUser && config.smtpPass);
}

// One reusable transport (a pooled SMTP connection), built lazily so the
// server starts fine without e-mail configured. Tests swap _internals.mailer.
let transport = null;
function mailer() {
  if (_internals.mailer) return _internals.mailer;
  if (!transport) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  }
  return transport;
}

/** Sends the code by e-mail. Throws when the SMTP server rejects it. */
async function sendViaEmail(email, code, purpose) {
  const label = purpose === 'reset' ? 'password reset' : 'verification';
  const minutes = Math.round(config.otpTtlSeconds / 60);
  const info = await mailer().sendMail({
    from: config.smtpFrom,
    to: email,
    subject: `${config.smsSenderName} ${label} code: ${code}`,
    text: `Your ${config.smsSenderName} ${label} code is ${code}. It expires in ${minutes} minutes. Do not share it with anyone.`,
    html: `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:420px">
      <p>Your <strong>${config.smsSenderName}</strong> ${label} code is:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:6px;color:#0E7C4A;margin:8px 0">${code}</p>
      <p style="color:#6B7280;font-size:14px">It expires in ${minutes} minutes. Do not share it with anyone.</p>
    </div>`,
  });
  if (info.rejected && info.rejected.length) {
    throw new Error(`The mail server rejected ${info.rejected.join(', ')}.`);
  }
}


function smsText(code, purpose) {
  const purposeLabel = purpose === 'reset' ? 'password reset' : 'verification';
  return `${config.smsSenderName}: your ${purposeLabel} code is ${code}. It expires in ${Math.round(
    config.otpTtlSeconds / 60
  )} minutes. Do not share it with anyone.`;
}

/**
 * Delivers a verification code through the three channels, in order, using
 * whichever are configured and apply to this account:
 *
 *   1. WhatsApp  — if WHATSAPP_* is set and the account has a phone
 *   2. SMS       — if SMS_PROVIDER (e.g. pindo) is set and the account has a phone
 *   3. Email     — if SMTP_* is set and the account has an e-mail
 *
 * The first channel that succeeds wins; if one is configured but fails, the
 * next is tried. Throws only when every applicable channel failed, so the
 * caller can ask the rider to retry. On a local database with DEV_REVEAL_CODES
 * and nothing configured, returns 'none' (the code is shown to the tester).
 *
 * @param {{phone?: string, email?: string}} passenger
 * @param {{code: string, purpose: 'signup'|'reset'|'login'}} params
 * @returns {Promise<'whatsapp'|'sms'|'email'|'none'>} the channel that took the code
 */
async function sendOtp(passenger, { code, purpose }) {
  const phone = passenger.phone ? toE164(passenger.phone) : '';
  const email = passenger.email || '';

  // Build the fallback chain from what is configured and reachable.
  const chain = [];
  if (phone && whatsappConfigured()) chain.push(['whatsapp', () => sendViaWhatsApp(phone, code)]);
  if (phone && smsConfigured()) chain.push(['sms', () => sendSms(phone, smsText(code, purpose))]);
  if (email && emailConfigured()) chain.push(['email', () => sendViaEmail(email, code, purpose)]);

  if (!chain.length) {
    // Nothing is set up. On a local dev database the code is revealed to the
    // tester; a real server must have a channel, so this is a hard error.
    if (config.localDatabase && config.devRevealCodes) return 'none';
    throw new Error('No OTP channel is configured. Set the WHATSAPP_*, SMS_* or SMTP_* variables.');
  }

  let lastError;
  for (const [name, send] of chain) {
    try {
      await send();
      return name;
    } catch (err) {
      lastError = err;
      console.error(`[otpSender] ${name} delivery failed:`, err.message);
      // Try the next configured channel.
    }
  }
  if (config.localDatabase && config.devRevealCodes) return 'none';
  throw lastError || new Error('Every configured OTP channel failed.');
}

function mask(value) {
  const s = String(value || '');
  return s ? `${s.slice(0, 4)}…${s.slice(-3)}` : null;
}

function otpStatus() {
  // The channel the apps advertise: WhatsApp if it can send, else SMS if it
  // can, else email. (All configured channels still act as fallbacks.)
  const channel = whatsappConfigured() ? 'whatsapp' : smsConfigured() ? 'sms' : emailConfigured() ? 'email' : 'none';
  return {
    channel,
    order: ['whatsapp', 'sms', 'email'].filter((c) =>
      c === 'whatsapp' ? whatsappConfigured() : c === 'sms' ? smsConfigured() : emailConfigured()
    ),
    whatsapp: {
      configured: whatsappConfigured(),
      active: channel === 'whatsapp',
      phoneNumberId: mask(config.whatsappPhoneNumberId),
      template: config.whatsappOtpTemplate,
      language: config.whatsappTemplateLanguage,
      apiVersion: config.whatsappApiVersion,
    },
    sms: {
      configured: smsConfigured(),
      provider: smsConfigured() ? config.smsProvider : null,
    },
    email: {
      configured: emailConfigured(),
      host: config.smtpHost || null,
      from: config.smtpFrom || null,
    },
    ready: whatsappConfigured() || smsConfigured() || emailConfigured(),
  };
}

/** Sends a real code to a phone and/or e-mail, for the operator "send test" button. */
async function sendTestCode({ phone, email } = {}) {
  const { generateCode } = require('../utils/otp');
  const channel = await sendOtp({ phone, email }, { code: generateCode(), purpose: 'signup' });
  return { channel, to: email || (phone ? toE164(phone) : '') };
}

module.exports = {
  sendOtp,
  sendSms,
  sendViaEmail,
  sendTestCode,
  otpStatus,
  toE164,
  emailConfigured,
  whatsappConfigured,
  smsConfigured,
  SMS_PROVIDERS: Object.keys(PROVIDERS),
  _internals,
};
