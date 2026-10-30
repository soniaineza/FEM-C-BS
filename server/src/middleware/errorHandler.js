const { ApiError } = require('../utils/asyncHandler');
const { DOCUMENT_MAX_MB } = require('../services/driverDocuments');
const { isUniqueViolation } = require('../db');

/** Central error handler — always returns a JSON { error: message } body. */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ApiError) {
    return res.status(err.status).json(err.code ? { error: err.message, code: err.code } : { error: err.message });
  }

  // A unique key was violated -> a friendlier 409.
  if (isUniqueViolation(err)) {
    return res.status(409).json({ error: 'That account already exists.' });
  }

  // A value longer than its column allows (strict mode refuses to cut it).
  if (err && (err.code === 'ER_DATA_TOO_LONG' || err.errno === 1406)) {
    return res.status(400).json({ error: 'One of the values you sent is too long.' });
  }

  if (err && err.name === 'MulterError') {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: tooLarge
        ? `File is too large. Maximum size is ${DOCUMENT_MAX_MB} MB.`
        : `Could not accept this file upload (${err.code}). Send one file in the "file" field.`,
      code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_REJECTED',
    });
  }

  console.error('[api] unhandled error:', err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found.' });
}

module.exports = { errorHandler, notFound };
