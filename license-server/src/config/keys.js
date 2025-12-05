const fs = require('fs');
const path = require('path');
require('dotenv').config();

let privateKey, publicKey;

// Try to load from files first
if (process.env.PRIVATE_KEY_PATH && process.env.PUBLIC_KEY_PATH) {
  try {
    const privatePath = path.resolve(process.env.PRIVATE_KEY_PATH);
    const publicPath = path.resolve(process.env.PUBLIC_KEY_PATH);

    if (fs.existsSync(privatePath) && fs.existsSync(publicPath)) {
      privateKey = fs.readFileSync(privatePath, 'utf8');
      publicKey = fs.readFileSync(publicPath, 'utf8');
      console.log('✓ RSA keys loaded from files');
    }
  } catch (err) {
    console.warn('Warning: Could not load keys from files:', err.message);
  }
}

// Fallback to environment variables
if (!privateKey && process.env.PRIVATE_KEY) {
  privateKey = Buffer.from(process.env.PRIVATE_KEY, 'base64').toString('utf8');
  publicKey = Buffer.from(process.env.PUBLIC_KEY, 'base64').toString('utf8');
  console.log('✓ RSA keys loaded from environment variables');
}

if (!privateKey || !publicKey) {
  console.error('✗ RSA keys not configured!');
  console.error('Please generate keys with:');
  console.error('  openssl genrsa -out keys/private.pem 2048');
  console.error('  openssl rsa -in keys/private.pem -pubout -out keys/public.pem');
  process.exit(1);
}

module.exports = {
  privateKey,
  publicKey,
  deviceSalt: process.env.DEVICE_SALT || 'default-salt-change-this'
};
