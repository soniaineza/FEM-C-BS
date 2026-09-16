const { getPool } = require('../db');
const { config } = require('../config');

/**
 * Notification writer: persists an in-app notification for a passenger and
 * forwards a push to their registered devices when FCM is configured.
 * Never throws — failures are logged so ride transactions never fail because
 * of a notification delivery problem.
 */
async function pushNotification(passengerId, { title, body, type = 'general', rideId = null }) {
  try {
    await getPool().query(
      `INSERT INTO notifications (passenger_id, ride_id, title, body, type)
       VALUES ($1,$2,$3,$4,$5)`,
      [passengerId, rideId, title, body, type]
    );
  } catch (err) {
    console.error('[notify] failed to persist notification:', err);
  }

  if (!config.fcmServerKey) return;
  try {
    const { rows } = await getPool().query(
      'SELECT token FROM device_tokens WHERE passenger_id = $1',
      [passengerId]
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
      }).catch((err) => console.error('[notify] FCM send failed:', err.message));
    }
  } catch (err) {
    console.error('[notify] FCM delivery failed:', err);
  }
}

module.exports = { pushNotification };