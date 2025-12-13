# PROMPT: Tạo hệ thống License Validation cho Phần mềm

## YÊU CẦU TỔNG QUAN

Tạo một hệ thống quản lý và kiểm tra license hoàn chỉnh cho phần mềm desktop/web application với các tính năng sau:

### Kiến trúc hệ thống
- **Client-side**: Ứng dụng cần được cấp phép
- **Server-side**: License server để quản lý và xác thực license
- **Database**: Lưu trữ thông tin license, user, và device activation

---

## PHẦN 1: CÁC THÀNH PHẦN CẦN IMPLEMENT

### 1.1. License Manager (Client-side)

Tạo một class `LicenseManager` với các chức năng:

**A. Device Fingerprinting**
```
Yêu cầu:
- Tạo Device ID duy nhất từ thông tin phần cứng
- Thông tin cần thu thập:
  + Hostname
  + Username
  + Platform (Windows/macOS/Linux)
  + Architecture (x64, arm64, etc)
  + MAC Address (từ network interface đầu tiên)
- Hash bằng SHA256 với salt bí mật
- Lưu Device ID vào file local để tái sử dụng

Vị trí lưu Device ID:
- Windows: %APPDATA%/<AppName>/license/device_id.txt
- macOS: ~/Library/Application Support/<AppName>/license/device_id.txt
- Linux: ~/.config/<AppName>/license/device_id.txt
```

**B. License Activation**
```
Chức năng: activateLicense(licenseKey)

Luồng xử lý:
1. Lấy hoặc tạo Device ID
2. Gửi POST request đến server endpoint /activate với:
   {
     licenseKey: string,
     appCode: string,        // Mã định danh app
     deviceId: string,       // Device ID đã hash
     appVersion: string,
     platform: string
   }
3. Nhận response:
   - Success: { success: true, token: JWT_TOKEN, licenseInfo: {...} }
   - Error: { success: false, error: ERROR_CODE, message: string }
4. Lưu JWT token vào file: license_token.json
5. Return kết quả

Xử lý lỗi:
- invalid_input: Thông tin không hợp lệ
- app_not_found: App code không tồn tại
- license_not_found: License key không đúng
- license_inactive: License đã bị vô hiệu hóa
- license_expired: License đã hết hạn
- max_devices_reached: Đã đạt giới hạn số thiết bị
- server_error: Lỗi server
```

**C. Token Verification (Offline)**
```
Chức năng: verifyLicenseToken()

Yêu cầu:
1. Đọc JWT token từ file local
2. Verify token bằng RSA Public Key:
   - Algorithm: RS256
   - Public Key: Embed trong app hoặc download từ server
3. Kiểm tra các claims trong token:
   - appCode: Phải khớp với app hiện tại
   - licenseStatus: Phải là 'active'
   - exp: Token chưa hết hạn
   - deviceHash: Phải khớp với device hiện tại
4. Return: { valid: boolean, payload: object, error: string }

Nếu token không hợp lệ:
- Xóa file license_token.json
- Yêu cầu người dùng activate lại
```

**D. License Status Check**
```
Chức năng: getLicenseStatus()

Return:
{
  active: boolean,
  info: {
    appCode: string,
    userEmail: string,
    userName: string,
    expiresAt: datetime,      // Hạn license
    tokenExpiresAt: datetime, // Hạn token (30 ngày)
    maxDevices: number,
    offlineMode: boolean      // Nếu không kết nối được server
  }
}
```

**E. Check-in với Server**
```
Chức năng: checkInWithServer()

Mục đích:
- Xác minh device vẫn được phép sử dụng
- Gia hạn token tự động
- Update trạng thái license mới nhất

Luồng xử lý:
1. Đọc token hiện tại
2. Gửi POST /check-in với:
   {
     token: JWT_TOKEN,
     appCode: string,
     deviceId: string,
     appVersion: string
   }
3. Server kiểm tra:
   - Token signature hợp lệ
   - Device vẫn active
   - License chưa bị revoke
   - License chưa expire
4. Nhận new token (gia hạn thêm 30 ngày)
5. Update file license_token.json

Offline fallback:
- Nếu không kết nối được server
- Cho phép app chạy với token cũ (nếu còn hạn)
- Set flag offlineMode = true
```

---

### 1.2. License Server (Backend)

**A. Database Schema**

Tạo 5 bảng sau:

