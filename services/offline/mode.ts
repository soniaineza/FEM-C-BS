// Build-time switch for the standalone APK. Metro inlines EXPO_PUBLIC_* values
// only for a literal `process.env.EXPO_PUBLIC_NAME` read (no destructuring, no
// bracket access), so this must stay written exactly like this.
//
// When '1', the API clients never touch the network: every request is
// answered by the on-device backend in services/offline/ (state kept in the
// phone's AsyncStorage). Server-backed builds leave it unset and are unchanged.
export const OFFLINE_DEMO = process.env.EXPO_PUBLIC_OFFLINE_DEMO === '1';
