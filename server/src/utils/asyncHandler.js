/** Wraps an async route handler so rejected promises reach the error middleware. */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** A handled API error with an HTTP status, a passenger-safe message and,
 * where the client needs to tell cases apart, a stable machine-readable code. */
class ApiError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = { asyncHandler, ApiError };
