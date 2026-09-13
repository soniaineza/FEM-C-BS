const { verifyToken } = require('../utils/jwt');
const { ApiError } = require('../utils/asyncHandler');

/** Requires a valid `Authorization: Bearer <token>` header, sets req.passengerId. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Sign in to continue.'));
  }
  try {
    req.passengerId = verifyToken(token);
    next();
  } catch (err) {
    next(new ApiError(401, 'Your session has expired. Please sign in again.'));
  }
}

module.exports = { requireAuth };