```sql
-- Bảng 1: Users (Người dùng)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role ENUM('user', 'admin') DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME,
    INDEX idx_email (email)
);

-- Bảng 2: Apps (Ứng dụng cần license)
CREATE TABLE apps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,    -- Mã định danh app (vd: "MY_APP_V1")
    name VARCHAR(255) NOT NULL,          -- Tên app
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_code (code)
);

-- Bảng 3: Licenses (License keys)
CREATE TABLE licenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    app_id INT NOT NULL,
    license_key VARCHAR(255) UNIQUE NOT NULL,
    max_devices INT DEFAULT 1,           -- Số thiết bị tối đa
    expires_at DATETIME,                 -- NULL = vĩnh viễn
    status ENUM('active', 'revoked', 'expired') DEFAULT 'active',
    meta JSON,                           -- Thông tin thêm
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
    INDEX idx_license_key (license_key),
    INDEX idx_user_app (user_id, app_id)
);

-- Bảng 4: Activations (Thiết bị đã kích hoạt)
CREATE TABLE activations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    license_id INT NOT NULL,
    device_hash VARCHAR(255) NOT NULL,   -- Hash của Device ID
    device_info JSON,                    -- Thông tin thiết bị (platform, version, etc)
    first_activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_checkin_at DATETIME,            -- Lần check-in cuối
    status ENUM('active', 'banned') DEFAULT 'active',
    FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
    UNIQUE KEY unique_device (license_id, device_hash),
    INDEX idx_license (license_id),
    INDEX idx_last_checkin (last_checkin_at)
);

-- Bảng 5: Renew Requests (Yêu cầu gia hạn)
CREATE TABLE renew_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    license_id INT NOT NULL,
    message TEXT,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    processed_by_admin_id INT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
    FOREIGN KEY (processed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status)
);
```

**B. API Endpoints**

Implement các endpoints sau:

**1. POST /activate - Kích hoạt License**

```javascript
Input:
{
  licenseKey: string,    // Required
  appCode: string,       // Required
  deviceId: string,      // Required
  appVersion: string,
  platform: string
}

Xử lý:
1. Validate input
   - licenseKey, appCode, deviceId là required

2. Tìm app theo appCode
   - Nếu không tìm thấy → return { success: false, error: 'app_not_found' }

3. Tìm license theo licenseKey + app_id
   - Nếu không tìm thấy → return { success: false, error: 'license_not_found' }

4. Kiểm tra trạng thái license:
   - status != 'active' → return { success: false, error: 'license_inactive' }
   - expires_at < NOW() → return { success: false, error: 'license_expired' }

5. Hash deviceId với salt từ .env:
   deviceHash = SHA256(deviceId + DEVICE_SALT)

6. Kiểm tra activation:
   a. Tìm activation với license_id + deviceHash
   b. Nếu tìm thấy:
      - Update last_checkin_at = NOW()
   c. Nếu không tìm thấy (thiết bị mới):
      - Đếm số activations hiện tại cho license này
      - Nếu count >= max_devices → return {
          success: false,
          error: 'max_devices_reached',
          message: 'Đã đạt giới hạn thiết bị'
        } (HTTP 429)
      - Nếu còn slot → Tạo record mới trong bảng activations

7. Tạo JWT token:
   - Algorithm: RS256 (RSA with SHA256)
   - Private Key: Lấy từ environment variable
   - Expiration: 30 ngày
   - Payload:
     {
       licenseId: number,
       appCode: string,
       deviceHash: string,
       licenseStatus: string,
       maxDevices: number,
       appVersion: string,
       userEmail: string,
       userName: string,
       iat: timestamp,
       exp: timestamp
     }

8. Return success:
   {
     success: true,
     token: JWT_TOKEN,
     licenseInfo: {
       appCode: string,
       expiresAt: datetime,
       maxDevices: number,
       tokenExpiresAt: datetime
     }
   }

Rate limiting: 100 requests / 15 phút per IP
```

**2. POST /check-in - Xác minh và gia hạn token**

