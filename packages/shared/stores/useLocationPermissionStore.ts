import { create } from 'zustand';
import * as Location from 'expo-location';
export interface LocationPermissionSnapshot {
  status: Location.PermissionStatus | null;
  canAskAgain: boolean;
  servicesEnabled: boolean;
}

interface LocationPermissionState extends LocationPermissionSnapshot {
  isRequesting: boolean;
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
