const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');

/**
 * License Client for Electron Apps
 *
 * This library handles license activation and validation on the client side.
 */
class LicenseClient {
  /**
   * @param {Object} config
   * @param {string} config.appCode - Application code (e.g., 'PROMPTFLOW_DESKTOP')
   * @param {string} config.appVersion - Application version
   * @param {string} config.serverUrl - License server URL (e.g., 'https://api.dangthanhson.com')
   * @param {string} config.publicKey - RSA public key for token verification
   * @param {string} config.dataPath - Path to store license data (optional, defaults to userData)
   */
  constructor(config) {
    this.appCode = config.appCode;
    this.appVersion = config.appVersion || '1.0.0';
    this.serverUrl = config.serverUrl.replace(/\/$/, ''); // Remove trailing slash
    this.publicKey = config.publicKey;
    this.dataPath = config.dataPath || this._getDefaultDataPath();

    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    this.tokenPath = path.join(this.dataPath, 'license_token.json');
    this.deviceId = this._getDeviceId();
  }

  /**
   * Get default data path
   */
  _getDefaultDataPath() {
    const home = os.homedir();
    return path.join(home, '.promptflow', 'license');
  }

  /**
   * Generate a unique device ID based on system info
   * This ID is used to identify the machine
   */
  _getDeviceId() {
    try {
      // Try to use node-machine-id for hardware-based ID
      const { machineIdSync } = require('node-machine-id');
      return machineIdSync();
    } catch (err) {
      // Fallback: generate ID from system info
      const systemInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        username: os.userInfo().username
      };

      const infoString = JSON.stringify(systemInfo);
      return crypto.createHash('sha256').update(infoString).digest('hex');
    }
  }

  /**
   * Activate license with the server
   * @param {string} licenseKey - License key to activate
   * @returns {Promise<Object>} Activation result
   */
  async activate(licenseKey) {
    try {
      const response = await axios.post(`${this.serverUrl}/activate`, {
        licenseKey,
        appCode: this.appCode,
        deviceId: this.deviceId,
        appVersion: this.appVersion
      });

      const { token, expiresAt, license } = response.data;

      // Save token to file
      const tokenData = {
        token,
        expiresAt,
        licenseKey,
        activatedAt: new Date().toISOString(),
        license
      };

      fs.writeFileSync(this.tokenPath, JSON.stringify(tokenData, null, 2), 'utf8');

      return {
        success: true,
        message: 'License activated successfully',
        expiresAt: license.expiresAt
      };

    } catch (err) {
      if (err.response) {
        // Server responded with error
        return {
          success: false,
          error: err.response.data.error || 'Activation failed'
        };
      } else {
        // Network error
        return {
          success: false,
          error: 'Cannot connect to license server'
        };
      }
    }
  }

  /**
   * Verify stored license token
   * @returns {Object} Verification result
   */
  verifyLicense() {
    try {
      // Check if token file exists
      if (!fs.existsSync(this.tokenPath)) {
        return {
          valid: false,
          error: 'No license found'
        };
      }

      // Read token data
      const tokenData = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
      const { token } = tokenData;

      // Verify JWT with public key
      const decoded = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256']
      });

      // Check if token is for this app
      if (decoded.appCode !== this.appCode) {
        return {
          valid: false,
          error: 'License is for different application'
        };
      }

      // Check if token is for this device
      const currentDeviceHash = crypto
        .createHash('sha256')
        .update(this.deviceId + 'DEVICE_SALT_PLACEHOLDER')
        .digest('hex');

      // Note: We can't fully verify device hash on client side without knowing the salt
      // This is just a basic check

      // Check license expiration (if specified)
      if (tokenData.license && tokenData.license.expiresAt) {
        const expiresAt = new Date(tokenData.license.expiresAt);
        const now = new Date();

        if (expiresAt < now) {
          return {
            valid: false,
            error: 'License has expired',
            expiresAt: tokenData.license.expiresAt
          };
        }
      }

      return {
        valid: true,
        licenseKey: tokenData.licenseKey,
        expiresAt: tokenData.license?.expiresAt,
        activatedAt: tokenData.activatedAt
      };

    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return {
          valid: false,
          error: 'License token has expired, please re-activate'
        };
      } else if (err.name === 'JsonWebTokenError') {
        return {
          valid: false,
          error: 'Invalid license token'
        };
      } else {
        return {
          valid: false,
          error: 'License verification failed: ' + err.message
        };
      }
    }
  }

  /**
   * Remove stored license
   */
  removeLicense() {
    if (fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath);
    }
  }

  /**
   * Get license info without full verification
   */
  getLicenseInfo() {
    try {
      if (!fs.existsSync(this.tokenPath)) {
        return null;
      }

      const tokenData = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));

      return {
        licenseKey: tokenData.licenseKey,
        activatedAt: tokenData.activatedAt,
        expiresAt: tokenData.license?.expiresAt
      };

    } catch (err) {
      return null;
    }
  }
}

module.exports = LicenseClient;
