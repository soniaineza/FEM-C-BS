const jwt = require('jsonwebtoken');
const { config } = require('../config');

/** Signs a session token for a passenger id. */
function signToken(passengerId) {
  return jwt.sign({ sub: passengerId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/** Verifies a session token, returning the passenger id or throwing. */
function verifyToken(token) {
  const decoded = jwt.verify(token, config.jwtSecret);
  return decoded.sub;
}

module.exports = { signToken, verifyToken };
