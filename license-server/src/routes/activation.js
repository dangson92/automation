const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../config/database');
const { privateKey } = require('../config/keys');
const { hashDeviceId } = require('../utils/crypto');

const router = express.Router();

// Rate limiting for activation endpoint
const activationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 requests per IP per 15 minutes
  message: { error: 'Too many activation attempts, please try again later' }
});

/**
 * POST /activate
 * Activate a license for a specific device
 */
router.post('/activate', activationLimiter, async (req, res) => {
  try {
    const { licenseKey, appCode, deviceId, appVersion } = req.body;

    // Validate input
    if (!licenseKey || !appCode || !deviceId) {
      return res.status(400).json({
        error: 'licenseKey, appCode, and deviceId are required'
      });
    }

    // Find app by code
    const [apps] = await db.execute(
      'SELECT id FROM apps WHERE code = ?',
      [appCode]
    );

    if (apps.length === 0) {
      return res.status(404).json({ error: 'Invalid app code' });
    }

    const appId = apps[0].id;

    // Find license
    const [licenses] = await db.execute(
      'SELECT * FROM licenses WHERE license_key = ? AND app_id = ?',
      [licenseKey, appId]
    );

    if (licenses.length === 0) {
      return res.status(404).json({ error: 'Invalid license key' });
    }

    const license = licenses[0];

    // Check license status
    if (license.status !== 'active') {
      return res.status(403).json({
        error: `License is ${license.status}`,
        status: license.status
      });
    }

    // Check expiration
    if (license.expires_at) {
      const expiresAt = new Date(license.expires_at);
      const now = new Date();

      if (expiresAt < now) {
        // Update status to expired
        await db.execute(
          'UPDATE licenses SET status = ? WHERE id = ?',
          ['expired', license.id]
        );

        return res.status(403).json({
          error: 'License has expired',
          expiresAt: license.expires_at
        });
      }
    }

    // Hash device ID
    const deviceHash = hashDeviceId(deviceId);

    // Check if device already activated
    const [existingActivations] = await db.execute(
      'SELECT * FROM activations WHERE license_id = ? AND device_hash = ?',
      [license.id, deviceHash]
    );

    if (existingActivations.length > 0) {
      // Device already activated - update last checkin
      await db.execute(
        'UPDATE activations SET last_checkin_at = NOW() WHERE id = ?',
        [existingActivations[0].id]
      );

      console.log('Device re-activated (checkin):', deviceHash.substring(0, 8));

    } else {
      // New device - check device limit
      const [activeDevices] = await db.execute(
        'SELECT COUNT(*) as count FROM activations WHERE license_id = ? AND status = ?',
        [license.id, 'active']
      );

      const deviceCount = activeDevices[0].count;

      if (deviceCount >= license.max_devices) {
        return res.status(403).json({
          error: `Maximum number of devices (${license.max_devices}) reached`,
          maxDevices: license.max_devices,
          currentDevices: deviceCount
        });
      }

      // Create new activation
      const meta = JSON.stringify({
        appVersion: appVersion || 'unknown',
        activatedAt: new Date().toISOString()
      });

      await db.execute(
        'INSERT INTO activations (license_id, device_hash, status, meta) VALUES (?, ?, ?, ?)',
        [license.id, deviceHash, 'active', meta]
      );

      console.log('New device activated:', deviceHash.substring(0, 8));
    }

    // Generate activation token (JWT signed with private key)
    const tokenPayload = {
      licenseId: license.id,
      appCode: appCode,
      deviceHash: deviceHash,
      licenseStatus: license.status,
      maxDevices: license.max_devices
    };

    const activationToken = jwt.sign(
      tokenPayload,
      privateKey,
      {
        algorithm: 'RS256',
        expiresIn: '30d' // Token valid for 30 days
      }
    );

    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    res.json({
      success: true,
      token: activationToken,
      expiresAt: expiresAt.toISOString(),
      license: {
        expiresAt: license.expires_at,
        status: license.status,
        appCode: appCode,
        maxDevices: license.max_devices
      }
    });

  } catch (err) {
    console.error('Activation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /verify
 * Verify an activation token (optional - for debugging)
 */
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const decoded = jwt.verify(token, privateKey, { algorithms: ['RS256'] });

    res.json({
      success: true,
      valid: true,
      payload: decoded
    });

  } catch (err) {
    res.json({
      success: true,
      valid: false,
      error: err.message
    });
  }
});

module.exports = router;
