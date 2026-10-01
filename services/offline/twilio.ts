// Twilio for the standalone build, in two parts:
//
//  - createTwilioVerifier: Twilio Verify. Twilio generates, texts and later
//    checks the OTP, so the app never holds the code and a correct entry is real
//    proof the person controls the phone. Used for sign-up and password reset.
//  - createTwilioSender: the Messages API, for free-text messages (ride
//    updates, SOS alerts).
//
// Both authenticate with HTTP Basic: API Key SID + secret, or Account SID +
// Auth Token.
//
// SECURITY: this runs inside the app, so the secret ships in the APK and can be
// extracted. Use a Restricted API key, and keep the Twilio account on trial
// while the APK is in circulation: a trial account can only text numbers you
// have verified, which caps what a stolen key can do. Twilio charges roughly
// $0.33 per SMS to Rwanda, so never ship a funded account's key.

import type { OtpCheck, OtpVerifier, SmsSender } from './sms';

const TIMEOUT_MS = 8_000;

export interface TwilioCredentials {
  accountSid: string; // AC...
  /** API Key SID (SK...). Omit when `secret` is the account Auth Token. */
  keySid?: string;
  /** API Key secret, or the account Auth Token when keySid is omitted. */
  secret: string;
}

function authorization(c: TwilioCredentials): string {
  return `Basic ${globalThis.btoa(`${c.keySid || c.accountSid}:${c.secret}`)}`;
}

/** POSTs a form and returns the HTTP status and parsed JSON body. Throws only on transport failure. */
async function postForm(c: TwilioCredentials, url: string, fields: Record<string, string>) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authorization(c), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body: body as any };
  } finally {
    clearTimeout(timer);
  }
}

const explain = (r: { status: number; body: any }) =>
  `Twilio responded ${r.status}${r.body?.code ? ` (${r.body.code}: ${r.body.message})` : ''}`;

// ------------------------------------------------------------------ Messages

export interface TwilioSenderOptions extends TwilioCredentials {
  /** A Twilio phone number (+1...), an alphanumeric sender, or a Messaging Service SID (MG...). */
  from: string;
}

export function createTwilioSender(options: TwilioSenderOptions): SmsSender {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${options.accountSid}/Messages.json`;
  const fromField = /^MG[0-9a-f]{32}$/i.test(options.from) ? 'MessagingServiceSid' : 'From';
  return {
    async send(to, text) {
      const res = await postForm(options, url, { To: to, Body: text, [fromField]: options.from });
      if (!res.ok) throw new Error(explain(res));
    },
  };
}

// ------------------------------------------------------------------- Verify

export interface TwilioVerifierOptions extends TwilioCredentials {
  /** Verify Service SID (VA...), created in the Twilio console under Verify. */
  verifyServiceSid: string;
}

export function createTwilioVerifier(options: TwilioVerifierOptions): OtpVerifier {
  const base = `https://verify.twilio.com/v2/Services/${options.verifyServiceSid}`;
  return {
    async start(to) {
      const res = await postForm(options, `${base}/Verifications`, { To: to, Channel: 'sms' });
      if (!res.ok) throw new Error(explain(res));
    },

    async check(to, code): Promise<OtpCheck> {
      let res;
      try {
        res = await postForm(options, `${base}/VerificationCheck`, { To: to, Code: code });
      } catch {
        return 'unavailable'; // no signal / timeout: cannot tell right from wrong
      }
      if (res.ok) return res.body?.status === 'approved' ? 'approved' : 'rejected';
      // 404: no pending verification (expired or already used); 429: too many attempts.
      if (res.status === 404 || res.status === 429 || res.status === 400) return 'rejected';
      return 'unavailable'; // 401/403 (bad credentials), 5xx
    },
  };
}
