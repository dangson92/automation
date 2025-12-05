/**
 * License Manager for Electron/Node Client
 *
 * Quản lý kích hoạt và xác thực license cho ứng dụng Electron/NodeJS
 */

const crypto = require('crypto')
const os = require('os')
const fs = require('fs')
const path = require('path')
const jwt = require('jsonwebtoken')

class LicenseManager {
  constructor(config) {
    this.serverUrl = config.serverUrl || 'https://api.dangthanhson.com'
    this.appCode = config.appCode // Mã app (ví dụ: 'APP001')
    this.appVersion = config.appVersion || '1.0.0'
    this.publicKey = config.publicKey // RSA Public Key để verify token
    this.configDir = config.configDir || this.getDefaultConfigDir()

    // Đảm bảo thư mục config tồn tại
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true })
    }

    this.deviceIdFile = path.join(this.configDir, 'device_id.txt')
    this.tokenFile = path.join(this.configDir, 'license_token.json')
  }

  /**
   * Lấy thư mục config mặc định theo platform
   */
  getDefaultConfigDir() {
    const homeDir = os.homedir()
    switch (process.platform) {
      case 'win32':
        return path.join(process.env.APPDATA || homeDir, 'PromptFlow')
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', 'PromptFlow')
      default:
        return path.join(homeDir, '.promptflow')
    }
  }

  /**
   * Tạo Device ID duy nhất dựa trên thông tin phần cứng
   * Device ID này sẽ được lưu lại và tái sử dụng
   */
  generateDeviceId() {
    // Lấy thông tin phần cứng
    const hostname = os.hostname()
    const username = os.userInfo().username
    const platform = os.platform()
    const arch = os.arch()

    // Lấy MAC address của network interface đầu tiên
    let macAddress = 'unknown'
    const networkInterfaces = os.networkInterfaces()
    for (const name in networkInterfaces) {
      const iface = networkInterfaces[name].find(i => !i.internal && i.mac !== '00:00:00:00:00:00')
      if (iface && iface.mac) {
        macAddress = iface.mac
        break
      }
    }

    // Tạo chuỗi duy nhất từ các thông tin trên
    const deviceString = `${hostname}|${username}|${platform}|${arch}|${macAddress}`

    // Hash lại để tạo Device ID
    const hash = crypto.createHash('sha256')
    hash.update(deviceString)
    hash.update('device-salt-key') // Salt thêm để tăng độ bảo mật

    return hash.digest('hex')
  }

  /**
   * Lấy hoặc tạo Device ID
   * Nếu đã có file device_id.txt thì đọc từ file, nếu không thì tạo mới
   */
  getOrCreateDeviceId() {
    if (fs.existsSync(this.deviceIdFile)) {
      return fs.readFileSync(this.deviceIdFile, 'utf8').trim()
    }

    const deviceId = this.generateDeviceId()
    fs.writeFileSync(this.deviceIdFile, deviceId, 'utf8')
    return deviceId
  }

  /**
   * Kích hoạt license với server
   * @param {string} licenseKey - License key từ admin
   * @returns {Promise<Object>} - Token và thông tin license
   */
  activateLicense(licenseKey) {
    const deviceId = this.getOrCreateDeviceId()

    return new Promise((resolve, reject) => {
      const https = require('https')
      const http = require('http')
      const url = new URL(`${this.serverUrl}/activate`)

      const postData = JSON.stringify({
        licenseKey,
        appCode: this.appCode,
        deviceId,
        appVersion: this.appVersion
      })

      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }

      const httpModule = url.protocol === 'https:' ? https : http
      const req = httpModule.request(options, (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          try {
            const response = JSON.parse(data)

            if (res.statusCode !== 200) {
              reject(new Error(response.error || 'Activation failed'))
              return
            }

            // Lưu token vào file
            fs.writeFileSync(this.tokenFile, JSON.stringify(response, null, 2), 'utf8')

            resolve(response)
          } catch (error) {
            reject(new Error('Invalid server response'))
          }
        })
      })

      req.on('error', (error) => {
        reject(new Error(`License activation failed: ${error.message}`))
      })

      req.write(postData)
      req.end()
    })
  }

  /**
   * Đọc token từ file
   * @returns {Object|null} - Token data hoặc null nếu không có
   */
  getStoredToken() {
    if (!fs.existsSync(this.tokenFile)) {
      return null
    }

    try {
      const content = fs.readFileSync(this.tokenFile, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      return null
    }
  }

  /**
   * Xác thực token license
   * @returns {Object} - { valid: boolean, payload: Object, error: string }
   */
  verifyLicenseToken() {
    const tokenData = this.getStoredToken()

    if (!tokenData || !tokenData.token) {
      return {
        valid: false,
        error: 'No token found. Please activate license first.'
      }
    }

    try {
      // Verify JWT bằng Public Key
      const payload = jwt.verify(tokenData.token, this.publicKey, {
        algorithms: ['RS256']
      })

      // Kiểm tra appCode có khớp không
      if (payload.appCode !== this.appCode) {
        return {
          valid: false,
          error: 'Token is for different app'
        }
      }

      // Kiểm tra deviceHash có khớp với deviceId hiện tại không
      const currentDeviceId = this.getOrCreateDeviceId()
      const expectedHash = this.hashDeviceId(currentDeviceId)

      if (payload.deviceHash !== expectedHash) {
        return {
          valid: false,
          error: 'Token is bound to different device'
        }
      }

      // Kiểm tra license status
      if (payload.licenseStatus !== 'active') {
        return {
          valid: false,
          error: 'License is not active'
        }
      }

      return {
        valid: true,
        payload
      }
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          error: 'Token expired. Please re-activate license.'
        }
      }

      return {
        valid: false,
        error: `Token verification failed: ${error.message}`
      }
    }
  }

  /**
   * Hash device ID theo cùng cách với server
   * (Server dùng DEVICE_SALT từ .env)
   * Client không cần biết DEVICE_SALT, chỉ cần để server verify
   * Hàm này chỉ để demo, thực tế client không cần hash
   */
  hashDeviceId(deviceId) {
    // Lưu ý: Server sẽ hash với DEVICE_SALT
    // Client không cần hash, chỉ gửi deviceId thô lên server
    // Hàm này chỉ để demo kiểm tra
    const hash = crypto.createHash('sha256')
    hash.update(String(deviceId))
    // Không có DEVICE_SALT ở client, server sẽ hash
    return hash.digest('hex')
  }

  /**
   * Xóa token (để force re-activate)
   */
  clearLicense() {
    if (fs.existsSync(this.tokenFile)) {
      fs.unlinkSync(this.tokenFile)
    }
  }

  /**
   * Kiểm tra và lấy trạng thái license
   * @returns {Object} - { active: boolean, info: Object }
   */
  getLicenseStatus() {
    const verification = this.verifyLicenseToken()

    if (!verification.valid) {
      return {
        active: false,
        error: verification.error
      }
    }

    const tokenData = this.getStoredToken()

    return {
      active: true,
      info: {
        appCode: verification.payload.appCode,
        expiresAt: tokenData.licenseInfo?.expires_at,
        maxDevices: verification.payload.maxDevices,
        tokenExpiresAt: tokenData.expiresAt
      }
    }
  }
}

module.exports = LicenseManager
