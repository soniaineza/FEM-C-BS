import AsyncStorage from '@react-native-async-storage/async-storage';

// expo-secure-store has no web implementation. Since the web export is this
// app's initial deployment target, browser storage (via AsyncStorage's web
// shim, backed by localStorage) is the realistic ceiling for a client-side
// token here anyway.
const TOKEN_KEY = 'auth_token';
const PASSENGER_ID_KEY = 'auth_passenger_id';

// "Remember me" unticked: the session lives only in memory and is gone when
// the app is closed. See session.native.ts for the same logic on phones.
const memory: { token: string | null; passengerId: string | null } = { token: null, passengerId: null };

export async function getToken(): Promise<string | null> {
  return memory.token ?? AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string, persist = true): Promise<void> {
  memory.token = persist ? null : token;
  if (persist) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getPassengerId(): Promise<string | null> {
  return memory.passengerId ?? AsyncStorage.getItem(PASSENGER_ID_KEY);
}

export async function setPassengerId(id: string, persist = true): Promise<void> {
  memory.passengerId = persist ? null : id;
  if (persist) await AsyncStorage.setItem(PASSENGER_ID_KEY, id);
  else await AsyncStorage.removeItem(PASSENGER_ID_KEY);
}

export async function clearSession(): Promise<void> {
  memory.token = null;
  memory.passengerId = null;
  await AsyncStorage.multiRemove([TOKEN_KEY, PASSENGER_ID_KEY]);
}
