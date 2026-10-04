import { create } from 'zustand';
import { clearRideSnapshots } from '../hooks/useRideTracking';
import { clearCachedPlace } from '../services/location-service';

import * as authService from '../services/auth-service';
import { OFFLINE_DEMO } from '../services/offline/mode';
import { useRideWizardStore } from './useRideWizardStore';
import { Passenger } from '../types/passenger';

interface AuthState {
  currentUser: Passenger | null;
  isHydrated: boolean;
  // Set right after signUp(), before the OTP is verified. currentUser stays
  // null until verifyOtp() succeeds, so the root layout's Stack.Protected
  // guard keeps the user in the (auth) group (on the verification screen)
  // instead of jumping straight to profile-setup the instant an account
  // exists but hasn't been verified yet.
  pendingPassenger: Passenger | null;
  // Demo-only: the OTP revealed by the server when DEV_REVEAL_CODES=1, so
  // testing never needs a real SMS.
  devCode: string | null;
  hydrate: () => Promise<void>;
  signUp: (params: { fullName: string; phone: string; email: string; password: string }) => Promise<void>;
  logIn: (params: { identifier: string; password: string }) => Promise<Passenger>;
  verifyOtp: (code: string) => Promise<void>;
  resendOtp: (purpose?: string) => Promise<void>;
  updateProfile: (passenger: Passenger) => Promise<Passenger>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

// Direct replacement for the Flutter app's authService.currentUser
// ValueNotifier<Passenger?> — the root layout's Stack.Protected guards read
// this to decide which route group is active.
export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isHydrated: false,
  pendingPassenger: null,
  devCode: null,

  hydrate: async () => {
    const passenger = await authService.restoreSession();
    set({ currentUser: passenger?.isVerified ? passenger : null,
      pendingPassenger: passenger && !passenger.isVerified ? passenger : null, isHydrated: true });
  },

  signUp: async (params) => {
    const { passenger, devCode } = await authService.signUp(params);
    set({ pendingPassenger: passenger, devCode: devCode ?? null });
    // Standalone build: the code is only ever shown on this same screen, so typing
    // it in proves nothing. Verify straight away and skip the code step. (With an
    // SMS provider configured there is no devCode, and the normal flow applies.)
    if (OFFLINE_DEMO && devCode) await get().verifyOtp(devCode);
  },

  logIn: async (params) => {
    const passenger = await authService.logIn(params);
    set({ currentUser: passenger.isVerified ? passenger : null,
      pendingPassenger: passenger.isVerified ? null : passenger });
    return passenger;
  },

  verifyOtp: async (code: string) => {
    const pending = get().pendingPassenger;
    if (!pending?.id) throw new Error('No pending signup to verify.');
    await authService.verifyOtp({ passengerId: pending.id, code });
    const verified = await authService.restoreSession();
    if (!verified?.isVerified) throw new Error('Verification could not be confirmed.');
    set({ currentUser: verified, pendingPassenger: null, devCode: null });
  },

  resendOtp: async (purpose = 'signup') => {
    const { devCode } = await authService.resendOtp(purpose);
    if (devCode) set({ devCode });
  },

  updateProfile: async (passenger: Passenger) => {
    const updated = await authService.updateProfile(passenger);
    set({ currentUser: updated.isVerified ? updated : null, pendingPassenger: updated.isVerified ? null : updated });
    return updated;
  },

  logout: async () => {
    await authService.logout();
    useRideWizardStore.getState().reset();
    clearRideSnapshots();
    clearCachedPlace();
    set({ currentUser: null, pendingPassenger: null });
  },

  deleteAccount: async () => {
    await authService.deleteAccount();
    useRideWizardStore.getState().reset();
    clearRideSnapshots();
    clearCachedPlace();
    set({ currentUser: null, pendingPassenger: null });
  },
}));
