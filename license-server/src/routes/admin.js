const express = require('express');
const db = require('../config/database');
const { requireUser, requireAdmin } = require('../middleware/auth');
const { generateLicenseKey } = require('../utils/crypto');

const router = express.Router();

// All routes require admin authentication
router.use(requireUser);
router.use(requireAdmin);

/**
 * GET /admin/users
 * Get list of all users
 */
router.get('/users', async (req, res) => {
  try {
    const [users] = await db.execute(`
      SELECT id, email, full_name, role, created_at, last_login_at
      FROM users
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        createdAt: u.created_at,
        lastLoginAt: u.last_login_at
      }))
    });

  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/apps
 * Get list of all apps
 */
router.get('/apps', async (req, res) => {
  try {
    const [apps] = await db.execute('SELECT * FROM apps ORDER BY created_at DESC');

    res.json({
      success: true,
      apps
    });

  } catch (err) {
    console.error('Get apps error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/licenses
 * Get list of all licenses (with optional filters)
 */
router.get('/licenses', async (req, res) => {
  try {
    const { userId, appId, status } = req.query;

    let query = `
      SELECT
        l.id,
        l.license_key,
        l.max_devices,
        l.expires_at,
        l.status,
        l.created_at,
        l.meta,
        u.email as user_email,
        u.full_name as user_name,
        a.code as app_code,
        a.name as app_name
      FROM licenses l
      JOIN users u ON l.user_id = u.id
      JOIN apps a ON l.app_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      query += ' AND l.user_id = ?';
      params.push(userId);
    }

    if (appId) {
      query += ' AND l.app_id = ?';
      params.push(appId);
    }

    if (status) {
      query += ' AND l.status = ?';
      params.push(status);
    }

    query += ' ORDER BY l.created_at DESC';

    const [licenses] = await db.execute(query, params);

    res.json({
      success: true,
      licenses: licenses.map(l => ({
        id: l.id,
        licenseKey: l.license_key,
        userEmail: l.user_email,
        userName: l.user_name,
        appCode: l.app_code,
        appName: l.app_name,
        maxDevices: l.max_devices,
        expiresAt: l.expires_at,
        status: l.status,
        createdAt: l.created_at,
        meta: l.meta
      }))
    });

  } catch (err) {
    console.error('Get licenses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/licenses
 * Create a new license
 */
router.post('/licenses', async (req, res) => {
  try {
    const { userId, appId, maxDevices, expiresAt, status, meta } = req.body;

    // Validate required fields
    if (!userId || !appId) {
      return res.status(400).json({ error: 'userId and appId are required' });
    }

    // Verify user exists
    const [users] = await db.execute('SELECT id FROM users WHERE id = ?', [userId]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify app exists
    const [apps] = await db.execute('SELECT id FROM apps WHERE id = ?', [appId]);
    if (apps.length === 0) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Generate unique license key
    let licenseKey;
    let attempts = 0;
    while (attempts < 10) {
      licenseKey = generateLicenseKey();
      const [existing] = await db.execute(
        'SELECT id FROM licenses WHERE license_key = ?',
        [licenseKey]
      );
      if (existing.length === 0) break;
      attempts++;
    }

    if (attempts >= 10) {
      return res.status(500).json({ error: 'Failed to generate unique license key' });
    }

    // Create license
    const [result] = await db.execute(`
      INSERT INTO licenses
      (user_id, app_id, license_key, max_devices, expires_at, status, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      appId,
      licenseKey,
      maxDevices || 1,
      expiresAt || null,
      status || 'active',
      meta ? JSON.stringify(meta) : null
    ]);

    res.json({
      success: true,
      licenseId: result.insertId,
      licenseKey
    });

  } catch (err) {
    console.error('Create license error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/licenses/:id
 * Get license details with activations
 */
router.get('/licenses/:id', async (req, res) => {
  try {
    const licenseId = req.params.id;

    // Get license info
    const [licenses] = await db.execute(`
      SELECT
        l.*,
        u.email as user_email,
        u.full_name as user_name,
        a.code as app_code,
        a.name as app_name
      FROM licenses l
      JOIN users u ON l.user_id = u.id
      JOIN apps a ON l.app_id = a.id
      WHERE l.id = ?
    `, [licenseId]);

    if (licenses.length === 0) {
      return res.status(404).json({ error: 'License not found' });
    }

    const license = licenses[0];

    // Get activations
    const [activations] = await db.execute(`
      SELECT *
      FROM activations
      WHERE license_id = ?
      ORDER BY first_activated_at DESC
    `, [licenseId]);

    res.json({
      success: true,
      license: {
        id: license.id,
        licenseKey: license.license_key,
        userId: license.user_id,
        userEmail: license.user_email,
        userName: license.user_name,
        appCode: license.app_code,
        appName: license.app_name,
        maxDevices: license.max_devices,
        expiresAt: license.expires_at,
        status: license.status,
        createdAt: license.created_at,
        meta: license.meta
      },
      activations: activations.map(a => ({
        id: a.id,
        deviceHash: a.device_hash,
        firstActivatedAt: a.first_activated_at,
        lastCheckinAt: a.last_checkin_at,
        status: a.status,
        meta: a.meta
      }))
    });

  } catch (err) {
    console.error('Get license details error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /admin/licenses/:id
 * Update a license
 */
router.patch('/licenses/:id', async (req, res) => {
  try {
    const licenseId = req.params.id;
    const { maxDevices, expiresAt, status, meta } = req.body;

    // Build update query
    const updates = [];
    const params = [];

    if (maxDevices !== undefined) {
      updates.push('max_devices = ?');
      params.push(maxDevices);
    }

    if (expiresAt !== undefined) {
      updates.push('expires_at = ?');
      params.push(expiresAt);
    }

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (meta !== undefined) {
      updates.push('meta = ?');
      params.push(JSON.stringify(meta));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(licenseId);

    await db.execute(
      `UPDATE licenses SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({
      success: true,
      message: 'License updated successfully'
    });

  } catch (err) {
    console.error('Update license error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/renew-requests
 * Get all renewal requests
 */
router.get('/renew-requests', async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT
        rr.*,
        u.email as user_email,
        u.full_name as user_name,
        l.license_key,
        a.name as app_name,
        admin.email as processed_by_email
      FROM renew_requests rr
      JOIN users u ON rr.user_id = u.id
      JOIN licenses l ON rr.license_id = l.id
      JOIN apps a ON l.app_id = a.id
      LEFT JOIN users admin ON rr.processed_by_admin_id = admin.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND rr.status = ?';
      params.push(status);
    }

    query += ' ORDER BY rr.created_at DESC';

    const [requests] = await db.execute(query, params);

    res.json({
      success: true,
      requests: requests.map(r => ({
        id: r.id,
        userId: r.user_id,
        userEmail: r.user_email,
        userName: r.user_name,
        licenseId: r.license_id,
        licenseKey: r.license_key,
        appName: r.app_name,
        message: r.message,
        status: r.status,
        createdAt: r.created_at,
        processedAt: r.processed_at,
        processedByEmail: r.processed_by_email,
        adminNotes: r.admin_notes
      }))
    });

  } catch (err) {
    console.error('Get renewal requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /admin/renew-requests/:id
 * Process a renewal request (approve/reject)
 */
router.patch('/renew-requests/:id', async (req, res) => {
  try {
    const requestId = req.params.id;
    const adminId = req.user.id;
    const { status, adminNotes, extendDays } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "approved" or "rejected"' });
    }

    // Get request details
    const [requests] = await db.execute(
      'SELECT license_id FROM renew_requests WHERE id = ? AND status = ?',
      [requestId, 'pending']
    );

    if (requests.length === 0) {
      return res.status(404).json({ error: 'Pending renewal request not found' });
    }

    const licenseId = requests[0].license_id;

    // Start transaction
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Update renewal request
      await connection.execute(
        `UPDATE renew_requests
         SET status = ?, processed_at = NOW(), processed_by_admin_id = ?, admin_notes = ?
         WHERE id = ?`,
        [status, adminId, adminNotes || null, requestId]
      );

      // If approved, extend license expiration
      if (status === 'approved') {
        const days = extendDays || 30; // Default 30 days

        await connection.execute(
          `UPDATE licenses
           SET expires_at = DATE_ADD(COALESCE(expires_at, NOW()), INTERVAL ? DAY)
           WHERE id = ?`,
          [days, licenseId]
        );
      }

      await connection.commit();

      res.json({
        success: true,
        message: `Renewal request ${status} successfully`
      });

    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error('Process renewal request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
