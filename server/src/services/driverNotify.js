/**
 * Notification writer for drivers. Mirrors the passenger notification
 * service but targets driver_notifications + driver_device_tokens. The
 * driver client registers Expo push tokens (hooks/useDriverPushRegistration.ts),
 * so delivery goes through Expo's push service like notify.js. Never throws.
 */
const { getPool } = require('../db');
const { sendExpoPush } = require('./expoPush');

async function pushDriverNotification(driverId, { title, body, type = 'general', rideId = null }) {
  try {
    await getPool().query(
      `INSERT INTO driver_notifications (driver_id, ride_id, title, body, type)
       VALUES ($1,$2,$3,$4,$5)`,
      [driverId, rideId, title, body, type]
    );
  } catch (err) {
    console.error('[driverNotify] failed to persist notification:', err);
  }

  await sendExpoPush('driver_device_tokens', 'driver_id', driverId, {
    title,
    body,
    data: { type, rideId: rideId ? String(rideId) : '', audience: 'driver' },
  });
}

module.exports = { pushDriverNotification };
