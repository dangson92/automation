# License Integration - PromptFlow Desktop

Tích hợp license validation với server `api.dangthanhson.com` vào ứng dụng Electron.

## 📋 Tổng Quan

Hệ thống đã được tích hợp sẵn với:
- ✅ License Manager để kích hoạt và xác thực license
- ✅ Device binding dựa trên hardware fingerprinting
- ✅ UI dialog đẹp để nhập license key
- ✅ Token storage bảo mật
- ✅ Tự động kiểm tra license khi khởi động app

## 🔧 Cấu Hình

### Bước 1: Lấy Public Key Từ Server

Liên hệ admin để lấy file `public.pem` từ server license của bạn, sau đó:

```bash
# Copy public.pem vào thư mục keys/
cp /path/to/public.pem ./keys/public.pem
```

Hoặc paste nội dung public key trực tiếp vào file `keys/public.pem`.

### Bước 2: Cấu Hình Server URL & App Code

Mở file `electron-main.js` và tìm dòng:

```javascript
licenseManager = new LicenseManager({
  serverUrl: 'https://api.dangthanhson.com', // ← Thay đổi nếu cần
  appCode: 'PROMPTFLOW_DESKTOP',              // ← Mã app trong database server
  appVersion: '1.0.0',
  publicKey: publicKey,
  configDir: path.join(app.getPath('userData'), 'license')
});
```

**Quan trọng:**
- `serverUrl`: URL của license server (VD: `https://api.dangthanhson.com`)
- `appCode`: Mã app đã được tạo trong database server (hỏi admin)

### Bước 3: Build App

```bash
npm run build:exe
```

App sẽ được build vào folder `release/`.

## 🚀 Luồng Hoạt Động

### Lần Đầu Mở App (Chưa có license)

1. User mở app → License dialog hiển thị
2. User nhập license key (format: `XXXX-XXXX-XXXX-XXXX`)
3. Click "Activate"
4. App gửi request đến server: `POST /activate`
   ```json
   {
     "licenseKey": "ABCD-1234-EFGH-5678",
     "appCode": "PROMPTFLOW_DESKTOP",
     "deviceId": "unique-device-hash",
     "appVersion": "1.0.0"
   }
   ```
5. Server verify và trả về JWT token
6. App lưu token vào:
   - Windows: `%APPDATA%\PromptFlow\license\license_token.json`
   - macOS: `~/Library/Application Support/PromptFlow/license/license_token.json`
   - Linux: `~/.promptflow/license/license_token.json`
7. App mở bình thường

### Các Lần Mở Sau

1. User mở app
2. App tự động đọc token từ file local
3. Verify token bằng public key:
   - ✅ Valid → Vào app luôn
   - ❌ Invalid/Expired → Hiển thị license dialog lại

## 🔐 Bảo Mật

### Device Binding

Mỗi license được bind với hardware fingerprint của máy:
- Hostname
- Username
- Platform & Architecture
- MAC Address (network interface đầu tiên)

→ Hash thành Device ID duy nhất cho mỗi máy

### Token Verification

- JWT token được ký bằng RSA-2048 trên server
- Client verify token bằng public key
- Token có thời hạn 30 ngày
- Sau 30 ngày cần re-activate (tự động, silent)

### Storage

Token được lưu trong thư mục userData của app:
- Không dễ truy cập bởi user thông thường
- Persist qua các lần update app
- Xóa khi uninstall (nếu xóa thư mục userData)

## 📁 Cấu Trúc Files

```
/home/user/automation/
├── electron-main.js          # Main process với license integration
├── electron-preload.js       # IPC handlers cho license
├── license-manager.js        # Core license manager class
├── keys/
│   └── public.pem           # RSA public key (PHẢI CÓ!)
└── LICENSE_INTEGRATION_README.md  # File này
```

## 🧪 Testing

### Test Locally

```bash
# Chạy app trong dev mode
npm start
```

### Test License Activation

1. Xóa token cũ (nếu có):
   ```bash
   # Windows
   del %APPDATA%\PromptFlow\license\license_token.json

   # macOS/Linux
   rm -rf ~/Library/Application\ Support/PromptFlow/license/
   # hoặc
   rm -rf ~/.promptflow/license/
   ```

2. Mở app → License dialog hiện ra
3. Nhập license key hợp lệ từ admin
4. Click "Activate"
5. Nếu thành công → App mở

### Kiểm Tra Token

