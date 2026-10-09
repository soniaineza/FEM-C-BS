#!/usr/bin/env node
// Sends one real verification code through the channel this server is
// configured with (WhatsApp first, SMS as fallback) and prints what happened.
// The quickest way to prove the WhatsApp setup works after setting
// WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID in server/.env:
//
//   cd server && npm run otp:send-test -- +2507XXXXXXXX
//
// (While the Meta app is in test mode, the number must be on the app's list
// of allowed test recipients, and the template must be approved.)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { otpStatus, sendTestCode } = require('../src/services/otpSender');

// Accepts a phone number (+2507…) or an e-mail address.
const target = process.argv[2];
if (!target) {
  console.error('usage: npm run otp:send-test -- +2507XXXXXXXX   (or an email address)');
  process.exit(2);
}
const isEmail = target.includes('@');

const status = otpStatus();
console.log(`channel order: ${status.order.join(' → ') || '(none)'}`);
console.log(`whatsapp: ${status.whatsapp.configured ? `configured (phone number ID ${status.whatsapp.phoneNumberId}, template ${status.whatsapp.template} / ${status.whatsapp.language}, ${status.whatsapp.apiVersion})` : 'not configured'}`);
console.log(`sms: ${status.sms.configured ? status.sms.provider : 'not configured'}`);
console.log(`email: ${status.email.configured ? `${status.email.host} (from ${status.email.from})` : 'not configured'}`);
if (!status.ready) {
  console.error('No delivery channel is configured. Set the WHATSAPP_*, SMS_* or SMTP_* variables in server/.env first.');
  process.exit(1);
}

sendTestCode(isEmail ? { email: target } : { phone: target })
  .then(({ channel, to }) => {
    console.log(channel === 'none' ? 'Nothing was sent.' : `Sent to ${to} through ${channel}. Check there for the code.`);
    process.exit(channel === 'none' ? 1 : 0);
  })
  .catch((err) => {
    console.error(`Not delivered: ${err.message}`);
    process.exit(1);
  });