```javascript
Input:
{
  token: string,       // Required
  appCode: string,     // Required
  deviceId: string,    // Required
  appVersion: string
}

Xử lý:
1. Verify JWT token:
   - Decode và verify signature bằng Public Key
   - Nếu invalid → return { success: false, error: 'invalid_token' }

2. Kiểm tra appCode:
   - token.appCode != input.appCode → return { success: false, error: 'app_mismatch' }

3. Hash và kiểm tra deviceId:
   deviceHash = SHA256(deviceId + DEVICE_SALT)
   - token.deviceHash != deviceHash → return {
       success: false,
       error: 'device_mismatch',
       message: 'Token này thuộc về thiết bị khác'
     }

4. Kiểm tra activation trong database:
   SELECT a.*, l.status as license_status, l.expires_at
   FROM activations a
   JOIN licenses l ON a.license_id = l.id
   WHERE a.license_id = token.licenseId
     AND a.device_hash = deviceHash

   - Nếu không tìm thấy → return { success: false, error: 'activation_not_found' }
   - Nếu a.status = 'banned' → return { success: false, error: 'device_banned' }
   - Nếu l.status != 'active' → return { success: false, error: 'license_revoked' }
   - Nếu l.expires_at < NOW() → return { success: false, error: 'license_expired' }

5. Update last_checkin_at:
   UPDATE activations
   SET last_checkin_at = NOW()
   WHERE id = activation.id

6. Tạo token mới (gia hạn):
   - Same payload như token cũ
   - Expiration: NOW() + 30 ngày

7. Return success:
   {
     success: true,
     active: true,
     status: 'active',
     newToken: NEW_JWT_TOKEN,
     expiresAt: license.expires_at,
     message: 'Check-in thành công'
   }

Offline fallback (client-side):
- Nếu request thất bại do network
- Client accept token cũ nếu chưa hết hạn
- Set offlineMode = true
```

**3. Admin APIs**

Implement thêm các endpoint cho admin:

```
GET    /admin/licenses          - Danh sách licenses
POST   /admin/licenses          - Tạo license mới
PUT    /admin/licenses/:id      - Cập nhật license
DELETE /admin/licenses/:id      - Xóa license

GET    /admin/activations       - Danh sách activations
DELETE /admin/activations/:id   - Xóa activation (reset device)
PUT    /admin/activations/:id/ban - Ban device

GET    /admin/renew-requests    - Danh sách yêu cầu gia hạn
POST   /admin/renew-requests/:id/approve - Duyệt gia hạn
POST   /admin/renew-requests/:id/reject  - Từ chối gia hạn
```

**C. RSA Key Pair Generation**

Tạo cặp key RSA-2048 để sign/verify JWT:

```bash
# Generate private key
openssl genrsa -out private_key.pem 2048

# Extract public key
openssl rsa -in private_key.pem -pubout -out public_key.pem
```

Lưu trong `.env`:
```
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE....\n-----END RSA PRIVATE KEY-----"
PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIB....\n-----END PUBLIC KEY-----"
DEVICE_SALT="random_secret_salt_here"
```

**D. Security Headers & Middleware**

```javascript
// helmet.js - Security headers
const helmet = require('helmet');
app.use(helmet());

// rate-limit.js
const rateLimit = require('express-rate-limit');
const activateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 100,                 // 100 requests
  message: 'Too many activation attempts'
});
app.use('/activate', activateLimiter);

// cors.js
const cors = require('cors');
app.use(cors({
  origin: ['https://yourdomain.com'],
  credentials: true
}));

// logging.js
const morgan = require('morgan');
app.use(morgan('combined'));
```

---

## PHẦN 2: LUỒNG HOẠT ĐỘNG

### 2.1. Luồng Activation (Lần đầu)

```
USER                CLIENT                 SERVER              DATABASE
  |                    |                      |                    |
  | 1. Nhập license    |                      |                    |
  |------------------->|                      |                    |
  |                    | 2. Generate DeviceID |                    |
  |                    |--------------------->|                    |
  |                    |                      |                    |
  |                    | 3. POST /activate    |                    |
  |                    | (key, appCode, device)                    |
  |                    |--------------------->|                    |
  |                    |                      | 4. Verify license  |
  |                    |                      |------------------->|
  |                    |                      | 5. Check max_devices|
  |                    |                      |------------------->|
  |                    |                      | 6. Create activation|
  |                    |                      |------------------->|
  |                    |                      | 7. Sign JWT token  |
  |                    |                      |<-------------------|
  |                    | 8. Return token      |                    |
  |                    |<---------------------|                    |
  |                    | 9. Save token.json   |                    |
  |                    |                      |                    |
  | 10. Show success   |                      |                    |
  |<-------------------|                      |                    |
  | 11. Launch app     |                      |                    |
```

