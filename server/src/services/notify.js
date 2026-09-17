const { getPool } = require('../db');

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/**
 * Notification writer: persists an in-app notification for a passenger and
 * forwards a push to their registered devices via Expo's push API. Never
 * throws — failures are logged so ride transactions never fail because of a
 * notification delivery problem.
 *
 * The passenger client is the Expo app (see notification-service.ts's
 * registerDeviceToken), so device_tokens.token holds Expo push tokens
 * (`ExponentPushToken[...]`), not raw FCM registration tokens — those are
 * not interchangeable, so this posts to Expo's push service directly rather
 * than the legacy FCM endpoint driverNotify.js still uses for the
 * (unrelated, unmigrated) driver app. No server-side API key is needed to
 * send through Expo's push service.
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

  try {
    const { rows } = await getPool().query(
      'SELECT token FROM device_tokens WHERE passenger_id = $1',
      [passengerId]
    );
    const messages = rows
      .map((r) => r.token)
      .filter((token) => token && token.startsWith('ExponentPushToken'))
      .map((token) => ({
        to: token,
        title,
        body,
        data: { type, rideId: rideId ? String(rideId) : '' },
      }));
    if (!messages.length) return;

    await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    }).catch((err) => console.error('[notify] Expo push send failed:', err.message));
  } catch (err) {
    console.error('[notify] push delivery failed:', err);
  }
}

module.exports = { pushNotification };