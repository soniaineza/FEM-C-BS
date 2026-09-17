import { create } from 'zustand';

import { Place } from '../types/place';
import { Vehicle } from '../types/vehicle';
import { PaymentMethod } from '../types/payment';
import { FareEstimate, RideType } from '../types/ride';

// Carries the in-progress ride request across the 7 wizard screens
// (pickup -> destination -> ride-type -> vehicle-selection -> fare-estimate
// -> payment-method -> confirm-ride). expo-router only supports string
// route params, unlike the old Dart Navigator's typed argument tuples, so
// this store is the replacement — each screen reads what it needs and
// writes its own field before navigating forward. reset() is called when
// entering pickup fresh from home, and after a successful requestRide().
interface RideWizardState {
  pickup: Place | null;
  destination: Place | null;
  rideType: RideType;
  vehicle: Vehicle | null;
  fareEstimate: FareEstimate | null;
  paymentMethod: PaymentMethod | null;
  note: string;
  setPickup: (p: Place) => void;
  setDestination: (p: Place) => void;
  setRideType: (t: RideType) => void;
  setVehicle: (v: Vehicle) => void;
  setFareEstimate: (e: FareEstimate) => void;
  setPaymentMethod: (m: PaymentMethod) => void;
  setNote: (n: string) => void;
  reset: () => void;
}

const initial = {
  pickup: null,
  destination: null,
  rideType: 'private' as RideType,
  vehicle: null,
  fareEstimate: null,
  paymentMethod: null,
  note: '',
};

export const useRideWizardStore = create<RideWizardState>((set) => ({
  ...initial,
  setPickup: (p) => set({ pickup: p }),
  setDestination: (p) => set({ destination: p }),
  setRideType: (t) => set({ rideType: t }),
  setVehicle: (v) => set({ vehicle: v }),
  setFareEstimate: (e) => set({ fareEstimate: e }),
  setPaymentMethod: (m) => set({ paymentMethod: m }),
  setNote: (n) => set({ note: n }),
  reset: () => set({ ...initial }),
}));
