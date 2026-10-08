import AsyncStorage from '@react-native-async-storage/async-storage';

// The driver's session. Kept under its own keys (distinct from the rider
// app's storage/session.ts) so the two can never be confused.
const TOKEN_KEY = 'driver_auth_token';
const DRIVER_ID_KEY = 'driver_auth_driver_id';

export async function getDriverToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setDriverToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getDriverId(): Promise<string | null> {
  return AsyncStorage.getItem(DRIVER_ID_KEY);
}

export async function setDriverId(id: string): Promise<void> {
  await AsyncStorage.setItem(DRIVER_ID_KEY, id);
}

export async function clearDriverSession(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, DRIVER_ID_KEY]);
}
