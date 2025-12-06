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

// Force JSON content-type for all responses on this router
router.use((req, res, next) => {
  res.set('Content-Type', 'application/json; charset=utf-8')
  next()
})

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
      return res.status(401).json({ active: false, status: 'invalid_token' })
    }

    // 2. Check appCode matches
    if (payload.appCode !== appCode) {
      return res.status(400).json({ active: false, status: 'app_code_mismatch' })
    }

    // 3. Hash deviceId and check if it matches payload
    const deviceHash = hashDeviceId(deviceId)
    if (payload.deviceHash !== deviceHash) {
      return res.status(400).json({ active: false, status: 'device_mismatch' })
    }

    // 4. Check if device still active in database
    const licenseId = payload.licenseId

    const activations = await query(
      `SELECT id, status, last_checkin_at
       FROM activations
       WHERE license_id=? AND device_hash=?`,
      [licenseId, deviceHash]
    )
    if (activations.rows.length === 0) {
      return res.status(403).json({ active: false, status: 'device_removed' })
    }

    const activation = activations.rows[0]

    if (activation.status !== 'active') {
      return res.status(403).json({ active: false, status: 'device_inactive' })
    }

    // 5. Check if license still active
    const licenses = await query(
      `SELECT status, expires_at, max_devices FROM licenses WHERE id=?`,
      [licenseId]
    )
    if (licenses.rows.length === 0) {
      return res.status(404).json({ active: false, status: 'license_not_found' })
    }

    const license = licenses.rows[0]

    if (license.status !== 'active') {
      return res.status(403).json({ active: false, status: 'license_inactive' })
    }

    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return res.status(403).json({ active: false, status: 'license_expired' })
    }

    // 6. Update last_checkin_at
    await query(
      `UPDATE activations
       SET last_checkin_at=NOW(), app_version=?
       WHERE id=?`,
      [appVersion || null, activation.id]
    )

    // 7. Renew JWT token with extended expiration
    const privateKey = require('../config/keys.js').privateKey

    // Get user info for token
    const userInfo = await query(
      `SELECT u.email, u.full_name
       FROM licenses l
       JOIN users u ON u.id = l.user_id
       WHERE l.id=?`,
      [licenseId]
    )

    const user = userInfo.rows[0] || { email: '', full_name: '' }

    const newPayload = {
      licenseId: licenseId,
      appCode,
      deviceHash,
      licenseStatus: license.status,
      maxDevices: license.max_devices,
      appVersion: appVersion || null,
      userEmail: user.email,
      userName: user.full_name,
    }

    const newToken = jwt.sign(newPayload, privateKey, { algorithm: 'RS256', expiresIn: '30d' })
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    res.json({
      active: true,
      status: 'active',
      token: newToken,
      expiresAt: expiresAt
    })

  } catch (error) {
    console.error('Check-in error:', error)
    res.status(500).json({ active: false, status: 'server_error' })
  }
})

export default router
