/**
 * Notification writer for drivers. Mirrors the passenger notification
 * service but targets driver_notifications + driver_device_tokens.
 */
const { getPool } = require('../db');
const { config } = require('../config');

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

  if (!config.fcmServerKey) return;
  try {
    const { rows } = await getPool().query(
      'SELECT token FROM driver_device_tokens WHERE driver_id = $1',
      [driverId]
    );
    for (const { token } of rows) {
      if (!token) continue;
      await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${config.fcmServerKey}`,
        },
        body: JSON.stringify({
          to: token,
          notification: { title, body },
          data: { type, rideId: rideId ? String(rideId) : '', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
        }),
      }).catch((err) => console.error('[driverNotify] FCM send failed:', err.message));
    }
  } catch (err) {
    console.error('[driverNotify] FCM delivery failed:', err);
  }
}

module.exports = { pushDriverNotification };
