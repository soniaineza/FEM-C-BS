import { useCallback } from 'react';
import { Platform, Linking } from 'react-native';
import * as Location from 'expo-location';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { appAlert } from '@kimu/shared/utils/dialog';
import { useLocationPermissionStore } from '@kimu/shared/stores/useLocationPermissionStore';

// One permission conversation at a time, app-wide. Everything below is
// module-level on purpose: several screens mount this hook simultaneously and
// without this guard each one opened its own Alert on top of the others.
let flowInFlight: Promise<boolean> | null = null;
// The "go to Settings" alert is shown at most once per launch — it is the
// nagging kind, and manual pickup entry works without the permission anyway.
let blockedAlertShown = false;
// An automatic ask happens once per launch. Without this, the Home screen's
// focus effect re-opened the pre-prompt every time the rider came back to the
// tab after choosing "Not now". Explicit taps (the recentre button, "use my
// location") pass interactive: true and always ask again — the rider just said
// that is what they want.
let autoAskedThisSession = false;
// Same reasoning for the device-level "location is off" alert: once per launch
// unless the rider explicitly asks for their location again.
let servicesAlertShown = false;

export function useLocationPermission() {
  const { t } = useTranslation();

  const permissionStatus = useLocationPermissionStore((s) => s.status);
  const locationServicesEnabled = useLocationPermissionStore((s) => s.servicesEnabled);
  const canAskAgain = useLocationPermissionStore((s) => s.canAskAgain);
  const isRequesting = useLocationPermissionStore((s) => s.isRequesting);
  const refresh = useLocationPermissionStore((s) => s.refresh);
  const request = useLocationPermissionStore((s) => s.request);

  const checkPermission = useCallback(async () => (await refresh()).status, [refresh]);

  const checkLocationServices = useCallback(
    async () => (await refresh()).servicesEnabled,
    [refresh]
  );

  const requestPermission = useCallback(async () => (await request()).status, [request]);

  const openSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:').catch(() => {});
    } else {
      Linking.openSettings().catch(() => {});
    }
  }, []);

  const ensureInitialized = useCallback(async () => {
    if (useLocationPermissionStore.getState().status !== null) return;
    await refresh();
  }, [refresh]);

  // Ask the user, for real.
  //
  // The previous version showed the pre-prompt and then re-read the status
  // instead of requesting, so on a fresh install it fell through to the
  // "permission denied, open Settings" alert without the OS dialog ever
  // appearing — the app looked like it refused to ask. The request call is now
  // on the undetermined path where it belongs, and the three outcomes
  // (undetermined / denied-but-askable / permanently blocked) are handled
  // separately.
  // `interactive: true` marks a request the rider asked for by tapping
  // something, which is allowed to re-prompt after an earlier "Not now".
  const ensurePermission = useCallback(
    async (options?: { interactive?: boolean }): Promise<boolean> => {
      if (flowInFlight) return flowInFlight;
      flowInFlight = runPermissionFlow({
        t,
        refresh,
        request,
        openSettings,
        interactive: options?.interactive ?? false,
      });
      try {
        return await flowInFlight;
      } finally {
        flowInFlight = null;
      }
    },
    [t, refresh, request, openSettings]
  );

  return {
    permissionStatus,
    locationServicesEnabled,
    canAskAgain,
    isRequesting,
    isGranted: permissionStatus === Location.PermissionStatus.GRANTED,
    checkPermission,
    checkLocationServices,
    requestPermission,
    ensurePermission,
    ensureInitialized,
    openSettings,
  };
}

interface FlowDeps {
  t: (key: any, params?: Record<string, string | number>) => string;
  refresh: () => Promise<{
    status: Location.PermissionStatus | null;
    canAskAgain: boolean;
    servicesEnabled: boolean;
  }>;
  request: () => Promise<{ status: Location.PermissionStatus | null; canAskAgain: boolean }>;
  openSettings: () => void;
  interactive: boolean;
}

async function runPermissionFlow({
  t,
  refresh,
  request,
  openSettings,
  interactive,
}: FlowDeps): Promise<boolean> {
  let snapshot = await refresh();

  // Already granted — nothing to ask.
  if (snapshot.status === Location.PermissionStatus.GRANTED) {
    autoAskedThisSession = true;
    // Device-level location can still be switched off while the app keeps its
    // permission, which is the state that silently breaks GPS reads.
    if (!snapshot.servicesEnabled && !(await tryEnableServices())) {
      promptForServices(t, openSettings, interactive);
      return false;
    }
    return true;
  }

  // Location turned off device-wide: no point asking for the app permission
  // first, the read would fail either way.
  if (!snapshot.servicesEnabled && !(await tryEnableServices())) {
    promptForServices(t, openSettings, interactive);
    return false;
  }

  if (snapshot.status === Location.PermissionStatus.UNDETERMINED) {
    // Already asked automatically once and the rider said no — stay quiet until
    // they ask for their location themselves.
    if (autoAskedThisSession && !interactive) return false;
    autoAskedThisSession = true;

    // Explain before the OS dialog: the system prompt is a bare Allow/Deny
    // with no context, and a denial here is effectively permanent.
    const proceed = await confirm(t('locationPrePromptTitle'), t('locationPrePromptBody'), {
      cancel: t('notNow'),
      confirm: t('continueLabel'),
    });
    // "Not now" is a deliberate choice, not a failure — no scolding alert.
    if (!proceed) return false;

    snapshot = { ...snapshot, ...(await request()) };
    if (snapshot.status === Location.PermissionStatus.GRANTED) return true;
    // Declined the OS dialog just now; they know what they chose.
    return false;
  }

  if (snapshot.status === Location.PermissionStatus.DENIED) {
    // Dismissed previously but the OS will still ask: ask again rather than
    // sending them to Settings for something a tap can fix. Still only once
    // automatically, so returning to Home does not re-open the OS dialog.
    if (snapshot.canAskAgain) {
      if (autoAskedThisSession && !interactive) return false;
      autoAskedThisSession = true;
      snapshot = { ...snapshot, ...(await request()) };
      if (snapshot.status === Location.PermissionStatus.GRANTED) return true;
      return false;
    }

    // Permanently blocked — Settings is genuinely the only route. Manual
    // pickup entry keeps working, so this is informational, shown once.
    if (!blockedAlertShown) {
      blockedAlertShown = true;
      appAlert(t('locationPermissionDeniedTitle'), t('locationPermissionDeniedMessage'), [
        { text: t('openSettings'), onPress: openSettings },
        { text: t('cancel'), style: 'cancel' },
      ]);
    }
    return false;
  }

  return false;
}

// Android can offer to switch location on without leaving the app. iOS has no
// equivalent, and a rejection here is normal, so failure is not an error.
async function tryEnableServices(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await Location.enableNetworkProviderAsync();
    return await Location.hasServicesEnabledAsync();
  } catch {
    return false;
  }
}

function promptForServices(t: FlowDeps['t'], openSettings: () => void, interactive: boolean) {
  if (servicesAlertShown && !interactive) return;
  servicesAlertShown = true;
  appAlert(t('locationServicesOffTitle'), t('locationServicesOffMessage'), [
    { text: t('openSettings'), onPress: openSettings },
    { text: t('cancel'), style: 'cancel' },
  ]);
}

function confirm(
  title: string,
  message: string,
  labels: { cancel: string; confirm: string }
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const once = (value: boolean) => () => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    appAlert(
      title,
      message,
      [
        { text: labels.cancel, style: 'cancel', onPress: once(false) },
        { text: labels.confirm, onPress: once(true) },
      ],
      { cancelable: false, onDismiss: once(false) }
    );
  });
}
