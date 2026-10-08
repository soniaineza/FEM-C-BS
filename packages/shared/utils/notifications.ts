import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// Must match ANDROID_CHANNEL_ID in server/src/services/expoPush.js.
const RIDES_CHANNEL_ID = 'rides';

// Show ride pushes as a banner even while the app is open; without a handler
// expo-notifications drops foreground notifications silently.
export function configureNotificationHandler() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Asks for notification permission and returns this device's Expo push
// token, or null when permission is denied or no token can be issued (web,
// Expo Go on Android, a build without FCM credentials). Never throws — push
// must not block the app.
export async function getPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    // Android 13+ only shows the permission prompt once a channel exists.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(RIDES_CHANNEL_ID, {
        name: 'Rides',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return data;
  } catch {
    return null;
  }
}
