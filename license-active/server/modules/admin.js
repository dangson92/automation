import express from 'express'
import { query } from '../db.js'
import { requireAdmin } from './auth.js'

const router = express.Router()

// Generate GUID-style license key
const genKey = () => {
  // Generate a UUID v4 style GUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const r = await query('SELECT id,email,full_name,role,created_at,last_login_at FROM users ORDER BY id DESC')
    res.json({ items: r.rows })
  } catch (e) {
    console.error('Error getting users:', e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

router.get('/apps', requireAdmin, async (req, res) => {
  try {
    const r = await query('SELECT id,code,name,created_at FROM apps ORDER BY id DESC')
    res.json({ items: r.rows })
  } catch (e) {
    console.error('Error getting apps:', e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

router.post('/apps', requireAdmin, async (req, res) => {
  try {
    const { code, name } = req.body
    console.log('Create app request:', { code, name })
    if (!code || !name) return res.status(400).json({ error: 'invalid_input' })
    await query('INSERT INTO apps(code,name,created_at) VALUES(?,?,NOW())', [code, name])
    const r = await query('SELECT id FROM apps WHERE code=?', [code])
    console.log('App created successfully:', r.rows[0].id)
    res.json({ id: r.rows[0].id })
  } catch (e) {
    console.error('Error creating app:', e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

router.get('/licenses', requireAdmin, async (req, res) => {
  try {
    const { user_id, app_id, status } = req.query
    const cond = []
    const params = []
    if (user_id) { params.push(Number(user_id)); cond.push(`l.user_id=?`) }
    if (app_id) {
      params.push(Number(app_id))
      cond.push(`l.app_id=?`)
    }
    if (status) {
      params.push(String(status))
      cond.push(`l.status=?`)
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
    const r = await query(
      `SELECT l.id, l.license_key, l.expires_at, l.status, l.max_devices, l.created_at,
              u.email, a.code AS app_code, a.name AS app_name,
              (SELECT COUNT(*) FROM activations act WHERE act.license_id = l.id AND act.status = 'active') AS active_devices
       FROM licenses l
       JOIN users u ON u.id=l.user_id
       JOIN apps a ON a.id=l.app_id
       ${where}
       ORDER BY l.id DESC`,
      params
    )
    res.json({ items: r.rows })
  } catch (e) {
    console.error('Error getting licenses:', e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

router.post('/licenses', requireAdmin, async (req, res) => {
  try {
    const { user_id, app_id, max_devices, expires_at, status } = req.body
    console.log('Create license request:', { user_id, app_id, max_devices, expires_at, status })

    if (!user_id || !app_id || !max_devices) {
      console.error('Missing required fields')
      return res.status(400).json({ error: 'invalid_input' })
    }

    const license_key = genKey()
    console.log('Generated license key:', license_key)

    // Convert expires_at to MySQL datetime format if provided
    let expiresAtFormatted = null
    if (expires_at) {
      const date = new Date(expires_at)
      expiresAtFormatted = date.toISOString().slice(0, 19).replace('T', ' ')
    }

    console.log('Inserting license with expires_at:', expiresAtFormatted)

    await query(
      `INSERT INTO licenses(user_id,app_id,license_key,max_devices,expires_at,status,created_at)
       VALUES(?,?,?,?,?,?,NOW())`,
      [Number(user_id), Number(app_id), license_key, Number(max_devices), expiresAtFormatted, status || 'active']
    )
    const r = await query('SELECT id FROM licenses WHERE license_key=?', [license_key])
    console.log('License created successfully:', r.rows[0].id)
    res.json({ id: r.rows[0].id, license_key })
  } catch (e) {
    console.error('Error creating license:', e)
    res.status(500).json({ error: 'server_error', message: e.message })
  }
})

router.get('/licenses/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const r = await query(
      `SELECT l.id,l.license_key,l.expires_at,l.status,l.max_devices,l.meta,u.email,a.code AS app_code,a.name AS app_name
       FROM licenses l JOIN users u ON u.id=l.user_id JOIN apps a ON a.id=l.app_id WHERE l.id=?`,
      [id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' })
    const acts = await query(
      `SELECT id,device_hash,first_activated_at,last_checkin_at,status FROM activations WHERE license_id=? ORDER BY id DESC`,
      [id]
    )
    res.json({ license: r.rows[0], activations: acts.rows })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
})

router.patch('/licenses/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const fields = ['expires_at', 'status', 'max_devices', 'meta']
    const updates = []
    const params = []
    fields.forEach((f) => {
      if (f in req.body) {
        params.push(req.body[f])
        updates.push(`${f}=?`)
      }
    })
    if (!updates.length) return res.status(400).json({ error: 'no_updates' })
    params.push(id)
    await query(`UPDATE licenses SET ${updates.join(',')} WHERE id=?`, params)
    res.json({ id })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
})

router.get('/renew-requests', requireAdmin, async (req, res) => {
  try {
    const { status, user_id, license_id } = req.query
    const cond = []
    const params = []
    if (status) { params.push(String(status)); cond.push(`rr.status=?`) }
    if (user_id) { params.push(Number(user_id)); cond.push(`rr.user_id=?`) }
    if (license_id) { params.push(Number(license_id)); cond.push(`rr.license_id=?`) }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
    const r = await query(
      `SELECT rr.id,rr.status,rr.created_at,rr.processed_at,rr.message,rr.license_id,rr.user_id,l.license_key,a.code AS app_code
       FROM renew_requests rr JOIN licenses l ON l.id=rr.license_id JOIN apps a ON a.id=l.app_id ${where} ORDER BY rr.id DESC`,
      params
    )
    res.json({ items: r.rows })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
})

router.patch('/renew-requests/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { status } = req.body
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'invalid_status' })
    const r = await query('SELECT license_id FROM renew_requests WHERE id=?', [id])
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' })
    const licId = r.rows[0].license_id
    if (status === 'approved') {
      await query('UPDATE licenses SET expires_at=COALESCE(expires_at,NOW()) + INTERVAL 30 DAY WHERE id=?', [licId])
    }
    await query(
      `UPDATE renew_requests SET status=?, processed_at=NOW(), processed_by_admin_id=? WHERE id=?`,
      [status, req.user.id, id]
    )
    res.json({ id, status })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
})

// Delete license
router.delete('/licenses/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    await query('DELETE FROM licenses WHERE id=?', [id])
    res.json({ id, deleted: true })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
})

// Extend license
router.post('/licenses/:id/extend', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { additionalMonths } = req.body
    if (!additionalMonths || additionalMonths < 1) {
      return res.status(400).json({ error: 'invalid_months' })
    }
    await query(
      `UPDATE licenses SET expires_at=COALESCE(expires_at,NOW()) + INTERVAL ? MONTH WHERE id=?`,
      [Number(additionalMonths), id]
    )
    const r = await query('SELECT expires_at FROM licenses WHERE id=?', [id])
    res.json({ id, expires_at: r.rows[0]?.expires_at })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
})

// Remove device from license
router.delete('/licenses/:licenseId/devices/:deviceHash', requireAdmin, async (req, res) => {
  try {
    const licenseId = Number(req.params.licenseId)
    const deviceHash = String(req.params.deviceHash)
    await query('DELETE FROM activations WHERE license_id=? AND device_hash=?', [licenseId, deviceHash])
    res.json({ licenseId, deviceHash, removed: true })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
})

export default router
