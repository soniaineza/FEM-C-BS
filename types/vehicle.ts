export interface Vehicle {
  id: string;
  name: string;
  description: string;
  capacity: number;
  baseFare: number;
  farePerKm: number;
  etaMinutes: number;
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
