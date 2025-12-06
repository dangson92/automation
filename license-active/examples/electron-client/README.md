# Electron Client - License Example

Code mẫu tích hợp license vào ứng dụng Electron/NodeJS.

## Cấu trúc

```
electron-client/
├── licenseManager.js       # Class quản lý license (core)
├── main.js                 # Main process Electron (integration example)
├── license-input.html      # UI nhập license key
├── public.pem              # Public key để verify token
├── package.json            # Dependencies
└── README.md               # Tài liệu này
```

## Cài đặt

```bash
cd examples/electron-client
npm install
```

## Lấy Public Key

1. Trên server, bạn đã tạo Private Key trong file `.env`
2. Từ Private Key, tạo Public Key:

```bash
# Giả sử private key đã lưu trong file private.pem
openssl rsa -in private.pem -pubout -out public.pem

# Copy nội dung public.pem vào file examples/electron-client/public.pem
cat public.pem
```

3. Thay thế nội dung file `public.pem` bằng Public Key của bạn

## Cấu hình

Mở file `main.js` và cấu hình:

```javascript
const licenseManager = new LicenseManager({
  serverUrl: 'https://api.dangthanhson.com',     // URL API backend
  appCode: 'APP001',                              // Mã app (phải khớp với DB)
  appVersion: app.getVersion(),
  publicKey: PUBLIC_KEY,
  configDir: path.join(app.getPath('userData'), 'license')
})
```

## Chạy ứng dụng

```bash
npm start
```

## Quy trình hoạt động

### 1. Lần đầu chạy (chưa có license)

- App khởi động → kiểm tra license
- Không tìm thấy token → hiển thị dialog yêu cầu nhập license key
- User nhập license key (ví dụ: `ABCD-1234-EFGH`)
- App gọi API `/activate` lên server với:
  - `licenseKey`: ABCD-1234-EFGH
  - `appCode`: APP001
  - `deviceId`: (tự động sinh từ phần cứng)
  - `appVersion`: 1.0.0
- Server kiểm tra và trả về JWT token (30 ngày)
- App lưu token vào file `license_token.json`
- Cho phép user vào app

### 2. Lần sau chạy (đã có license)

- App khởi động → đọc token từ file
- Verify token bằng Public Key (offline, không cần internet)
- Kiểm tra:
  - Token chưa hết hạn
  - appCode khớp
  - deviceId khớp (token bị bind với máy)
  - licenseStatus = 'active'
- Nếu hợp lệ → cho vào app
- Nếu không hợp lệ → yêu cầu activate lại

### 3. Token hết hạn (sau 30 ngày)

- Token hết hạn → app yêu cầu activate lại
- User nhập lại license key (cùng key cũ)
- Server kiểm tra:
  - License vẫn còn hạn
  - Máy này đã activate trước đó
  - Cập nhật `last_checkin_at`
  - Cấp token mới 30 ngày

## API của LicenseManager

### Constructor

```javascript
const licenseManager = new LicenseManager({
  serverUrl: 'https://your-server.com',
  appCode: 'APP_CODE',
  appVersion: '1.0.0',
  publicKey: 'RSA PUBLIC KEY',
  configDir: '/path/to/config' // optional
})
```

### Methods

#### `activateLicense(licenseKey)`

Kích hoạt license với server.

```javascript
try {
  const result = await licenseManager.activateLicense('ABCD-1234-EFGH')
  console.log('Activated:', result)
} catch (error) {
  console.error('Activation failed:', error.message)
}
```

#### `verifyLicenseToken()`

Xác thực token đã lưu (offline).

```javascript
const verification = licenseManager.verifyLicenseToken()
if (verification.valid) {
  console.log('License valid:', verification.payload)
} else {
  console.log('License invalid:', verification.error)
}
```

#### `getLicenseStatus()`

Lấy trạng thái license hiện tại.

