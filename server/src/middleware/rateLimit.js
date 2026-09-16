const rateLimit = require('express-rate-limit');
const { config } = require('../config');

/**
 * Per-identity rate limiter for sensitive endpoints (signup, login, OTP,
 * password reset). Limits requests per IP (and per phone/email when the
 * route provides `req.identityKey`, which the auth routes do).
 */
function apiLimiter(options = {}) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.identityKey || req.ip,
    message: {
      error: 'Too many requests. Please wait a moment and try again.',
    },
    skipSuccessfulRequests: false,
    ...options,
  });
}

module.exports = { apiLimiter };