### 2.2. Luồng Khởi động App (Đã có license)

```
USER                CLIENT                 SERVER              DATABASE
  |                    |                      |                    |
  | 1. Start app       |                      |                    |
  |------------------->|                      |                    |
  |                    | 2. Read token.json   |                    |
  |                    |--------------------->|                    |
  |                    | 3. Verify signature  |                    |
  |                    | (with Public Key)    |                    |
  |                    |--------------------->|                    |
  |                    | 4. Check expiration  |                    |
  |                    |--------------------->|                    |
  |                    |                      |                    |
  |                    | 5. POST /check-in    |                    |
  |                    | (token, deviceId)    |                    |
  |                    |--------------------->|                    |
  |                    |                      | 6. Verify device   |
  |                    |                      |------------------->|
  |                    |                      | 7. Check license   |
  |                    |                      | still active       |
  |                    |                      |------------------->|
  |                    |                      | 8. Update checkin  |
  |                    |                      |------------------->|
  |                    |                      | 9. Issue new token |
  |                    |                      |<-------------------|
  |                    | 10. Save new token   |                    |
  |                    |<---------------------|                    |
  | 11. App launched   |                      |                    |
  |<-------------------|                      |                    |
```

### 2.3. Luồng Offline Mode

```
USER                CLIENT                 SERVER
  |                    |                      |
  | 1. Start app       |                      |
  | (no internet)      |                      |
  |------------------->|                      |
  |                    | 2. Read token.json   |
  |                    |                      |
  |                    | 3. Verify signature  |
  |                    | (offline with PubKey)|
  |                    |                      |
  |                    | 4. Check expiration  |
  |                    |                      |
  |                    | 5. POST /check-in    |
  |                    |--------------------> X (timeout)
  |                    |                      |
  |                    | 6. Fallback to       |
  |                    | offline mode         |
  |                    |                      |
  | 7. App launched    |                      |
  | (offline mode)     |                      |
  |<-------------------|                      |
```

---

## PHẦN 3: BẢO MẬT VÀ BEST PRACTICES

### 3.1. Device Binding Security

```
Nguyên tắc:
- Token được gắn chặt với device thông qua deviceHash
- deviceHash = SHA256(deviceId + DEVICE_SALT)
- DEVICE_SALT phải giữ bí mật trên server
- Không thể copy token sang thiết bị khác

Implementation:
1. Client gửi deviceId (plaintext) trong mỗi request
2. Server hash lại và so sánh với deviceHash trong token
3. Nếu không khớp → reject request
```

### 3.2. Token Lifecycle Management

```
- Token expiration: 30 ngày
- Auto-renewal: Mỗi lần check-in thành công
- Token không thể bị revoke trực tiếp
- Revoke license → token sẽ fail ở lần check-in tiếp theo

Best practice:
- Check-in ít nhất 1 lần/tuần để đảm bảo sync trạng thái
- Implement periodic check-in (mỗi 24h)
- Graceful degradation khi offline
```

### 3.3. License Revocation

```
Các trường hợp cần revoke:
1. User yêu cầu hủy license
2. Phát hiện sử dụng trái phép
3. Chargeback / refund
4. License hết hạn

Cách revoke:
UPDATE licenses SET status = 'revoked' WHERE id = ?

Effect:
- Tất cả devices sẽ fail ở lần check-in tiếp theo
- Token cũ vẫn valid offline cho đến khi hết hạn
```

### 3.4. Max Devices Limit

```
Enforcement points:
1. Activation: Kiểm tra trước khi tạo activation record
2. Admin panel: Cho phép admin reset/remove devices

User experience:
- Khi đạt limit → hiển thị danh sách devices đã kích hoạt
- Cho phép user deactivate device cũ
- Hoặc yêu cầu admin tăng max_devices
```

### 3.5. Audit Trail

```
Log các events quan trọng:
- License activation
- Check-in requests
- License revocation
- Device bans
- Admin actions

Table: audit_logs
- id, user_id, action, entity_type, entity_id
- details (JSON), ip_address, user_agent
- created_at
```

---

## PHẦN 4: TESTING

### 4.1. Test Cases Client-side

