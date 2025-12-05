# License Client Library

Client library để tích hợp license validation vào Electron app.

## Cài đặt

```bash
cd license-client
npm install
```

## Sử dụng trong Electron

### 1. Copy thư viện vào project Electron

```bash
cp -r license-client /path/to/your/electron/app/
```

### 2. Thêm public key vào project

Lưu file `public.pem` từ license server vào project Electron của bạn.

### 3. Sử dụng trong code

```javascript
const LicenseClient = require('./license-client/src/index');
const fs = require('fs');
const path = require('path');

// Đọc public key
const publicKey = fs.readFileSync(
  path.join(__dirname, 'keys', 'public.pem'),
  'utf8'
);

// Khởi tạo license client
const licenseClient = new LicenseClient({
  appCode: 'PROMPTFLOW_DESKTOP',
  appVersion: '1.0.0',
  serverUrl: 'https://api.dangthanhson.com',
  publicKey: publicKey
});

// Kiểm tra license
const verification = licenseClient.verifyLicense();

if (verification.valid) {
  console.log('License hợp lệ');
  // Cho phép vào app
} else {
  console.log('License không hợp lệ:', verification.error);
  // Hiển thị dialog yêu cầu nhập license key
}
```

### 4. Activate license

```javascript
// Khi user nhập license key
const result = await licenseClient.activate(licenseKey);

if (result.success) {
  console.log('Kích hoạt thành công!');
} else {
  console.error('Kích hoạt thất bại:', result.error);
}
```

## API

### Constructor

```javascript
new LicenseClient(config)
```

**Config:**
- `appCode` (string): Mã ứng dụng (ví dụ: 'PROMPTFLOW_DESKTOP')
- `appVersion` (string): Phiên bản ứng dụng
- `serverUrl` (string): URL của license server
- `publicKey` (string): RSA public key để verify token

### Methods

#### `activate(licenseKey)`

Kích hoạt license với server.

**Returns:** Promise<Object>

```javascript
{
  success: true,
  message: 'License activated successfully',
  expiresAt: '2024-12-31T23:59:59.000Z'
}
```

#### `verifyLicense()`

Kiểm tra license đã lưu.

**Returns:** Object

```javascript
{
  valid: true,
  licenseKey: 'XXXX-XXXX-XXXX-XXXX',
  expiresAt: '2024-12-31T23:59:59.000Z',
  activatedAt: '2024-01-01T00:00:00.000Z'
}
```

#### `removeLicense()`

Xóa license đã lưu.

#### `getLicenseInfo()`

Lấy thông tin license không kiểm tra tính hợp lệ.

**Returns:** Object | null

## Lưu trữ

License token được lưu tại:
- Windows: `C:\Users\{username}\.promptflow\license\license_token.json`
- macOS: `/Users/{username}/.promptflow/license/license_token.json`
- Linux: `/home/{username}/.promptflow/license/license_token.json`

## Bảo mật

- Public key được nhúng vào app để verify token
- Private key chỉ nằm trên server
- Device ID được hash trước khi gửi lên server
- Token có thời hạn 30 ngày, cần re-activate sau đó