Token được lưu dạng JSON:

```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2025-02-04T00:00:00.000Z",
  "licenseInfo": {
    "expires_at": "2025-12-31T23:59:59.000Z",
    "status": "active",
    "appCode": "PROMPTFLOW_DESKTOP"
  }
}
```

## 🐛 Troubleshooting

### "License System Error: Failed to initialize"

**Nguyên nhân:** Không tìm thấy file `keys/public.pem`

**Giải pháp:**
1. Kiểm tra file tồn tại: `ls keys/public.pem`
2. Copy public key từ server
3. Đảm bảo format đúng (bắt đầu với `-----BEGIN PUBLIC KEY-----`)

### "Activation failed: app_not_found"

**Nguyên nhân:** `appCode` không tồn tại trong database server

**Giải pháp:**
1. Kiểm tra `appCode` trong `electron-main.js`
2. Hỏi admin để xác nhận mã app đúng
3. Admin có thể cần tạo app trong database:
   ```sql
   INSERT INTO apps (code, name) VALUES ('PROMPTFLOW_DESKTOP', 'PromptFlow Desktop');
   ```

### "Activation failed: license_not_found"

**Nguyên nhân:** License key không tồn tại hoặc không thuộc về app này

**Giải pháp:**
1. Kiểm tra lại license key
2. Đảm bảo license được tạo cho đúng app
3. Liên hệ admin để verify

### "Activation failed: max_devices_reached"

**Nguyên nhân:** License đã được activate trên số máy tối đa

**Giải pháp:**
1. Liên hệ admin để tăng `max_devices`
2. Hoặc admin revoke device cũ trong database

### Token expired sau 30 ngày

**Giải pháp:** App sẽ tự động re-activate với cùng license key (silent, không cần user action)

## 📊 API Endpoints (Server)

App gọi đến các endpoints sau:

### `POST /activate`

Kích hoạt license cho device.

**Request:**
```json
{
  "licenseKey": "ABCD-1234-EFGH-5678",
  "appCode": "PROMPTFLOW_DESKTOP",
  "deviceId": "sha256-hash-of-device",
  "appVersion": "1.0.0"
}
```

**Response (Success):**
```json
{
  "token": "jwt-token",
  "expiresAt": "2025-02-04T00:00:00.000Z",
  "licenseInfo": {
    "expires_at": "2025-12-31T23:59:59.000Z",
    "status": "active",
    "appCode": "PROMPTFLOW_DESKTOP"
  }
}
```

**Response (Error):**
```json
{
  "error": "license_not_found"
}
```

**Error Codes:**
- `invalid_input`: Thiếu params
- `app_not_found`: App code không tồn tại
- `license_not_found`: License key không tồn tại
- `license_inactive`: License bị revoke
- `license_expired`: License hết hạn
- `max_devices_reached`: Đã activate tối đa số máy

## 🎯 Workflow Admin

Admin cần làm gì để tạo license cho user:

1. Tạo app trong database (chỉ lần đầu):
   ```sql
   INSERT INTO apps (code, name) VALUES ('PROMPTFLOW_DESKTOP', 'PromptFlow Desktop');
   ```

2. Tạo license cho user:
   ```sql
   INSERT INTO licenses (user_id, app_id, license_key, max_devices, expires_at, status)
   VALUES (1, 1, 'ABCD-1234-EFGH-5678', 2, '2025-12-31 23:59:59', 'active');
   ```

3. Gửi license key cho user (qua email, etc.)

4. User nhập license key vào app → Kích hoạt thành công

## 📝 Notes

- License key format: `XXXX-XXXX-XXXX-XXXX` (16 ký tự, viết hoa)
- Token có hạn 30 ngày, cần re-activate sau đó
- Device ID persistent qua các lần restart
- Public key PHẢI khớp với private key trên server
- Nếu format máy → Device ID thay đổi → Cần activate lại

## 🔄 Update App

Khi update app version mới:
- Token vẫn được giữ (trong userData)
- Không cần re-activate
- Device ID không thay đổi

## 📞 Support

Nếu gặp vấn đề:
1. Kiểm tra logs trong console: `npm start`
2. Kiểm tra file token có tồn tại không
3. Test kết nối đến server: `curl https://api.dangthanhson.com/health`
4. Liên hệ admin để verify license trong database

---

**License:** MIT
**Version:** 1.0.0
**Last Updated:** 2024-12-05
