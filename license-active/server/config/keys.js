/**
 * RSA Keys Configuration
 *
 * Loads RSA private/public keys from files for JWT signing/verification
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Load private key from file
 * Default path: license-active/keys/private.pem
 * Override with PRIVATE_KEY_PATH env variable
 */
let privateKey
try {
  const privateKeyPath = process.env.PRIVATE_KEY_PATH || path.join(__dirname, '../../keys/private.pem')
  privateKey = fs.readFileSync(privateKeyPath, 'utf8')
  console.log('✓ Private key loaded from:', privateKeyPath)
} catch (error) {
  console.error('✗ Failed to load private key:', error.message)
  console.error('Please ensure:')
  console.error('  1. Private key file exists at:', process.env.PRIVATE_KEY_PATH || 'license-active/keys/private.pem')
  console.error('  2. File has correct permissions (600)')
  console.error('  3. Or set PRIVATE_KEY_PATH in .env')
  process.exit(1)
}

/**
 * Load public key from file (optional, for verification if needed)
 * Default path: license-active/keys/public.pem
 * Override with PUBLIC_KEY_PATH env variable
 */
let publicKey
try {
  const publicKeyPath = process.env.PUBLIC_KEY_PATH || path.join(__dirname, '../../keys/public.pem')
  if (fs.existsSync(publicKeyPath)) {
    publicKey = fs.readFileSync(publicKeyPath, 'utf8')
    console.log('✓ Public key loaded from:', publicKeyPath)
  }
} catch (error) {
  console.warn('⚠ Public key not loaded (optional):', error.message)
}

export { privateKey, publicKey }
