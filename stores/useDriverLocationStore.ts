import { create } from 'zustand';

export interface DriverFix {
  latitude: number;
  longitude: number;
  heading?: number | null;
}

// The driver's latest GPS fix, published by hooks/useDriverLocationReporting.ts
// so any screen (the journey map) can draw the driver without opening a
// second location subscription.
export const useDriverLocationStore = create<{ fix: DriverFix | null; setFix: (fix: DriverFix) => void }>((set) => ({
  fix: null,
  setFix: (fix) => set({ fix }),
}));
