// The FEM C@BS tariff — one rate card for every vehicle class and every place
// a fare is computed (booking quotes, the on-device backend, the driver meter).
//
//   base fare            1,800 RWF, covers the first 1 km
//   1 km – 30 km         1,080 RWF per km
//   beyond 30 km           900 RWF per km
//   waiting              15 minutes free, then 1,500 RWF for every 15 minutes
//                        (or part of 15 minutes) of waiting

export const TARIFF = {
  currency: 'RWF',
  baseFare: 1800,
  baseIncludedKm: 1,
  perKm: 1080,
  longTripFromKm: 30,
  perKmLongTrip: 900,
  freeWaitingMinutes: 15,
  waitingBlockMinutes: 15,
  waitingChargePerBlock: 1500,
} as const;

export interface TariffFare {
  baseFare: number;
  /** Charge for distance beyond the km covered by the base fare. */
  distanceFare: number;
  /** Charge for waiting beyond the free minutes. */
  waitingFare: number;
  total: number;
}

/** Waiting charge: nothing inside the free window, then 1,500 RWF per started 15-minute block. */
export function waitingCharge(waitingMinutes: number): number {
  const chargeable = Math.max(0, waitingMinutes - TARIFF.freeWaitingMinutes);
  const blocks = Math.max(0, Math.ceil(chargeable / TARIFF.waitingBlockMinutes - 1e-9));
  return blocks * TARIFF.waitingChargePerBlock;
}

/** Fare for a trip of `distanceKm` with `waitingMinutes` of waiting, before any rider discount or rounding. */
export function tariffFare(distanceKm: number, waitingMinutes = 0): TariffFare {
  const km = Math.max(0, distanceKm);
  const standardKm = Math.max(0, Math.min(km, TARIFF.longTripFromKm) - TARIFF.baseIncludedKm);
  const longKm = Math.max(0, km - TARIFF.longTripFromKm);
  const distanceFare = standardKm * TARIFF.perKm + longKm * TARIFF.perKmLongTrip;
  const waitingFare = waitingCharge(waitingMinutes);
  return {
    baseFare: TARIFF.baseFare,
    distanceFare,
    waitingFare,
    total: TARIFF.baseFare + distanceFare + waitingFare,
  };
}
