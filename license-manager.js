/**
 * License Manager for PromptFlow Desktop
 * Handles license validation and activation
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { app } = require('electron');

// ===== CONFIGURATION =====
const LICENSE_CONFIG = {
  APP_CODE: 'PROMPTFLOW_DESKTOP',
  APP_VERSION: '1.0.0',
  SERVER_URL: 'https://api.dangthanhson.com', // Change this to your server URL

  // RSA Public Key - paste your public key here
  // Generated from: openssl rsa -in private.pem -pubout -out public.pem
  PUBLIC_KEY: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA... YOUR PUBLIC KEY HERE ...
-----END PUBLIC KEY-----`
};

class LicenseManager {
  constructor() {
    this.dataPath = this._getDataPath();
    this.tokenPath = path.join(this.dataPath, 'license_token.json');
    this.deviceId = this._getDeviceId();

    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
  }

  /**
   * Get data path for storing license
   */
  _getDataPath() {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'license');
  }

  /**
   * Generate unique device ID
   */
  _getDeviceId() {
    const systemInfo = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      username: os.userInfo().username,
      cpus: os.cpus()[0]?.model || 'unknown'
    };

    const infoString = JSON.stringify(systemInfo);
    return crypto.createHash('sha256').update(infoString).digest('hex');
  }

  /**
   * Activate license with server
   */
  activate(licenseKey) {
    return new Promise((resolve) => {
      const postData = JSON.stringify({
        licenseKey,
        appCode: LICENSE_CONFIG.APP_CODE,
        deviceId: this.deviceId,
        appVersion: LICENSE_CONFIG.APP_VERSION
      });

      const url = new URL(LICENSE_CONFIG.SERVER_URL + '/activate');
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = httpModule.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);

            if (res.statusCode === 200 && response.success) {
              // Save token
              const tokenData = {
                token: response.token,
                expiresAt: response.expiresAt,
                licenseKey,
                activatedAt: new Date().toISOString(),
                license: response.license
              };

              fs.writeFileSync(
                this.tokenPath,
                JSON.stringify(tokenData, null, 2),
                'utf8'
              );

              resolve({
                success: true,
                message: 'License activated successfully',
                expiresAt: response.license.expiresAt
              });
            } else {
              resolve({
                success: false,
                error: response.error || 'Activation failed'
              });
            }
          } catch (err) {
            resolve({
              success: false,
              error: 'Invalid server response'
            });
          }
        });
      });

      req.on('error', (err) => {
        resolve({
          success: false,
          error: 'Cannot connect to license server: ' + err.message
        });
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Verify license (simple version without JWT verification)
   * In production, you should verify JWT signature with public key
   */
  verifyLicense() {
    try {
      // Check if token file exists
      if (!fs.existsSync(this.tokenPath)) {
        return {
          valid: false,
          error: 'No license found. Please activate your license.'
        };
      }

      // Read token data
      const tokenData = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));

      // Basic validation
      if (!tokenData.token || !tokenData.licenseKey) {
        return {
          valid: false,
          error: 'Invalid license data'
        };
      }

      // Check token expiration (30 days from activation)
      const activatedAt = new Date(tokenData.activatedAt);
      const now = new Date();
      const daysSinceActivation = (now - activatedAt) / (1000 * 60 * 60 * 24);

      if (daysSinceActivation > 30) {
        return {
          valid: false,
          error: 'License token expired. Please re-activate your license.',
          needReactivation: true
        };
      }

      // Check license expiration
      if (tokenData.license && tokenData.license.expiresAt) {
        const expiresAt = new Date(tokenData.license.expiresAt);

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
      return {
        valid: false,
        error: 'License verification failed: ' + err.message
      };
    }
  }

  /**
   * Get license info
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

  /**
   * Remove license
   */
  removeLicense() {
    if (fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath);
    }
  }
}

module.exports = LicenseManager;
