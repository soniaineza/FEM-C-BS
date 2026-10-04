// Text messages sent straight from the phone to other phones (OTP codes, ride
// updates, SOS alerts). The on-device backend never depends on this: with no
// sender installed, or when delivery fails (no signal, provider error), every
// caller falls back to its on-screen behaviour, so the app still works with
// no connectivity at all. No React Native imports.

export interface SmsSender {
  /** Sends `text` to an E.164 number; throws when it could not be delivered. */
  send(toE164: string, text: string): Promise<void>;
}

/** Outcome of checking a code with a verification service. */
export type OtpCheck = 'approved' | 'rejected' | 'unavailable';

/**
 * A hosted OTP service (Twilio Verify): the provider generates, texts and
 * checks the code, so the app never holds it. Optional; without it the app
 * issues codes itself.
 */
export interface OtpVerifier {
  /** Texts a fresh code to an E.164 number; throws when it could not be sent. */
  start(toE164: string): Promise<void>;
  check(toE164: string, code: string): Promise<OtpCheck>;
}

/** What a text may be about; each can be switched off at build time. */
export type SmsEvent = 'otp' | 'sos' | 'ride';

let sender: SmsSender | null = null;
let verifier: OtpVerifier | null = null;
let enabled = new Set<SmsEvent>(['otp', 'sos', 'ride']);
let sentAt: number[] = [];

/** A runaway loop or a bug must not drain the SMS balance: hard cap per hour. */
const MAX_PER_HOUR = 30;

export function setSmsSender(next: SmsSender | null, events?: SmsEvent[]): void {
  sender = next;
  verifier = null;
  sentAt = [];
  if (events) enabled = new Set(events);
}

export function setOtpVerifier(next: OtpVerifier | null): void {
  verifier = next;
}

export function smsEnabled(event: SmsEvent): boolean {
  return sender != null && enabled.has(event);
}

/** True when a hosted OTP service is installed and OTP messages are switched on. */
export function verifyEnabled(): boolean {
  return verifier != null && enabled.has('otp');
}

function underHourlyCap(): boolean {
  const now = Date.now();
  sentAt = sentAt.filter((t) => now - t < 60 * 60 * 1000);
  if (sentAt.length >= MAX_PER_HOUR) return false;
  sentAt.push(now);
  return true;
}

/** Starts a hosted verification. True only when the provider accepted it; never throws. */
export async function startVerification(phone: string | null | undefined): Promise<boolean> {
  if (!verifyEnabled() || !phone || !verifier || !underHourlyCap()) return false;
  try {
    await verifier.start(toE164(phone));
    return true;
  } catch {
    return false;
  }
}

/** Checks a code with the hosted service; 'unavailable' when it can't be reached. Never throws. */
export async function checkVerification(phone: string, code: string): Promise<OtpCheck> {
  if (!verifier) return 'unavailable';
  try {
    return await verifier.check(toE164(phone), code);
  } catch {
    return 'unavailable';
  }
}

/** Rwandan numbers in any local spelling -> +2507XXXXXXXX (same rules as the server). */
export function toE164(phone: string): string {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('250')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+250${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('7')) return `+250${digits}`;
  return `+${digits}`;
}

/**
 * Sends a text. Resolves true only when the provider accepted it; never
 * throws, so callers can simply fall back when it returns false.
 */
export async function sendSms(event: SmsEvent, phone: string | null | undefined, text: string): Promise<boolean> {
  if (!smsEnabled(event) || !phone || !sender || !underHourlyCap()) return false;
  try {
    await sender.send(toE164(phone), text);
    return true;
  } catch {
    return false;
  }
}

export const SMS_BRAND = 'Kimu';
