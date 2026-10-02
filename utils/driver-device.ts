import AsyncStorage from '@react-native-async-storage/async-storage';

// Device-scoped helpers for the driver app's "Utwara : [ID]" terminal
// identity, the E-Bill phone number, and locally-registered card details.
// These persist per install (AsyncStorage), not per driver, mirroring how the
// physical YegoCabs terminal is bound to hardware rather than an account.

const TERMINAL_KEY = 'kimu_driver_terminal_id';
const EBILL_KEY = 'kimu_driver_ebill_phone';
const CARD_KEY = 'kimu_driver_card';

let terminalCache: string | null = null;

function randomTerminalId(length = 5): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function getTerminalId(): Promise<string> {
  if (terminalCache) return terminalCache;
  try {
    const stored = await AsyncStorage.getItem(TERMINAL_KEY);
    if (stored) {
      terminalCache = stored;
      return stored;
    }
  } catch {
    // fall through to generating a fresh id
  }
  const fresh = randomTerminalId();
  terminalCache = fresh;
  try {
    await AsyncStorage.setItem(TERMINAL_KEY, fresh);
  } catch {
    // best-effort persist; the in-memory id still works this session
  }
  return fresh;
}

export async function getEbillingPhone(): Promise<string | null> {
  return AsyncStorage.getItem(EBILL_KEY);
}

export async function saveEbillingPhone(phone: string): Promise<void> {
  await AsyncStorage.setItem(EBILL_KEY, phone);
}

export interface RegisteredCard {
  last4: string;
  name: string;
  expiry: string;
}

export async function getRegisteredCard(): Promise<RegisteredCard | null> {
  const raw = await AsyncStorage.getItem(CARD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RegisteredCard;
  } catch {
    return null;
  }
}

export async function saveRegisteredCard(card: RegisteredCard): Promise<void> {
  await AsyncStorage.setItem(CARD_KEY, JSON.stringify(card));
}