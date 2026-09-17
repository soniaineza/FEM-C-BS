import * as SecureStore from 'expo-secure-store';

// A JWT + passenger id are real auth credentials, so on native they live in
// the iOS Keychain / Android Keystore via expo-secure-store rather than
// plain AsyncStorage.
const TOKEN_KEY = 'auth_token';
const PASSENGER_ID_KEY = 'auth_passenger_id';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getPassengerId(): Promise<string | null> {
  return SecureStore.getItemAsync(PASSENGER_ID_KEY);
}

export async function setPassengerId(id: string): Promise<void> {
  await SecureStore.setItemAsync(PASSENGER_ID_KEY, id);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(PASSENGER_ID_KEY),
  ]);
}
