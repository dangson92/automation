/**
 * Check-in API - Verify device vẫn còn active
 * Client gọi khi app start để đảm bảo device chưa bị admin gỡ
 */

import express from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { query } from '../db.js'
import { getPrivateKey, getPublicKey } from '../config/keys.js'

const router = express.Router()

/**
 * Hash deviceId với DEVICE_SALT (giống activate.js)
 */
function hashDeviceId(deviceId) {
  const hash = crypto.createHash('sha256')
  hash.update(deviceId)
  hash.update(process.env.DEVICE_SALT || 'default-device-salt')
  return hash.digest('hex')
}

/**
 * POST /check-in
 * Body: { token, appCode, deviceId, appVersion }
 * Returns: { valid: true/false, message/error }
 */
router.post('/', async (req, res) => {
  try {
    const { token, appCode, deviceId, appVersion } = req.body

    if (!token || !appCode || !deviceId) {
      return res.status(400).json({ error: 'invalid_input' })
    }

    // 1. Verify JWT token
    let payload
    try {
      const publicKey = getPublicKey()
      payload = jwt.verify(token, publicKey, { algorithms: ['RS256'] })
    } catch (error) {
      console.error('JWT verification failed:', error.message)
      return res.status(401).json({ error: 'invalid_token' })
    }

    // 2. Check appCode matches
    if (payload.appCode !== appCode) {
      return res.status(400).json({ error: 'app_code_mismatch' })
    }

    // 3. Hash deviceId and check if it matches payload
    const deviceHash = hashDeviceId(deviceId)
    if (payload.deviceHash !== deviceHash) {
      return res.status(400).json({ error: 'device_mismatch' })
    }

    // 4. Check if device still active in database
    const licenseId = payload.licenseId

    const activations = await query(
      `SELECT id, status, last_checkin_at
       FROM activations
       WHERE license_id=? AND device_hash=?`,
      [licenseId, deviceHash]
    )

    if (activations.length === 0) {
      // Device đã bị gỡ bởi admin
      console.log(`❌ Check-in failed: Device removed by admin (licenseId=${licenseId}, deviceHash=${deviceHash})`)
      return res.status(403).json({
        error: 'device_removed',
        message: 'Device has been removed by administrator. Please re-activate your license.'
      })
    }

    const activation = activations[0]

    if (activation.status !== 'active') {
      console.log(`❌ Check-in failed: Device not active (status=${activation.status})`)
      return res.status(403).json({
        error: 'device_inactive',
        message: 'Device is no longer active.'
      })
    }

    // 5. Check if license still active
    const licenses = await query(
      `SELECT status, expires_at FROM licenses WHERE id=?`,
      [licenseId]
    )

    if (licenses.length === 0) {
      return res.status(404).json({ error: 'license_not_found' })
    }

    const license = licenses[0]

    if (license.status !== 'active') {
      console.log(`❌ Check-in failed: License not active (status=${license.status})`)
      return res.status(403).json({
        error: 'license_inactive',
        message: 'License is no longer active.'
      })
    }

    // Check expiration
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      console.log(`❌ Check-in failed: License expired`)
      return res.status(403).json({
        error: 'license_expired',
        message: 'License has expired.'
      })
    }

    // 6. Update last_checkin_at
    await query(
      `UPDATE activations
       SET last_checkin_at=NOW(), app_version=?
       WHERE id=?`,
      [appVersion || null, activation.id]
    )

    console.log(`✅ Check-in successful for licenseId=${licenseId}, deviceHash=${deviceHash}`)

    res.json({
      valid: true,
      message: 'Check-in successful'
    })

  } catch (error) {
    console.error('Check-in error:', error)
    res.status(500).json({
      error: 'server_error',
      message: error.message
    })
  }
})

export default router
