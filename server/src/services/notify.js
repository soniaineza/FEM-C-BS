const { getPool } = require('../db');
const { sendExpoPush } = require('./expoPush');

/**
 * Notification writer: persists an in-app notification for a passenger and
 * forwards a push to their registered devices via Expo's push API. Never
 * throws — failures are logged so ride transactions never fail because of a
 * notification delivery problem.
 *
 * The passenger client is the Expo app (see notification-service.ts's
 * registerDeviceToken), so device_tokens.token holds Expo push tokens
 * (`ExponentPushToken[...]`), not raw FCM registration tokens.
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

  await sendExpoPush('device_tokens', 'passenger_id', passengerId, {
    title,
    body,
    data: { type, rideId: rideId ? String(rideId) : '', audience: 'rider' },
  });
}

module.exports = { pushNotification };
