import * as SecureStore from 'expo-secure-store';

// Native counterpart to driverSession.ts — see storage/session.native.ts for
// why native builds keep credentials in the Keychain/Keystore via
// expo-secure-store instead of plain AsyncStorage.
const TOKEN_KEY = 'driver_auth_token';
const DRIVER_ID_KEY = 'driver_auth_driver_id';

export async function getDriverToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setDriverToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getDriverId(): Promise<string | null> {
  return SecureStore.getItemAsync(DRIVER_ID_KEY);
}

export async function setDriverId(id: string): Promise<void> {
  await SecureStore.setItemAsync(DRIVER_ID_KEY, id);
}

export async function clearDriverSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(DRIVER_ID_KEY),
  ]);
}
