const express = require('express');
const db = require('../config/database');
const { requireUser } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(requireUser);

/**
 * GET /user/licenses
 * Get all licenses owned by the current user
 */
router.get('/licenses', async (req, res) => {
  try {
    const userId = req.user.id;

    const [licenses] = await db.execute(`
      SELECT
        l.id,
        l.license_key,
        l.max_devices,
        l.expires_at,
        l.status,
        l.created_at,
        a.code as app_code,
        a.name as app_name
      FROM licenses l
      JOIN apps a ON l.app_id = a.id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC
    `, [userId]);

    res.json({
      success: true,
      licenses: licenses.map(l => ({
        id: l.id,
        licenseKey: l.license_key,
        appCode: l.app_code,
        appName: l.app_name,
        maxDevices: l.max_devices,
        expiresAt: l.expires_at,
        status: l.status,
        createdAt: l.created_at
      }))
    });

  } catch (err) {
    console.error('Get licenses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /user/licenses/:id
 * Get details of a specific license (only if owned by user)
 */
router.get('/licenses/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const licenseId = req.params.id;

    // Get license info
    const [licenses] = await db.execute(`
      SELECT
        l.id,
        l.license_key,
        l.max_devices,
        l.expires_at,
        l.status,
        l.created_at,
        l.meta,
        a.code as app_code,
        a.name as app_name
      FROM licenses l
      JOIN apps a ON l.app_id = a.id
      WHERE l.id = ? AND l.user_id = ?
    `, [licenseId, userId]);

    if (licenses.length === 0) {
      return res.status(404).json({ error: 'License not found' });
    }

    const license = licenses[0];

    // Get activations
    const [activations] = await db.execute(`
      SELECT
        device_hash,
        first_activated_at,
        last_checkin_at,
        status
      FROM activations
      WHERE license_id = ?
      ORDER BY first_activated_at DESC
    `, [licenseId]);

    res.json({
      success: true,
      license: {
        id: license.id,
        licenseKey: license.license_key,
        appCode: license.app_code,
        appName: license.app_name,
        maxDevices: license.max_devices,
        expiresAt: license.expires_at,
        status: license.status,
        createdAt: license.created_at,
        meta: license.meta
      },
      activations: activations.map(a => ({
        deviceHash: a.device_hash.substring(0, 8) + '...', // Only show first 8 chars
        firstActivatedAt: a.first_activated_at,
        lastCheckinAt: a.last_checkin_at,
        status: a.status
      }))
    });

  } catch (err) {
    console.error('Get license details error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /user/licenses/:id/renew-requests
 * Create a renewal request for a license
 */
router.post('/licenses/:id/renew-requests', async (req, res) => {
  try {
    const userId = req.user.id;
    const licenseId = req.params.id;
    const { message } = req.body;

    // Verify license belongs to user
    const [licenses] = await db.execute(
      'SELECT id FROM licenses WHERE id = ? AND user_id = ?',
      [licenseId, userId]
    );

    if (licenses.length === 0) {
      return res.status(404).json({ error: 'License not found' });
    }

    // Check if there's already a pending request
    const [existing] = await db.execute(
      'SELECT id FROM renew_requests WHERE license_id = ? AND status = ?',
      [licenseId, 'pending']
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'You already have a pending renewal request for this license' });
    }

    // Create renewal request
    const [result] = await db.execute(
      'INSERT INTO renew_requests (user_id, license_id, message, status) VALUES (?, ?, ?, ?)',
      [userId, licenseId, message || '', 'pending']
    );

    res.json({
      success: true,
      requestId: result.insertId,
      message: 'Renewal request submitted successfully'
    });

  } catch (err) {
    console.error('Create renewal request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /user/renew-requests
 * Get all renewal requests for the current user
 */
router.get('/renew-requests', async (req, res) => {
  try {
    const userId = req.user.id;

    const [requests] = await db.execute(`
      SELECT
        rr.id,
        rr.license_id,
        rr.message,
        rr.status,
        rr.created_at,
        rr.processed_at,
        rr.admin_notes,
        l.license_key,
        a.name as app_name
      FROM renew_requests rr
      JOIN licenses l ON rr.license_id = l.id
      JOIN apps a ON l.app_id = a.id
      WHERE rr.user_id = ?
      ORDER BY rr.created_at DESC
    `, [userId]);

    res.json({
      success: true,
      requests: requests.map(r => ({
        id: r.id,
        licenseId: r.license_id,
        licenseKey: r.license_key,
        appName: r.app_name,
        message: r.message,
        status: r.status,
        createdAt: r.created_at,
        processedAt: r.processed_at,
        adminNotes: r.admin_notes
      }))
    });

  } catch (err) {
    console.error('Get renewal requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
