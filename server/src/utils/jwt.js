const jwt = require('jsonwebtoken');
const { config } = require('../config');

/** Signs a session token for a passenger id. */
function signToken(passengerId, sessionVersion = 0) {
  return jwt.sign({ sub: passengerId, role: 'passenger', version: sessionVersion }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/** Signs a session token for a driver id. */
function signDriverToken(driverId) {
  return jwt.sign({ sub: driverId, role: 'driver' }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/** Verifies a session token, returning { id, role } or throwing. */
function verifyToken(token) {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (!decoded.sub) throw new Error('missing subject');
  return { id: decoded.sub, role: decoded.role || 'passenger', version: decoded.version ?? 0 };
}

module.exports = { signToken, signDriverToken, verifyToken };