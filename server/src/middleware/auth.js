const { verifyToken } = require('../utils/jwt');
const { ApiError } = require('../utils/asyncHandler');

function readBearer(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

/** Requires a valid passenger `Authorization: Bearer <token>`. */
function requireAuth(req, _res, next) {
  const token = readBearer(req);
  if (!token) return next(new ApiError(401, 'Sign in to continue.'));
  try {
    const { id, role } = verifyToken(token);
    if (role !== 'passenger') throw new Error('wrong role');
    req.passengerId = id;
    next();
  } catch (err) {
    next(new ApiError(401, 'Your session has expired. Please sign in again.'));
  }
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

module.exports = { requireAuth, requireDriverAuth };