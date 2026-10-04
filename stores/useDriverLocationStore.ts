import { create } from 'zustand';

export interface DriverFix {
  latitude: number;
  longitude: number;
  heading?: number | null;
}

// The driver's latest GPS fix, published by hooks/useDriverLocationReporting.ts
// so any screen (the journey map) can draw the driver without opening a
// second location subscription.
//
// In the standalone demo build the fix can instead come from a simulated
// drive (hooks/useDemoDriverDrive.ts). Once that has taken over, real GPS
// fixes no longer move the car: a tester sitting still would otherwise see it
// jump back to where they are after every simulated trip.
interface DriverLocationState {
  fix: DriverFix | null;
  simulated: boolean;
  setFix: (fix: DriverFix) => void;
  setSimulatedFix: (fix: DriverFix) => void;
}

export const useDriverLocationStore = create<DriverLocationState>((set, get) => ({
  fix: null,
  simulated: false,
  setFix: (fix) => {
    if (!get().simulated) set({ fix });
  },
  setSimulatedFix: (fix) => set({ fix, simulated: true }),
}));
