// Pindo (https://pindo.io, the Rwandan SMS gateway) as an SmsSender. Same
// request the server's otpSender.js makes: POST /v1/sms/ with a bearer token.
//
// SECURITY: this runs inside the app, so the token is part of the shipped
// bundle and can be extracted from the APK by anyone who has it. Use a
// dedicated, low-balance Pindo token for builds you hand out, never the
// production one; a public release should send SMS from a server instead.

import type { SmsSender } from './sms';

const PINDO_URL = 'https://api.pindo.io/v1/sms/';
const TIMEOUT_MS = 8_000;

export function createPindoSender(options: { token: string; senderName: string }): SmsSender {
  return {
    async send(to, text) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(PINDO_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.token}` },
          body: JSON.stringify({ to, text, sender: options.senderName }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Pindo responded ${res.status}`);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
