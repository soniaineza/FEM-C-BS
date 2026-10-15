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
    const { id, role } = verifyToken(token);
    if (role !== 'passenger') throw new Error('wrong role');
    req.passengerId = id;
    next();
  } catch (err) {
    next(new ApiError(401, 'Your session has expired. Please sign in again.'));
  }
}

/** A signup token may verify or resend OTP, but cannot use passenger APIs. */
function requireAuth(req, res, next) {
  requireSession(req, res, (err) => {
    if (err) return next(err);
    getPool().query('SELECT verified_at, deleted_at FROM passengers WHERE id=$1', [req.passengerId])
      .then(({ rows }) => {
        // A closed account's token stops working at once.
        if (!rows[0] || rows[0].deleted_at) return next(new ApiError(401, 'Account not found.'));
        if (!rows[0].verified_at) return next(new ApiError(403, 'Verify your phone to continue.'));
        next();
      })
      .catch(next);
  });
}

// What a driver who is not yet approved may do with their session: finish
// the application (profile, vehicle, documents), read the operator's
// decisions, and reach support. Everything else under /api/driver and every
// ride operation under /api/drivers stays closed until an operator verifies
// the account. Paths are relative to the /api/driver router.
const APPLICATION_ROUTES = [
  ['GET', /^\/me$/], ['PUT', /^\/me$/],
  ['GET', /^\/vehicle$/], ['PUT', /^\/vehicle$/],
  ['GET', /^\/documents$/], ['POST', /^\/documents$/],
  ['GET', /^\/documents\/[0-9a-f-]+\/file$/i],
  // Rejections and the approval itself arrive as notifications.
  ['GET', /^\/notifications$/], ['GET', /^\/notifications\/unread-count$/],
  ['POST', /^\/notifications\/[0-9a-f-]+\/read$/i], ['POST', /^\/notifications\/read-all$/],
  // Both spellings: the app posts /device-token, the console /notifications/device-token.
  ['POST', /^\/device-token$/], ['POST', /^\/notifications\/device-token$/],
  ['GET', /^\/support(\/[0-9a-f-]+)?$/i], ['POST', /^\/support(\/[0-9a-f-]+\/messages)?$/i],
  ['DELETE', /^\/account$/],
];

/** Whether an unverified driver may call `method path` on /api/driver. */
function isApplicationRoute(method, routerPath) {
  const path = String(routerPath || '').replace(/\/+$/, '') || '/';
  return APPLICATION_ROUTES.some(([m, re]) => m === method && re.test(path));
}

const PENDING_APPROVAL_MESSAGE = 'Your account is waiting for admin approval. Driver features are available after approval.';

/** Requires a valid driver `Authorization: Bearer <token>` (driver console). */
function requireDriverAuth(req, _res, next) {
  const token = readBearer(req);
  if (!token) return next(new ApiError(401, 'Sign in to continue.'));
  try {
    const { id, role } = verifyToken(token);
    if (role !== 'driver') throw new Error('wrong role');
    // A token outlives a deleted or closed account by up to its lifetime, so
    // account status is checked on every request.
    getPool()
      .query('SELECT verified, status FROM drivers WHERE id = $1 AND password_hash IS NOT NULL AND deleted_at IS NULL', [id])
      .then(({ rows }) => {
        if (!rows[0]) return next(new ApiError(401, 'This driver account is no longer active.'));
        if (rows[0].status === 'suspended') {
          return next(new ApiError(403, 'Your driver account is suspended. Contact Kimu Transport support.'));
        }
        if (!rows[0].verified && !(req.baseUrl === '/api/driver' && isApplicationRoute(req.method, req.path))) {
          return next(new ApiError(403, PENDING_APPROVAL_MESSAGE, 'PENDING_APPROVAL'));
        }
        req.driverId = id;
        next();
      })
      .catch(next);
  } catch (err) {
    next(new ApiError(401, 'Your driver session has expired. Please sign in again.'));
  }
}

/**
 * Requires a signed-in rider (phone verified) or driver. Sets req.userKey
 * ("rider:<id>" / "driver:<id>") for per-account rate limiting.
 */
function requireAnyUser(req, res, next) {
  const token = readBearer(req);
  if (!token) return next(new ApiError(401, 'Sign in to continue.'));
  let role;
  try {
    ({ role } = verifyToken(token));
  } catch {
    return next(new ApiError(401, 'Your session has expired. Please sign in again.'));
  }
  const done = (err) => {
    if (err) return next(err);
    req.userKey = role === 'driver' ? `driver:${req.driverId}` : `rider:${req.passengerId}`;
    next();
  };
  if (role === 'driver') return requireDriverAuth(req, res, done);
  return requireAuth(req, res, done);
}

module.exports = { requireAuth, requireSession, requireDriverAuth, requireAnyUser, isApplicationRoute, PENDING_APPROVAL_MESSAGE };
