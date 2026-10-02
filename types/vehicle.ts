export interface Vehicle {
  id: string;
  name: string;
  description: string;
  capacity: number;
  baseFare: number;
  farePerKm: number;
  etaMinutes: number;
  isMock?: boolean;
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
  };
}

// Local fallback catalogue (lib/services/ride_service.dart's
// getAvailableVehicles), used only if GET /vehicles is unreachable.
export const MOCK_VEHICLES: Vehicle[] = [
  {
    id: 'fem_economy',
    name: 'Kimu Economy',
    description: 'Everyday rides at the best price.',
    capacity: 4,
    baseFare: 1200,
    farePerKm: 500,
    etaMinutes: 5,
    isMock: true,
  },
  {
    id: 'fem_comfort',
    name: 'Kimu Comfort',
    description: 'Newer cars with extra legroom.',
    capacity: 4,
    baseFare: 1800,
    farePerKm: 700,
    etaMinutes: 6,
    isMock: true,
  },
  {
    id: 'fem_xl',
    name: 'Kimu XL',
    description: 'Spacious vehicles for groups and luggage.',
    capacity: 6,
    baseFare: 2500,
    farePerKm: 900,
    etaMinutes: 8,
    isMock: true,
  },
];