```
1. Test Device ID Generation:
   - Phải tạo ID nhất quán trên cùng một máy
   - Phải khác nhau trên các máy khác nhau

2. Test License Activation:
   - Valid license key → success
   - Invalid license key → error
   - Expired license → error
   - Max devices reached → error

3. Test Token Verification:
   - Valid token → pass
   - Expired token → fail
   - Tampered token → fail
   - Wrong device → fail

4. Test Offline Mode:
   - No internet + valid token → allow
   - No internet + expired token → deny
   - No internet + no token → deny

5. Test Check-in:
   - Success → update token
   - License revoked → deny
   - Device banned → deny
```

### 4.2. Test Cases Server-side

```
1. Test /activate endpoint:
   - Valid request → return token
   - Missing params → 400 error
   - Invalid license → 404 error
   - Max devices → 429 error
   - Rate limiting → 429 after 100 requests

2. Test /check-in endpoint:
   - Valid token → return new token
   - Invalid signature → 401 error
   - Wrong device → 403 error
   - Revoked license → 403 error

3. Test Database Constraints:
   - Duplicate activation → should update, not insert
   - Cascade deletes → delete license should delete activations
   - Unique constraints → license_key, email, etc

4. Test Security:
   - SQL injection attempts → should be blocked
   - XSS in parameters → should be sanitized
   - CSRF protection → should be enabled
```

---

## PHẦN 5: DEPLOYMENT

### 5.1. Environment Variables

```bash
# .env file
NODE_ENV=production
PORT=3000
DATABASE_URL=mysql://user:pass@localhost/license_db

# JWT Keys (RSA-2048)
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# Security
DEVICE_SALT="random_32_char_salt_here_xyz123"
JWT_EXPIRATION=30d
SESSION_SECRET="random_session_secret"

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# CORS
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=$2a$10$...
```

### 5.2. Production Checklist

```
Server:
[ ] HTTPS enabled với SSL certificate
[ ] Rate limiting configured
[ ] CORS properly set
[ ] Security headers (helmet)
[ ] Database backups automated
[ ] Error logging (Sentry, etc)
[ ] Monitoring & alerting
[ ] Load balancing (nếu cần)

Client:
[ ] Public key embedded hoặc securely fetched
[ ] Error handling user-friendly
[ ] Offline mode tested
[ ] Auto-update mechanism
[ ] Logging for debugging

Database:
[ ] Indexes created
[ ] Foreign keys set
[ ] Backup strategy
[ ] Connection pooling
[ ] Query optimization
```

### 5.3. Monitoring

```
Metrics cần track:
- Activation success/failure rate
- Check-in frequency
- Token expiration events
- License revocations
- Active devices per license
- API response times
- Error rates

Tools:
- Prometheus + Grafana
- New Relic / DataDog
- CloudWatch (AWS)
- Custom dashboard
```

---

## PHẦN 6: CODE EXAMPLES

### 6.1. Client-side Example (Node.js/Electron)

