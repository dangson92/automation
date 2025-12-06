import express from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { query } from '../db.js'
import { privateKey } from '../config/keys.js'

const router = express.Router()

const hashDevice = (deviceId) => {
  const h = crypto.createHash('sha256')
  h.update(String(deviceId))
  h.update(String(process.env.DEVICE_SALT || ''))
  return h.digest('hex')
}

router.post('/', async (req, res) => {
  try {
    const { licenseKey, appCode, deviceId, appVersion } = req.body

    // Log request info
    console.log('📝 License activation request:', {
      licenseKey: licenseKey?.substring(0, 4) + '****',
      appCode,
      deviceId: deviceId?.substring(0, 16) + '...',
      appVersion
    })

    if (!licenseKey || !appCode || !deviceId) return res.status(400).json({ error: 'invalid_input' })
    const appR = await query('SELECT id,code FROM apps WHERE code=?', [appCode])
    if (!appR.rows.length) return res.status(404).json({ error: 'app_not_found' })
    const appId = appR.rows[0].id
    const licR = await query(
      `SELECT l.id, l.max_devices, l.expires_at, l.status, u.email, u.full_name
       FROM licenses l
       JOIN users u ON u.id = l.user_id
       WHERE l.license_key=? AND l.app_id=?`,
      [licenseKey, appId]
    )
    if (!licR.rows.length) return res.status(404).json({ error: 'license_not_found' })
    const lic = licR.rows[0]
    if (lic.status !== 'active') return res.status(400).json({ error: 'license_inactive' })
    if (lic.expires_at && new Date(lic.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'license_expired' })
    const deviceHash = hashDevice(deviceId)

    console.log('🔐 Device info:', {
      deviceId: deviceId?.substring(0, 32) + '...',
      deviceHash: deviceHash?.substring(0, 16) + '...'
    })
    const actR = await query('SELECT id,status FROM activations WHERE license_id=? AND device_hash=?', [lic.id, deviceHash])
    if (!actR.rows.length) {
      const countR = await query(
        `SELECT COUNT(*) AS c FROM activations WHERE license_id=? AND status='active'`,
        [lic.id]
      )
      const c = Number(countR.rows[0].c)
      console.log(`📊 Active devices: ${c}/${lic.max_devices}`)

      if (c >= lic.max_devices) {
        console.log('❌ Max devices reached')
        return res.status(429).json({ error: 'max_devices_reached' })
      }

      await query(
        `INSERT INTO activations(license_id,device_hash,first_activated_at,last_checkin_at,status)
         VALUES(?,?,NOW(),NOW(),'active')`,
        [lic.id, deviceHash]
      )
      console.log('✅ New device activated')
    } else {
      await query(`UPDATE activations SET last_checkin_at=NOW() WHERE id=?`, [actR.rows[0].id])
      console.log('✅ Device re-activated (already exists)')
    }
    const payload = {
      licenseId: lic.id,
      appCode,
      deviceHash,
      licenseStatus: lic.status,
      maxDevices: lic.max_devices,
      appVersion: appVersion || null,
      userEmail: lic.email,
      userName: lic.full_name,
    }
    const token = jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '30d' })
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    console.log('🎉 Token issued successfully for user:', lic.email)
    res.json({ token, expiresAt, licenseInfo: { expires_at: lic.expires_at, status: lic.status, appCode, userEmail: lic.email, userName: lic.full_name } })
  } catch (e) {
    console.error('💥 Activation error:', e.message)
    res.status(500).json({ error: 'server_error' })
  }
})

export default router
