const { config } = require('../config');
const { getPool } = require('../db');

// Fictional driver pool used only to animate the simulated ride lifecycle.
// Clearly a development stand-in for a real driver-matching / dispatch
// system — replace with real matching once drivers exist.
const DEV_DRIVERS = [
  { name: 'Jean Baptiste', vehicleModel: 'Toyota Corolla', vehicleColor: 'White', licensePlate: 'RAD 123 A', phone: '+250780000001', rating: 4.8 },
  { name: 'Alice Uwase', vehicleModel: 'Toyota Vitz', vehicleColor: 'Silver', licensePlate: 'RAC 456 B', phone: '+250780000002', rating: 4.9 },
  { name: 'Eric Mugisha', vehicleModel: 'Honda Fit', vehicleColor: 'Blue', licensePlate: 'RAB 789 C', phone: '+250780000003', rating: 4.7 },
  { name: 'Grace Ingabire', vehicleModel: 'Suzuki Swift', vehicleColor: 'Red', licensePlate: 'RAA 321 D', phone: '+250780000004', rating: 4.95 },
];

function pickDriver() {
  return DEV_DRIVERS[Math.floor(Math.random() * DEV_DRIVERS.length)];
}

async function updateRide(rideId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map((k) => fields[k]);
  await getPool().query(
    `UPDATE rides SET ${setClause} WHERE id = $1 AND cancelled_at IS NULL AND status != 'cancelled'`,
    [rideId, ...values]
  );
}

async function currentStatus(rideId) {
  const { rows } = await getPool().query('SELECT status FROM rides WHERE id = $1', [rideId]);
  return rows[0] && rows[0].status;
}

/**
 * Runs a simulated ride lifecycle in the background: assigns a driver, then
 * progresses the ride through arrival, in-progress and completion. Stops
 * early if the ride is cancelled. This stands in for a real dispatch /
 * driver-app integration.
 */
async function simulateRide(ride) {
  const wait = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000));

  await wait(config.simAcceptDelaySeconds);
  if ((await currentStatus(ride.id)) !== 'searchingDriver') return;
  const driver = pickDriver();
  await updateRide(ride.id, {
    status: 'driverAssigned',
    driver_name: driver.name,
    driver_phone: driver.phone,
    driver_rating: driver.rating,
    driver_vehicle_model: driver.vehicleModel,
    driver_vehicle_color: driver.vehicleColor,
    driver_license_plate: driver.licensePlate,
    accepted_at: new Date(),
  });

  await wait(2);
  if ((await currentStatus(ride.id)) !== 'driverAssigned') return;
  await updateRide(ride.id, { status: 'driverArriving' });

  const arrivalEtaSeconds = Math.max(5, Math.round(ride.distanceKm * 2));
  await wait(arrivalEtaSeconds);
  if ((await currentStatus(ride.id)) !== 'driverArriving') return;
  await updateRide(ride.id, { arrived_at: new Date() });

  await wait(config.simWaitAtPickupSeconds);
  if ((await currentStatus(ride.id)) !== 'driverArriving') return;
  await updateRide(ride.id, { status: 'inProgress', started_at: new Date() });

  const tripSeconds = Math.max(5, Math.round(ride.distanceKm * config.simEtaSecondsPerKm));
  await wait(tripSeconds);
  if ((await currentStatus(ride.id)) !== 'inProgress') return;
  await updateRide(ride.id, {
    status: 'completed',
    completed_at: new Date(),
    final_fare: ride.estimatedFare,
  });
}

module.exports = { simulateRide };
