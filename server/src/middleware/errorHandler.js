const { ApiError } = require('../utils/asyncHandler');

/** Central error handler — always returns a JSON { error: message } body. */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }

  // Postgres unique-violation -> a friendlier 409.
  if (err && err.code === '23505') {
    return res.status(409).json({ error: 'That account already exists.' });
  }

  console.error('[api] unhandled error:', err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

module.exports = { errorHandler, notFound };
