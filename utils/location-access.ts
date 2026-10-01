import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

import { appAlert } from './dialog';

export type LocationAccess = 'granted' | 'denied' | 'services-off';

type T = (key: any, params?: Record<string, string | number>) => string;

function openSettings() {
  if (Platform.OS === 'ios') Linking.openURL('app-settings:').catch(() => {});
  else Linking.openSettings().catch(() => {});
}

// One prompt at a time: the root layout, home and the place picker can all ask
// for location around the same moment, and stacked dialogs were the reason the
// rider could get stuck unable to approve it.
let inflight: Promise<LocationAccess> | null = null;

/** Shows a dialog and resolves once the rider has chosen. */
function ask(title: string, message: string, actions: { text: string; onPress?: () => void; cancel?: boolean }[]): Promise<void> {
  return new Promise((resolve) => {
    appAlert(
      title,
      message,
      actions.map((a) => ({
        text: a.text,
        style: a.cancel ? ('cancel' as const) : ('default' as const),
        onPress: () => {
          a.onPress?.();
          resolve();
        },
      }))
    );
  });
}

/**
 * Makes sure the app can read the device location, walking the rider through
 * the approval: a plain-language "why" before the system prompt, the system
 * prompt itself, and — when location services are off or permission is
 * blocked — a dialog that opens Settings. `interactive` is true when the rider
 * asked for their location (locate button, pickup screen); the denial dialogs
 * only appear then so that the app never nags on launch.
 */
export function ensureLocationAccess(t: T, { interactive = false }: { interactive?: boolean } = {}): Promise<LocationAccess> {
  if (!inflight) {
    inflight = run(t, interactive).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function run(t: T, interactive: boolean): Promise<LocationAccess> {
  if (!(await Location.hasServicesEnabledAsync().catch(() => true))) {
    if (interactive) {
      await ask(t('locationServicesOffTitle'), `${t('locationServicesOffMessage')}\n\n${t('locationManualHint')}`, [
        { text: t('notNow'), cancel: true },
        { text: t('openSettings'), onPress: openSettings },
      ]);
    }
    return 'services-off';
  }

  let perm = await Location.getForegroundPermissionsAsync();
  if (perm.status === Location.PermissionStatus.GRANTED) return 'granted';

  if (perm.canAskAgain) {
    // Explain first, then hand over to the system prompt.
    let proceed = true;
    if (perm.status === Location.PermissionStatus.UNDETERMINED) {
      proceed = false;
      await ask(t('locationPrePromptTitle'), t('locationPrePromptBody'), [
        { text: t('notNow'), cancel: true },
        { text: t('continueLabel'), onPress: () => (proceed = true) },
      ]);
    }
    if (proceed) {
      perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status === Location.PermissionStatus.GRANTED) return 'granted';
    }
  }

  if (interactive) {
    await ask(t('locationPermissionDeniedTitle'), `${t('locationPermissionDeniedMessage')}\n\n${t('locationManualHint')}`, [
      { text: t('notNow'), cancel: true },
      { text: t('openSettings'), onPress: openSettings },
    ]);
  }
  return 'denied';
}