```javascript
// license-manager.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const jwt = require('jsonwebtoken');
const axios = require('axios');

class LicenseManager {
  constructor(config) {
    this.appCode = config.appCode;
    this.appVersion = config.appVersion;
    this.serverUrl = config.serverUrl;
    this.publicKey = config.publicKey;
    this.licenseDir = this.getLicenseDir();
  }

  getLicenseDir() {
    const platform = os.platform();
    let baseDir;

    if (platform === 'win32') {
      baseDir = process.env.APPDATA;
    } else if (platform === 'darwin') {
      baseDir = path.join(os.homedir(), 'Library/Application Support');
    } else {
      baseDir = path.join(os.homedir(), '.config');
    }

    const licenseDir = path.join(baseDir, 'YourApp', 'license');
    if (!fs.existsSync(licenseDir)) {
      fs.mkdirSync(licenseDir, { recursive: true });
    }
    return licenseDir;
  }

  getDeviceId() {
    const deviceIdFile = path.join(this.licenseDir, 'device_id.txt');

    if (fs.existsSync(deviceIdFile)) {
      return fs.readFileSync(deviceIdFile, 'utf8');
    }

    // Generate new device ID
    const networkInterfaces = os.networkInterfaces();
    let macAddress = 'unknown';

    for (const iface of Object.values(networkInterfaces)) {
      for (const config of iface) {
        if (!config.internal && config.mac !== '00:00:00:00:00:00') {
          macAddress = config.mac;
          break;
        }
      }
      if (macAddress !== 'unknown') break;
    }

    const deviceInfo = {
      hostname: os.hostname(),
      username: os.userInfo().username,
      platform: os.platform(),
      arch: os.arch(),
      macAddress: macAddress
    };

    const deviceString = JSON.stringify(deviceInfo);
    const hash = crypto.createHash('sha256')
      .update(deviceString + 'YOUR_CLIENT_SALT')
      .digest('hex');

    fs.writeFileSync(deviceIdFile, hash);
    return hash;
  }

  async activateLicense(licenseKey) {
    try {
      const deviceId = this.getDeviceId();

      const response = await axios.post(`${this.serverUrl}/activate`, {
        licenseKey,
        appCode: this.appCode,
        deviceId,
        appVersion: this.appVersion,
        platform: os.platform()
      });

      if (response.data.success) {
        // Save token
        const tokenFile = path.join(this.licenseDir, 'license_token.json');
        fs.writeFileSync(tokenFile, JSON.stringify({
          token: response.data.token,
          licenseInfo: response.data.licenseInfo
        }, null, 2));

        return { success: true, ...response.data };
      } else {
        return { success: false, error: response.data.error };
      }
    } catch (error) {
      return {
        success: false,
        error: 'network_error',
        message: error.message
      };
    }
  }

  verifyLicenseToken() {
    try {
      const tokenFile = path.join(this.licenseDir, 'license_token.json');

      if (!fs.existsSync(tokenFile)) {
        return { valid: false, error: 'no_token' };
      }

      const data = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
      const token = data.token;

      // Verify JWT
      const payload = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256']
      });

      // Check app code
      if (payload.appCode !== this.appCode) {
        return { valid: false, error: 'app_mismatch' };
      }

      // Check license status
      if (payload.licenseStatus !== 'active') {
        return { valid: false, error: 'license_inactive' };
      }

      // Check device
      const currentDevice = this.getDeviceId();
      if (payload.deviceHash !== currentDevice) {
        return { valid: false, error: 'device_mismatch' };
      }

      return { valid: true, payload };

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return { valid: false, error: 'token_expired' };
      }
      return { valid: false, error: error.message };
    }
  }

  async checkInWithServer() {
    try {
      const tokenFile = path.join(this.licenseDir, 'license_token.json');
      const data = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));

      const response = await axios.post(`${this.serverUrl}/check-in`, {
        token: data.token,
        appCode: this.appCode,
        deviceId: this.getDeviceId(),
        appVersion: this.appVersion
      }, { timeout: 10000 });

      if (response.data.success && response.data.newToken) {
        // Update token
        data.token = response.data.newToken;
        fs.writeFileSync(tokenFile, JSON.stringify(data, null, 2));
        return { success: true, offline: false };
      }

      return { success: false, error: response.data.error };

    } catch (error) {
      // Offline fallback
      return { success: true, offline: true };
    }
  }

  getLicenseStatus() {
    const verification = this.verifyLicenseToken();

    if (!verification.valid) {
      return { active: false, error: verification.error };
    }

    return {
      active: true,
      info: {
        appCode: verification.payload.appCode,
        userEmail: verification.payload.userEmail,
        userName: verification.payload.userName,
        maxDevices: verification.payload.maxDevices,
        tokenExpiresAt: new Date(verification.payload.exp * 1000)
      }
    };
  }
}

module.exports = LicenseManager;
```

### 6.2. Server-side Example (Express.js)

