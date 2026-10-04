const { verifyToken } = require('../utils/jwt');
const { ApiError } = require('../utils/asyncHandler');
const { getPool } = require('../db');

function readBearer(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

/** Requires a valid passenger `Authorization: Bearer <token>`. */
function requireSession(req, _res, next) {
  const token = readBearer(req);
  if (!token) return next(new ApiError(401, 'Sign in to continue.'));
  try {
    const { id, role, version } = verifyToken(token);
    if (role !== 'passenger') throw new Error('wrong role');
    req.passengerId = id;
    getPool().query('SELECT session_version, verified_at FROM passengers WHERE id=$1', [id]).then(({ rows }) => {
      if (!rows[0] || rows[0].session_version !== version) return new ApiError(401, 'Your session has expired. Please sign in again.');
      req.passengerVerified = Boolean(rows[0].verified_at);
      return undefined;
    }, (err) => err).then(next);
  } catch (err) {
    next(new ApiError(401, 'Your session has expired. Please sign in again.'));
  }
}

/** A signup token may verify or resend OTP, but cannot use passenger APIs. */
function requireAuth(req, res, next) {
  requireSession(req, res, (err) => {
    if (err) return next(err);
    if (!req.passengerVerified) return next(new ApiError(403, 'Verify your phone to continue.'));
    next();
  });
}

/** Requires a valid driver `Authorization: Bearer <token>` (driver console). */
function requireDriverAuth(req, _res, next) {
  const token = readBearer(req);
  if (!token) return next(new ApiError(401, 'Sign in to continue.'));
  try {
    const { id, role } = verifyToken(token);
    if (role !== 'driver') throw new Error('wrong role');
    req.driverId = id;
    next();
  } catch (err) {
    next(new ApiError(401, 'Your driver session has expired. Please sign in again.'));
  }
}

module.exports = { requireAuth, requireSession, requireDriverAuth };
