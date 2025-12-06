/**
 * RSA Keys Configuration
 *
 * Loads RSA private/public keys from files or environment variables
 * Priority: File-based (Option 2) → Env-based (Option 1)
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Load private key from file
 * Uses PRIVATE_KEY_PATH env variable or default keys/private.pem
 */
let privateKey

if (process.env.PRIVATE_KEY_PATH) {
  try {
    privateKey = fs.readFileSync(process.env.PRIVATE_KEY_PATH, 'utf8')
    console.log('✓ Private key loaded from file:', process.env.PRIVATE_KEY_PATH)
  } catch (error) {
    console.error('✗ Failed to load private key from file:', error.message)
    process.exit(1)
  }
} else {
  const defaultPath = path.join(__dirname, '../../keys/private.pem')
  if (fs.existsSync(defaultPath)) {
    try {
      privateKey = fs.readFileSync(defaultPath, 'utf8')
      console.log('✓ Private key loaded from default file:', defaultPath)
    } catch (error) {
      console.error('✗ Failed to load private key from default file:', error.message)
      process.exit(1)
    }
  } else {
    console.error('✗ No private key found!')
    console.error('Please create file at keys/private.pem or set PRIVATE_KEY_PATH')
    process.exit(1)
  }
}

/**
 * Load public key from file (optional, for verification if needed)
 */
let publicKey

if (process.env.PUBLIC_KEY_PATH) {
  try {
    publicKey = fs.readFileSync(process.env.PUBLIC_KEY_PATH, 'utf8')
    console.log('✓ Public key loaded from file:', process.env.PUBLIC_KEY_PATH)
  } catch (error) {
    console.warn('⚠ Public key file not found (optional)')
  }
} else {
  const defaultPubPath = path.join(__dirname, '../../keys/public.pem')
  if (fs.existsSync(defaultPubPath)) {
    try {
      publicKey = fs.readFileSync(defaultPubPath, 'utf8')
      console.log('✓ Public key loaded from default file:', defaultPubPath)
    } catch (error) {
      // Silent fail for public key (optional)
    }
  }
}

// Export as functions for consistency with imports
export function getPrivateKey() {
  return privateKey
}

export function getPublicKey() {
  return publicKey
}

// Also export raw values for backward compatibility
export { privateKey, publicKey }
