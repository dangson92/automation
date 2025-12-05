const crypto = require('crypto');
const { deviceSalt } = require('../config/keys');

/**
 * Hash device ID using SHA256
 */
function hashDeviceId(deviceId) {
  return crypto
    .createHash('sha256')
    .update(deviceId + deviceSalt)
    .digest('hex');
}

/**
 * Generate a random license key
 * Format: XXXX-XXXX-XXXX-XXXX
 */
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments = 4;
  const segmentLength = 4;

  const key = [];
  for (let i = 0; i < segments; i++) {
    let segment = '';
    for (let j = 0; j < segmentLength; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    key.push(segment);
  }

  return key.join('-');
}

module.exports = {
  hashDeviceId,
  generateLicenseKey
};
