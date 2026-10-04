const { getPool } = require('../db');

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
// Expo accepts at most 100 messages per request.
const EXPO_BATCH_SIZE = 100;
// Must match the Android channel the app creates in utils/notifications.ts.
const ANDROID_CHANNEL_ID = 'rides';

/**
 * Sends one notification to every Expo push token in [tokenTable] (either
 * device_tokens or driver_device_tokens) matching [ownerColumn] = [ownerId].
 * Both the rider and driver clients are the Expo app, so the stored tokens
 * are Expo push tokens (`ExponentPushToken[...]`) and no server-side key is
 * needed. Tokens Expo reports as DeviceNotRegistered (app uninstalled) are
 * deleted so they are not retried forever. Never throws.
 */
async function sendExpoPush(tokenTable, ownerColumn, ownerId, { title, body, data = {} }) {
  try {
    const { rows } = await getPool().query(
      `SELECT token FROM ${tokenTable} WHERE ${ownerColumn} = $1`,
      [ownerId]
    );
    const tokens = rows
      .map((r) => r.token)
      .filter((token) => token && /^Expo(nent)?PushToken\[/.test(token));

    for (let i = 0; i < tokens.length; i += EXPO_BATCH_SIZE) {
      const batch = tokens.slice(i, i + EXPO_BATCH_SIZE);
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        // Callers await this inside ride flows; never let a slow push stall them.
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify(
          batch.map((to) => ({
            to,
            title,
            body,
            data,
            sound: 'default',
            priority: 'high',
            channelId: ANDROID_CHANNEL_ID,
          }))
        ),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        console.error(`[expoPush] send failed with HTTP ${res.status}:`, JSON.stringify(payload));
        continue;
      }
      // Tickets come back in the same order as the messages.
      const tickets = Array.isArray(payload?.data) ? payload.data : [];
      const dead = [];
      tickets.forEach((ticket, idx) => {
        if (ticket?.status !== 'error') return;
        if (ticket.details?.error === 'DeviceNotRegistered') dead.push(batch[idx]);
        else console.error('[expoPush] ticket error:', ticket.message);
      });
      if (dead.length) {
        await getPool().query(`DELETE FROM ${tokenTable} WHERE token = ANY($1)`, [dead]);
      }
    }
  } catch (err) {
    console.error('[expoPush] push delivery failed:', err.message);
  }
}

module.exports = { sendExpoPush };
