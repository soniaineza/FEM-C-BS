import { create } from 'zustand';
import * as Location from 'expo-location';

// Shared, app-wide location permission state.
//
// Why a store and not plain useState inside the hook: useLocationPermission()
// is mounted from several places at once (the (main) layout on app start, the
// Home screen, PlacePicker). With per-instance useState each copy kept its own
// status and each fired its own request, so Android received concurrent
// requestForegroundPermissionsAsync() calls and the user saw stacked Alerts.
// One store means one status and one decision for the whole app.

export interface LocationPermissionSnapshot {
  status: Location.PermissionStatus | null;
  // false once the OS will no longer show the dialog ("Don't ask again" /
  // iOS second denial) — the only case where sending the user to Settings is
  // the correct next step rather than just asking again.
  canAskAgain: boolean;
  servicesEnabled: boolean;
}

interface LocationPermissionState extends LocationPermissionSnapshot {
  isRequesting: boolean;
  // True once the automatic app-start flow has run, so it runs exactly once
  // per app launch however many screens mount the hook.
  hasRunStartupFlow: boolean;
  markStartupFlowRun: () => void;
  refresh: () => Promise<LocationPermissionSnapshot>;
  request: () => Promise<LocationPermissionSnapshot>;
}

export const useLocationPermissionStore = create<LocationPermissionState>((set, get) => ({
  status: null,
  canAskAgain: true,
  servicesEnabled: true,
  isRequesting: false,
  hasRunStartupFlow: false,

  markStartupFlowRun: () => set({ hasRunStartupFlow: true }),

  refresh: async () => {
    const [servicesEnabled, permission] = await Promise.all([
      Location.hasServicesEnabledAsync(),
      Location.getForegroundPermissionsAsync(),
    ]);
    const snapshot: LocationPermissionSnapshot = {
      status: permission.status,
      canAskAgain: permission.canAskAgain,
      servicesEnabled,
    };
    set(snapshot);
    return snapshot;
  },

  // Serialised: a second caller awaits the first native dialog instead of
  // opening a competing one. Uses the injected get() rather than the exported
  // hook so the store's type does not reference itself while being inferred.
  request: async () => {
    if (get().isRequesting) {
      await waitWhile(() => get().isRequesting);
      const s = get();
      return { status: s.status, canAskAgain: s.canAskAgain, servicesEnabled: s.servicesEnabled };
    }

    set({ isRequesting: true });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      const snapshot: LocationPermissionSnapshot = {
        status: permission.status,
        canAskAgain: permission.canAskAgain,
        servicesEnabled: get().servicesEnabled,
      };
      set(snapshot);
      return snapshot;
    } finally {
      set({ isRequesting: false });
    }
  },
}));

function waitWhile(predicate: () => boolean, intervalMs = 60, timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (!predicate() || Date.now() - startedAt > timeoutMs) {
        resolve();
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}
