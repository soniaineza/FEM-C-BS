import AsyncStorage from '@react-native-async-storage/async-storage';

// The driver's session. Kept under its own keys (distinct from the rider
// app's storage/session.ts) so the two can never be confused.
const TOKEN_KEY = 'driver_auth_token';
const DRIVER_ID_KEY = 'driver_auth_driver_id';
// The last profile the server sent (its JSON as-is), so the app can open on
// a phone with no connection, or while the API is cold-starting, without
// throwing the session away.
const PROFILE_KEY = 'driver_auth_profile';

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

export async function getCachedDriverProfile(): Promise<unknown | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setCachedDriverProfile(profileJson: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profileJson));
  } catch {
    // A cache miss only costs an extra sign-in; never fail the request for it.
  }
}

export async function clearDriverSession(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, DRIVER_ID_KEY, PROFILE_KEY]);
}
