import * as SecureStore from 'expo-secure-store';

// A JWT + passenger id are real auth credentials, so on native they live in
// the iOS Keychain / Android Keystore via expo-secure-store rather than
// plain AsyncStorage.
const TOKEN_KEY = 'auth_token';
const PASSENGER_ID_KEY = 'auth_passenger_id';

// "Remember me" unticked: the session lives only in memory and is gone when
// the app is closed.
const memory: { token: string | null; passengerId: string | null } = { token: null, passengerId: null };

export async function getToken(): Promise<string | null> {
  return memory.token ?? SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string, persist = true): Promise<void> {
  memory.token = persist ? null : token;
  if (persist) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getPassengerId(): Promise<string | null> {
  return memory.passengerId ?? SecureStore.getItemAsync(PASSENGER_ID_KEY);
}

export async function setPassengerId(id: string, persist = true): Promise<void> {
  memory.passengerId = persist ? null : id;
  if (persist) await SecureStore.setItemAsync(PASSENGER_ID_KEY, id);
  else await SecureStore.deleteItemAsync(PASSENGER_ID_KEY);
}

export async function clearSession(): Promise<void> {
  memory.token = null;
  memory.passengerId = null;
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(PASSENGER_ID_KEY),
  ]);
}
