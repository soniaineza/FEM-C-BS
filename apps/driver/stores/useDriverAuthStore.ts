import { create } from 'zustand';
import * as driverAuthService from '../services/driver-auth-service';
import { DriverProfile } from '../types/driver';
interface DriverAuthState {
  currentDriver: DriverProfile | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  register: (params: { fullName: string; phone: string; password: string; licenseNumber?: string }) => Promise<void>;
  logIn: (params: { phone: string; password: string }) => Promise<DriverProfile>;
  updateProfile: (patch: Parameters<typeof driverAuthService.updateDriverProfile>[0]) => Promise<DriverProfile>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

export const useDriverAuthStore = create<DriverAuthState>((set, get) => ({
  currentDriver: null,
  isHydrated: false,

  hydrate: async () => {
    const driver = await driverAuthService.restoreDriverSession();
    set({ currentDriver: driver, isHydrated: true });
  },

  register: async (params) => {
    const driver = await driverAuthService.registerDriver(params);
    set({ currentDriver: driver });
  },

  logIn: async (params) => {
    const driver = await driverAuthService.driverLogIn(params);
    set({ currentDriver: driver });
    return driver;
  },

  updateProfile: async (patch) => {
    const updated = await driverAuthService.updateDriverProfile(patch);
    set({ currentDriver: updated });
    return updated;
  },

  refresh: async () => {
    const driver = await driverAuthService.restoreDriverSession();
    if (driver) set({ currentDriver: driver });
  },

  logout: async () => {
    await driverAuthService.driverLogout();
    set({ currentDriver: null });
  },

  deleteAccount: async () => {
    await driverAuthService.deleteDriverAccount();
    set({ currentDriver: null });
  },
}));