```javascript
const status = licenseManager.getLicenseStatus()
if (status.active) {
  console.log('License active:', status.info)
} else {
  console.log('License inactive:', status.error)
}
```

#### `clearLicense()`

Xóa token (để test hoặc deactivate).

```javascript
licenseManager.clearLicense()
```

#### `getOrCreateDeviceId()`

Lấy Device ID của máy hiện tại.

```javascript
const deviceId = licenseManager.getOrCreateDeviceId()
console.log('Device ID:', deviceId)
```

## Bảo mật

### ✅ Đã làm:

1. **Token binding**: Token bị bind với Device ID (không thể copy sang máy khác)
2. **Offline verification**: Client verify token bằng Public Key (không cần internet mỗi lần mở app)
3. **Token expiration**: Token hết hạn sau 30 ngày (force re-activate)
4. **Device fingerprinting**: Device ID dựa trên hostname, username, MAC address, platform
5. **JWT RS256**: Dùng RSA để ký token (server có Private Key, client có Public Key)

### ⚠️ Lưu ý:

1. **Obfuscate code**: Nên obfuscate code Electron để tránh reverse engineering
2. **Multiple check points**: Gọi `checkLicenseAtCriticalPoint()` ở nhiều nơi trong app
3. **Anti-tamper**: Kiểm tra integrity của file `license_token.json`
4. **Network check**: Định kỳ gọi server để check license (không chỉ dựa vào token offline)

### Gợi ý nâng cao:

```javascript
// Thêm check license ở các điểm quan trọng
function performCriticalOperation() {
  // Check license trước khi thực hiện
  const { checkLicenseAtCriticalPoint } = require('./main')
  checkLicenseAtCriticalPoint()

  // Thực hiện operation
  // ...
}
```

## Tích hợp vào app của bạn

1. Copy `licenseManager.js` vào project
2. Copy `public.pem` (Public Key từ server)
3. Import và sử dụng trong main process:

```javascript
const LicenseManager = require('./licenseManager')
const fs = require('fs')

const PUBLIC_KEY = fs.readFileSync('./public.pem', 'utf8')

const licenseManager = new LicenseManager({
  serverUrl: 'https://your-server.com',
  appCode: 'YOUR_APP_CODE',
  appVersion: '1.0.0',
  publicKey: PUBLIC_KEY
})

// Kiểm tra license khi khởi động
app.whenReady().then(async () => {
  const status = licenseManager.getLicenseStatus()

  if (!status.active) {
    // Hiển thị UI nhập license
    // ...
  } else {
    // Cho vào app
    createMainWindow()
  }
})
```

## Test

### Test với license hợp lệ:

1. Tạo app trên server admin panel (appCode: APP001)
2. Tạo license cho user (user_id, app_id, max_devices: 3)
3. Lấy license key (ví dụ: ABCD-1234-EFGH)
4. Chạy client → nhập license key → activate thành công

### Test các trường hợp lỗi:

1. **License không tồn tại**: Nhập key sai → lỗi 404
2. **License hết hạn**: Set `expires_at` trong quá khứ → lỗi "license_expired"
3. **License bị revoke**: Set `status = 'revoked'` → lỗi "license_inactive"
4. **Vượt max_devices**: Activate trên 4 máy (max_devices=3) → lỗi "max_devices_reached"
5. **Token hết hạn**: Đợi 30 ngày hoặc sửa exp trong token → yêu cầu activate lại

## Troubleshooting

### Lỗi: "Token verification failed"

- Kiểm tra Public Key có đúng không (phải khớp với Private Key trên server)
- Kiểm tra token trong file `license_token.json`

### Lỗi: "Token is bound to different device"

- Device ID đã thay đổi (thay phần cứng, đổi hostname, ...)
- Cần activate lại license trên máy mới

### Lỗi: "max_devices_reached"

- License đã được kích hoạt trên số lượng máy tối đa
- Liên hệ admin để tăng `max_devices` hoặc xóa device cũ

## License

MIT