```javascript
// server/routes/activate.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');

router.post('/activate', async (req, res) => {
  try {
    const { licenseKey, appCode, deviceId, appVersion, platform } = req.body;

    // 1. Validate input
    if (!licenseKey || !appCode || !deviceId) {
      return res.status(400).json({
        success: false,
        error: 'invalid_input',
        message: 'Missing required fields'
      });
    }

    // 2. Find app
    const [apps] = await db.query(
      'SELECT id FROM apps WHERE code = ?',
      [appCode]
    );

    if (apps.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'app_not_found'
      });
    }

    const appId = apps[0].id;

    // 3. Find license
    const [licenses] = await db.query(
      `SELECT l.*, u.email, u.full_name
       FROM licenses l
       JOIN users u ON l.user_id = u.id
       WHERE l.license_key = ? AND l.app_id = ?`,
      [licenseKey, appId]
    );

    if (licenses.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'license_not_found'
      });
    }

    const license = licenses[0];

    // 4. Check license status
    if (license.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'license_inactive'
      });
    }

    if (license.expires_at && new Date(license.expires_at) < new Date()) {
      return res.status(403).json({
        success: false,
        error: 'license_expired'
      });
    }

    // 5. Hash device ID
    const deviceHash = crypto
      .createHash('sha256')
      .update(deviceId + process.env.DEVICE_SALT)
      .digest('hex');

    // 6. Check activation
    const [existingActivations] = await db.query(
      `SELECT id FROM activations
       WHERE license_id = ? AND device_hash = ?`,
      [license.id, deviceHash]
    );

    if (existingActivations.length > 0) {
      // Update existing activation
      await db.query(
        `UPDATE activations
         SET last_checkin_at = NOW()
         WHERE id = ?`,
        [existingActivations[0].id]
      );
    } else {
      // Check max devices
      const [activeDevices] = await db.query(
        `SELECT COUNT(*) as count
         FROM activations
         WHERE license_id = ? AND status = 'active'`,
        [license.id]
      );

      if (activeDevices[0].count >= license.max_devices) {
        return res.status(429).json({
          success: false,
          error: 'max_devices_reached',
          message: `Maximum ${license.max_devices} devices allowed`
        });
      }

      // Create new activation
      await db.query(
        `INSERT INTO activations
         (license_id, device_hash, device_info, last_checkin_at)
         VALUES (?, ?, ?, NOW())`,
        [license.id, deviceHash, JSON.stringify({ appVersion, platform })]
      );
    }

    // 7. Create JWT token
    const tokenPayload = {
      licenseId: license.id,
      appCode: appCode,
      deviceHash: deviceHash,
      licenseStatus: license.status,
      maxDevices: license.max_devices,
      appVersion: appVersion,
      userEmail: license.email,
      userName: license.full_name
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.PRIVATE_KEY,
      {
        algorithm: 'RS256',
        expiresIn: '30d'
      }
    );

    // 8. Return success
    res.json({
      success: true,
      token: token,
      licenseInfo: {
        appCode: appCode,
        expiresAt: license.expires_at,
        maxDevices: license.max_devices,
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

  } catch (error) {
    console.error('Activation error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Internal server error'
    });
  }
});

module.exports = router;
```

---

## PHẦN 7: CUSTOMIZATION

Tùy chỉnh hệ thống theo nhu cầu:

### 7.1. License Types

```
Thêm các loại license khác nhau:
- trial: Thời gian dùng thử (7-30 ngày)
- personal: Cá nhân (1 thiết bị)
- professional: Chuyên nghiệp (3-5 thiết bị)
- enterprise: Doanh nghiệp (unlimited)

Thêm cột vào bảng licenses:
ALTER TABLE licenses ADD COLUMN license_type ENUM('trial','personal','pro','enterprise');
```

### 7.2. Feature Flags

```
License có thể bật/tắt features:

Thêm vào JWT payload:
{
  ...
  features: {
    exportPDF: true,
    cloudSync: true,
    apiAccess: false,
    teamCollaboration: true
  }
}

Client check:
if (license.features.exportPDF) {
  // Show export button
}
```

### 7.3. Usage Tracking

```
Track usage metrics:
- Số lần mở app
- Thời gian sử dụng
- Features được dùng

Table: usage_logs
- id, license_id, device_hash,
- event_type, event_data (JSON),
- created_at

Gửi kèm check-in request
```

### 7.4. Subscription Model

```
Chuyển sang subscription:
- Thêm cột: billing_cycle (monthly, yearly)
- Thêm cột: next_billing_date
- Auto-renewal logic
- Payment integration (Stripe, PayPal)
- Grace period khi payment fails
```

---

## KẾT LUẬN

Hệ thống license validation này cung cấp:

✅ **Bảo mật cao**: RSA encryption, device binding, token expiration
✅ **Trải nghiệm tốt**: Offline mode, auto-renewal, grace period
✅ **Quản lý linh hoạt**: Admin panel, revocation, device management
✅ **Scalable**: Database-backed, API-based, microservice ready
✅ **Audit trail**: Logging, monitoring, analytics

Áp dụng prompt này để tạo license system cho bất kỳ ứng dụng desktop/web nào.
