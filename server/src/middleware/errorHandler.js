const { ApiError } = require('../utils/asyncHandler');
const { DOCUMENT_MAX_MB } = require('../services/driverDocuments');

/** Central error handler — always returns a JSON { error: message } body. */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ApiError) {
    return res.status(err.status).json(err.code ? { error: err.message, code: err.code } : { error: err.message });
  }

  // Postgres unique-violation -> a friendlier 409.
  if (err && err.code === '23505') {
    return res.status(409).json({ error: 'That account already exists.' });
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
