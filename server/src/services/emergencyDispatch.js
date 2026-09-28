const { getPool } = require('../db');
const { config } = require('../config');
const { sendSms } = require('./otpSender');

// Claim an event before sending so overlapping scheduler passes do not send
// duplicate alerts. A failed send is left pending for retry and operator view.
async function dispatchEmergency(id) {
  const { rows } = await getPool().query(
    `UPDATE emergency_events SET status='dispatching', dispatch_started_at=now(),
       dispatch_attempts=dispatch_attempts+1
       WHERE id=$1 AND (status IN ('pending','retry') OR
         (status='dispatching' AND dispatch_started_at < now() - interval '2 minutes')) RETURNING *`, [id]
  );
  const event = rows[0];
  if (!event) return false;
  const passenger = await getPool().query('SELECT phone FROM passengers WHERE id=$1', [event.passenger_id]);
  const location = event.latitude != null && event.longitude != null
    ? `${event.latitude},${event.longitude}` : 'location unavailable';
  const message = `FEM C@BS SOS ${event.reference}. Rider ${passenger.rows[0]?.phone || 'unknown'}, ride ${event.ride_id || 'none'}, location ${location}. Open the operator emergency queue now.`;
  try {
    await sendSms(config.emergencyCallCenterPhone, message);
    await getPool().query(
      `UPDATE emergency_events SET status='dispatched', dispatched_at=now(), dispatch_error=NULL WHERE id=$1`,
      [id]
    );
    return true;
  } catch (err) {
    await getPool().query(
      `UPDATE emergency_events SET status='retry', dispatch_error=$2 WHERE id=$1`,
      [id, String(err.message || err).slice(0, 300)]
    );
    throw err;
  }
}

async function retryEmergencies() {
  const { rows } = await getPool().query(
    `SELECT id FROM emergency_events WHERE (status IN ('pending','retry') OR
        (status='dispatching' AND dispatch_started_at < now() - interval '2 minutes'))
       AND dispatch_attempts < 10 ORDER BY created_at LIMIT 20`
  );
  for (const row of rows) {
    try { await dispatchEmergency(row.id); }
    catch (err) { console.error('[emergency] retry failed:', row.id, err.message); }
  }
}

module.exports = { dispatchEmergency, retryEmergencies };
