// Verification-code delivery through WhatsApp, with SMS as the fallback.
// No network: the sender's fetch is replaced and every request is recorded.
//   npm run test:otp-whatsapp
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/test';
const { config } = require('../src/config');
const otp = require('../src/services/otpSender');

let calls;
function respond(status, body) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}
function fakeFetch(plan) {
  return async (url, init) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
    const next = plan.shift();
    return typeof next === 'function' ? next() : next;
  };
}

beforeEach(() => {
  calls = [];
  Object.assign(config, {
    otpChannel: 'whatsapp',
    whatsappAccessToken: 'token-123',
    whatsappPhoneNumberId: '1234567890',
    whatsappOtpTemplate: 'kimu_otp',
    whatsappTemplateLanguage: 'en_US',
    whatsappApiVersion: 'v24.0',
    smsProvider: '',
    smsApiKey: '',
    smsSenderName: 'KIMU',
    smtpHost: '',
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    localDatabase: false,
    devRevealCodes: false,
  });
  delete otp._internals.mailer;
});

test('sends the code as an authentication template to the WhatsApp Cloud API', async () => {
  otp._internals.fetch = fakeFetch([respond(200, { messages: [{ id: 'wamid.1' }] })]);
  const channel = await otp.sendOtp({ phone: '0788123456' }, { code: '482913', purpose: 'signup' });
  assert.equal(channel, 'whatsapp');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://graph.facebook.com/v24.0/1234567890/messages');
  assert.equal(calls[0].headers.Authorization, 'Bearer token-123');
  const body = calls[0].body;
  assert.equal(body.to, '+250788123456', 'E.164 with the plus sign, as Meta recommends');
  assert.equal(body.type, 'template');
  assert.equal(body.template.name, 'kimu_otp');
  assert.equal(body.template.language.code, 'en_US');
  assert.deepEqual(body.template.components[0], { type: 'body', parameters: [{ type: 'text', text: '482913' }] });
  assert.equal(body.template.components[1].sub_type, 'url');
  assert.equal(body.template.components[1].parameters[0].text, '482913');
});

test('falls back to the SMS provider when WhatsApp cannot deliver', async () => {
  Object.assign(config, { smsProvider: 'pindo', smsApiKey: 'pindo-key' });
  otp._internals.fetch = fakeFetch([
    respond(400, { error: { message: 'Recipient is not a valid WhatsApp user' } }),
    respond(200, {}),
  ]);
  const channel = await otp.sendOtp({ phone: '+250788123456' }, { code: '111222', purpose: 'reset' });
  assert.equal(channel, 'sms');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://api.pindo.io/v1/sms/');
  assert.equal(calls[1].body.to, '+250788123456');
  assert.match(calls[1].body.text, /password reset code is 111222/);
});

test('fails loudly when WhatsApp rejects the code and no SMS provider exists', async () => {
  otp._internals.fetch = fakeFetch([respond(500, { error: 'boom' })]);
  await assert.rejects(() => otp.sendOtp({ phone: '0788123456' }, { code: '999999', purpose: 'signup' }), /WhatsApp responded 500/);
});

test('with no WhatsApp configured, the code goes by SMS', async () => {
  Object.assign(config, { whatsappAccessToken: '', whatsappPhoneNumberId: '', smsProvider: 'generic', smsApiKey: 'k', smsGatewayUrl: 'https://sms.example.com/send' });
  otp._internals.fetch = fakeFetch([respond(200, {})]);
  const channel = await otp.sendOtp({ phone: '0788123456' }, { code: '123456', purpose: 'signup' });
  assert.equal(channel, 'sms');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://sms.example.com/send');
});

test('with only SMTP configured, the code is e-mailed', async () => {
  Object.assign(config, { whatsappAccessToken: '', whatsappPhoneNumberId: '', smtpHost: 'smtp.example.com', smtpUser: 'kimu@example.com', smtpPass: 'app-pass', smtpFrom: 'Kimu <kimu@example.com>' });
  const sent = [];
  otp._internals.mailer = { sendMail: async (msg) => { sent.push(msg); return { rejected: [] }; } };
  const channel = await otp.sendOtp({ email: 'rider@example.com' }, { code: '246802', purpose: 'signup' });
  assert.equal(channel, 'email');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'rider@example.com');
  assert.equal(sent[0].from, 'Kimu <kimu@example.com>');
  assert.match(sent[0].text, /246802/);
  assert.match(sent[0].subject, /246802/);
});

test('falls all the way through WhatsApp then SMS to e-mail', async () => {
  Object.assign(config, { smsProvider: 'pindo', smsApiKey: 'k', smtpHost: 'smtp.example.com', smtpUser: 'u', smtpPass: 'p', smtpFrom: 'u@example.com' });
  // WhatsApp 500, then Pindo 500, then e-mail succeeds.
  otp._internals.fetch = fakeFetch([respond(500, { error: 'x' }), respond(500, { error: 'y' })]);
  const sent = [];
  otp._internals.mailer = { sendMail: async (msg) => { sent.push(msg); return { rejected: [] }; } };
  const channel = await otp.sendOtp({ phone: '0788123456', email: 'rider@example.com' }, { code: '777777', purpose: 'signup' });
  assert.equal(channel, 'email');
  assert.equal(calls.length, 2, 'WhatsApp and SMS were both tried first');
  assert.equal(sent.length, 1);
});

test('reports which channels are ready, in fallback order', () => {
  Object.assign(config, { smsProvider: 'pindo', smsApiKey: 'k', smtpHost: 'smtp.example.com', smtpUser: 'u', smtpPass: 'p' });
  const status = otp.otpStatus();
  assert.equal(status.channel, 'whatsapp');
  assert.deepEqual(status.order, ['whatsapp', 'sms', 'email']);
  assert.equal(status.ready, true);
  assert.equal(status.email.configured, true);
});
