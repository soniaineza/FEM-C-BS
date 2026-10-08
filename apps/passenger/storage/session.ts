import AsyncStorage from '@react-native-async-storage/async-storage';

// expo-secure-store has no web implementation. Since the web export is this
// app's initial deployment target, browser storage (via AsyncStorage's web
// shim, backed by localStorage) is the realistic ceiling for a client-side
// token here anyway.
const TOKEN_KEY = 'auth_token';
const PASSENGER_ID_KEY = 'auth_passenger_id';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getPassengerId(): Promise<string | null> {
  return AsyncStorage.getItem(PASSENGER_ID_KEY);
}

export async function setPassengerId(id: string): Promise<void> {
  await AsyncStorage.setItem(PASSENGER_ID_KEY, id);
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, PASSENGER_ID_KEY]);
}
