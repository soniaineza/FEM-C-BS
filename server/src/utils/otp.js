const bcrypt = require('bcryptjs');
const { config } = require('../config');

/** Generates a random N-digit numeric code (default 6 digits). */
function generateCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

async function hashCode(code) {
  return bcrypt.hash(code, 10);
}

async function compareCode(code, hash) {
  return bcrypt.compare(code, hash);
}

function expiryDate() {
  return new Date(Date.now() + config.otpTtlSeconds * 1000);
}

module.exports = { generateCode, hashCode, compareCode, expiryDate };
