import { create } from 'zustand';

import { Place } from '@kimu/shared/types/place';
import { Vehicle } from '@kimu/shared/types/vehicle';
import { PaymentMethod } from '@kimu/shared/types/payment';
import { FareEstimate, RideType } from '@kimu/shared/types/ride';
interface RideWizardState {
  pickup: Place | null;
  destination: Place | null;
  rideType: RideType;
  /** Seats this booking takes on a shared ride (1 or 2). */
  seats: number;
  vehicle: Vehicle | null;
  fareEstimate: FareEstimate | null;
  paymentMethod: PaymentMethod | null;
  paymentPhone: string;
  note: string;
  setPickup: (p: Place) => void;
  setDestination: (p: Place) => void;
  setRideType: (t: RideType) => void;
  setSeats: (n: number) => void;
  setVehicle: (v: Vehicle) => void;
  setFareEstimate: (e: FareEstimate) => void;
  setPaymentMethod: (m: PaymentMethod) => void;
  setPaymentPhone: (p: string) => void;
  setNote: (n: string) => void;
  reset: () => void;
}

const initial = {
  pickup: null,
  destination: null,
  rideType: 'private' as RideType,
  seats: 1,
  vehicle: null,
  fareEstimate: null,
  paymentMethod: null,
  paymentPhone: '',
  note: '',
};

export const useRideWizardStore = create<RideWizardState>((set) => ({
  ...initial,
  setPickup: (p) => set({ pickup: p }),
  setDestination: (p) => set({ destination: p }),
    setRideType: (t) => set((s) => ({ rideType: t, seats: t === 'shared' ? s.seats : 1 })),
  setSeats: (n) => set({ seats: n }),
  setVehicle: (v) => set({ vehicle: v }),
  setFareEstimate: (e) => set({ fareEstimate: e }),
  setPaymentMethod: (m) => set({ paymentMethod: m }),
  setPaymentPhone: (p) => set({ paymentPhone: p }),
  setNote: (n) => set({ note: n }),
  reset: () => set({ ...initial }),
}));
