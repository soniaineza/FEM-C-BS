/**
 * Reference driver console — a real CLI actor that consumes the same API a
 * future driver app would use, letting the passenger app be tested end to end
 * (search → assigned → arriving → arrived → PIN → in-progress → payment).
 *
 * It is a development/test tool, NOT fake data inside the app: every action
 * goes through the real /api/drivers endpoints and real database rows.
 *
 * Usage:
 *   node scripts/driver-console.js <phone> <password> [baseUrl]
 * e.g. node scripts/driver-console.js +250780000001 "$SEED_DRIVER_PASSWORD" http://localhost:3000
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const readline = require('readline');

const phone = process.argv[2];
const password = process.argv[3];
const baseUrl = process.argv[4] || `http://localhost:${process.env.PORT || 3000}`;

if (!phone || !password) {
  console.error('Usage: node scripts/driver-console.js <phone> <password> [baseUrl]');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let token = null;
let poller = null;

async function api(method, url, body, auth = true) {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(data?.error || data || `HTTP ${res.status}`);
  return data;
}

function currentRide() {
  return api('GET', '/api/drivers/ride');
}

function startPolling() {
  poller = setInterval(async () => {
    try {
      const { ride } = await currentRide();
      if (ride) console.log(`  [status] ride ${ride.id.slice(0, 8)} -> ${ride.status}`);
    } catch (err) {
      console.error('  [poll]', err.message);
    }
  }, 4000);
}

async function main() {
  try {
    const { driver, token: t } = await api('POST', '/api/drivers/login', { phone, password });
    token = t;
    console.log(`Logged in as ${driver.fullName} (${driver.phone}). Base: ${baseUrl}`);
  } catch (err) {
    console.error('Login failed:', err.message);
    process.exit(1);
  }

  const commands = {
    status: async () => {
      const { ride } = await currentRide();
      console.log(ride ? JSON.stringify(ride, null, 2) : '  No assigned ride right now.');
    },
    loc: async (lat, lng) => {
      await api('POST', '/api/drivers/location', { latitude: Number(lat), longitude: Number(lng) });
      console.log(`  Location updated: ${lat}, ${lng}`);
    },
    next: async () => {
      const { ride } = await currentRide();
      if (!ride) return console.log('  No ride assigned yet — keep the app open.');
      if (ride.status === 'driverAssigned') {
        await api('POST', `/api/drivers/rides/${ride.id}/accept`);
        // Move toward the pickup a couple of times so tracking has data.
        for (const [la, ln] of [[-1.945, 30.062], [-1.9445, 30.0619]]) {
          await api('POST', '/api/drivers/location', { latitude: la, longitude: ln });
          await new Promise((r) => setTimeout(r, 1000));
        }
        console.log(`  Accepted ride ${ride.id.slice(0, 8)} (heading to pickup).`);
      }
      if (ride.status === 'driverArriving' || ride.status === 'driverAssigned') {
        await api('POST', `/api/drivers/rides/${ride.id}/arrived`);
        console.log('  Marked arrived at pickup.');
      }
    },
    pin: async (p) => {
      const { ride } = await currentRide();
      if (!ride) return console.log('  No ride assigned.');
      await api('POST', `/api/drivers/rides/${ride.id}/verify-pin`, { pin: p });
      console.log('  PIN verified. Trip started.');
    },
    complete: async () => {
      const { ride } = await currentRide();
      if (!ride) return console.log('  No ride assigned.');
      const out = await api('POST', `/api/drivers/rides/${ride.id}/complete-trip`);
      console.log('  Trip completed. Payment:', out.payment);
    },
    help: () => console.log('  Commands: status | loc <lat> <lng> | next | pin <code> | complete | poll | unpoll | exit'),
    poll: () => startPolling(),
    unpoll: () => clearInterval(poller),
    exit: () => {
      clearInterval(poller);
      process.exit(0);
    },
  };

  rl.setPrompt('driver> ');
  console.log('Driver console ready. Type "help" for commands.');
  rl.prompt();

  rl.on('line', async (line) => {
    const [cmd, ...args] = line.trim().split(/\s+/);
    const fn = commands[cmd];
    if (!fn) return console.log('  Unknown command. Try "help".');
    try {
      await fn(...args);
    } catch (err) {
      console.error('  error:', err.message);
    }
    rl.prompt();
  });

  rl.on('close', () => {
    clearInterval(poller);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});