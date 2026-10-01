// Phone-side hooks for the standalone build: real OS notifications for ride
// milestones (they fire even when the app is closed) and saving the on-device
// database as the app leaves the foreground. Kept apart from the backend core
// so that stays free of React Native imports.

import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { setAlertSink } from './alerts';
import { flushDb } from './db';
import { OFFLINE_DEMO } from './mode';
import { createPindoSender } from './pindo';
import { setRoutingService } from './roads';
import { setOtpVerifier, setSmsSender, type SmsEvent, type SmsSender } from './sms';
import { createTwilioSender, createTwilioVerifier } from './twilio';

let installed = false;

async function allowed(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return current.status === 'granted';
}

/** Asks for notification permission (Android 13+ / iOS). Safe to call repeatedly. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (await allowed()) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.status === 'granted';
  } catch {
    return false;
  }
}

// Texting is opt-in per build. These are literal reads so Metro can inline them;
// the credentials end up inside the APK (see pindo.ts / twilio.ts), so use
// low-risk ones and never commit them.
//
//  - OTP codes: Twilio Verify when EXPO_PUBLIC_TWILIO_VERIFY_SID is set,
//    otherwise a code the app issues and texts through whichever sender exists.
//  - Ride updates and SOS: Pindo (cheap to Rwanda) or Twilio Messages
//    (needs EXPO_PUBLIC_TWILIO_FROM); EXPO_PUBLIC_SMS_PROVIDER=twilio|pindo
//    chooses when both are configured.
// With nothing configured, codes are shown on screen and nothing is texted.
function installSms(): void {
  const pindoToken = process.env.EXPO_PUBLIC_PINDO_TOKEN;
  const pindo = pindoToken
    ? createPindoSender({ token: pindoToken, senderName: process.env.EXPO_PUBLIC_PINDO_SENDER || 'FEM CABS' })
    : null;

  const accountSid = process.env.EXPO_PUBLIC_TWILIO_ACCOUNT_SID;
  const secret = process.env.EXPO_PUBLIC_TWILIO_SECRET;
  const credentials = accountSid && secret ? { accountSid, secret, keySid: process.env.EXPO_PUBLIC_TWILIO_API_KEY_SID } : null;
  const from = process.env.EXPO_PUBLIC_TWILIO_FROM;
  const verifySid = process.env.EXPO_PUBLIC_TWILIO_VERIFY_SID;
  const twilio: SmsSender | null = credentials && from ? createTwilioSender({ ...credentials, from }) : null;
  const verifier = credentials && verifySid ? createTwilioVerifier({ ...credentials, verifyServiceSid: verifySid }) : null;
  if (!pindo && !twilio && !verifier) return;

  const wanted = (process.env.EXPO_PUBLIC_SMS_EVENTS || process.env.EXPO_PUBLIC_PINDO_SMS_EVENTS || 'otp,sos,ride')
    .split(',')
    .map((e) => e.trim());
  const events = (['otp', 'sos', 'ride'] as SmsEvent[]).filter((e) => wanted.includes(e));
  const sender = pindo && twilio ? (process.env.EXPO_PUBLIC_SMS_PROVIDER === 'twilio' ? twilio : pindo) : (pindo ?? twilio);
  setSmsSender(sender, events); // resets the verifier, so install it second
  setOtpVerifier(verifier);
}

// Real street routes when the phone is online. Defaults to the public OSRM demo
// (free, no key, light use only); EXPO_PUBLIC_OSRM_URL points at your own OSRM,
// and 'off' keeps every route a local curve.
const PUBLIC_OSRM = 'https://router.project-osrm.org/route/v1/driving';
function installRouting(): void {
  const configured = process.env.EXPO_PUBLIC_OSRM_URL;
  if (configured === 'off') return setRoutingService(null);
  setRoutingService(configured || PUBLIC_OSRM);
}

/** One-time setup; a no-op outside the offline build. */
export function installOfflineDevice(): void {
  if (!OFFLINE_DEMO || installed) return;
  installed = true;
  installRouting();
  installSms();
  if (Platform.OS === 'web') return;

  // While the app is open the screens already show ride progress, so OS
  // banners are only for when it is in the background.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: AppState.currentState !== 'active',
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  setAlertSink({
    async schedule(fireAtMs, title, body) {
      if (!(await allowed())) return null;
      const seconds = Math.max(1, Math.round((fireAtMs - Date.now()) / 1000));
      return Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
      });
    },
    async cancel(ids) {
      await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    },
  });

  AppState.addEventListener('change', (state) => {
    if (state !== 'active') void flushDb();
  });
}
