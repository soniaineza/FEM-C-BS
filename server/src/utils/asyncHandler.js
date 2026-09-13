/** Wraps an async route handler so rejected promises reach the error middleware. */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** A handled API error with an HTTP status and a passenger-safe message. */
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { asyncHandler, ApiError };
