import { create } from 'zustand';

export interface DriverFix {
  latitude: number;
  longitude: number;
  /** Direction of travel in degrees, or null when the phone has none. */
  heading: number | null;
  /** Phone clock, ms. */
  recordedAt: number;
}

const TRAIL_SAMPLES = 8;

interface DriverPositionState {
  fix: DriverFix | null;
  /** The last few fixes, oldest first, so the map can animate between them. */
  trail: DriverFix[];
  setFix: (fix: DriverFix) => void;
}

// The driver's latest GPS fix, from whichever reporter is running (the
// background task or the foreground watcher), so screens such as the trip
// map can show where the driver is without opening a second GPS stream.
export const useDriverPositionStore = create<DriverPositionState>((set) => ({
  fix: null,
  trail: [],
  setFix: (fix) =>
    set((s) => ({
      fix,
      // Phone timestamps only move forward; a repeated or older one is dropped.
      trail: s.trail.length && fix.recordedAt <= s.trail[s.trail.length - 1].recordedAt
        ? s.trail
        : [...s.trail, fix].slice(-TRAIL_SAMPLES),
    })),
}));
