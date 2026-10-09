export interface Vehicle {
  id: string;
  name: string;
  description: string;
  capacity: number;
  baseFare: number;
  farePerKm: number;
  etaMinutes: number;
  /** Distance the base fare already covers, in km. */
  includedKm?: number | null;
  /** Where the long-distance rate takes over, in km. */
  longDistanceKm?: number | null;
  /** Rate per km beyond longDistanceKm. */
  farePerKmLong?: number | null;
  /** Published waiting policy. Nothing measures waiting time yet, so no
   *  waiting money is added to a fare — these are shown, not charged. */
  waitingFee?: number | null;
  waitingFeeMinutes?: number | null;
  freeWaitingMinutes?: number | null;
}

export function vehicleFromBackendJson(json: any): Vehicle {
  return {
    id: json.id,
    name: json.name,
    description: json.description,
    capacity: json.capacity,
    baseFare: json.baseFare ?? json.base_fare,
    farePerKm: json.farePerKm ?? json.fare_per_km,
    etaMinutes: json.etaMinutes ?? json.eta_minutes,
    includedKm: json.includedKm ?? json.included_km ?? null,
    longDistanceKm: json.longDistanceKm ?? json.long_distance_km ?? null,
    farePerKmLong: json.farePerKmLong ?? json.fare_per_km_long ?? null,
    waitingFee: json.waitingFee ?? json.waiting_fee ?? null,
    waitingFeeMinutes: json.waitingFeeMinutes ?? json.waiting_fee_minutes ?? null,
    freeWaitingMinutes: json.freeWaitingMinutes ?? json.free_waiting_minutes ?? null,
  };
}
