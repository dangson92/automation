# Quick Start Guide - License System

Hướng dẫn nhanh để bắt đầu sử dụng hệ thống quản lý license.

## 📋 Tổng Quan

Bạn đã có sẵn:
- ✅ Backend API Server (`license-server/`)
- ✅ Client Library (`license-client/`)
- ✅ Electron Integration (đã tích hợp vào app)
- ✅ Database Schema
- ✅ Documentation

## 🚀 Bước 1: Triển Khai Backend Lên VPS

### 1.1. Upload Code Lên VPS

```bash
# Từ máy local, upload folder license-server lên VPS
cd /home/user/automation
scp -r license-server user@your-vps-ip:~/apps/

# Hoặc dùng git
ssh user@your-vps-ip
cd ~/apps
git clone <your-repo> license-server
```

### 1.2. Cài Đặt Dependencies

```bash
ssh user@your-vps-ip
cd ~/apps/license-server
npm install --production
```

### 1.3. Generate RSA Keys

```bash
cd ~/apps/license-server
bash scripts/generate-keys.sh
```

**⚠️ QUAN TRỌNG:**
- File `keys/private.pem` GIỮ BÍ MẬT trên server
- File `keys/public.pem` sẽ nhúng vào Electron app

### 1.4. Cấu Hình Environment

```bash
cp .env.example .env
nano .env
```

Sửa các giá trị:
- `DB_PASSWORD`: Password MySQL
- `JWT_SECRET`: Generate bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `DEVICE_SALT`: Generate tương tự
- `CORS_ORIGINS`: Thêm domain của bạn

### 1.5. Khởi Tạo Database

```bash
# Tạo database trong MySQL
sudo mysql -u root -p
CREATE DATABASE license_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'license_user'@'localhost' IDENTIFIED BY 'YOUR_PASSWORD';
GRANT ALL PRIVILEGES ON license_db.* TO 'license_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# Chạy script init
npm run init-db

# Tạo admin user
npm run create-admin
```

### 1.6. Start Server

```bash
# Test
npm start

# Deploy production với PM2
pm2 start src/index.js --name license-server
pm2 save
```

### 1.7. Cấu Hình Nginx & SSL

Xem chi tiết: [`license-server/DEPLOYMENT.md`](license-server/DEPLOYMENT.md)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL
sudo certbot --nginx -d api.dangthanhson.com
```

## 🔧 Bước 2: Tích Hợp Vào Electron App

### 2.1. Copy Public Key Từ VPS

```bash
# Download public key từ VPS về máy local
scp user@your-vps-ip:~/apps/license-server/keys/public.pem ./keys/
```

### 2.2. Cập Nhật Config trong `license-manager.js`

```javascript
const LICENSE_CONFIG = {
  APP_CODE: 'PROMPTFLOW_DESKTOP',
  APP_VERSION: '1.0.0',
  SERVER_URL: 'https://api.dangthanhson.com', // ← Đổi thành domain của bạn

  // Paste nội dung file public.pem vào đây:
  PUBLIC_KEY: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
... (paste full content) ...
-----END PUBLIC KEY-----`
};
```

### 2.3. Build Electron App

```bash
cd /home/user/automation
npm run build:exe
```

App sẽ được build trong folder `release/`

## 🧪 Bước 3: Test Hệ Thống

### 3.1. Test Backend API

```bash
# Health check
curl https://api.dangthanhson.com/health

# Test register
curl -X POST https://api.dangthanhson.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "password123",
    "fullName": "Test User"
  }'
```

### 3.2. Tạo License Cho User Test

**Cách 1: Dùng API trực tiếp**

```bash
# 1. Login admin
ADMIN_TOKEN=$(curl -X POST https://api.dangthanhson.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin_password"
  }' | jq -r '.token')

# 2. Get user ID (từ response của register)
USER_ID=1  # ID của testuser

# 3. Tạo license
curl -X POST https://api.dangthanhson.com/admin/licenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "userId": 1,
    "appId": 1,
    "maxDevices": 2,
    "expiresAt": "2025-12-31T23:59:59.000Z",
    "status": "active"
  }'

# Response sẽ chứa licenseKey: "ABCD-1234-EFGH-5678"
```

**Cách 2: Dùng MySQL trực tiếp (testing only)**

```bash
ssh user@your-vps-ip
mysql -u license_user -p license_db

-- Tạo license thủ công
INSERT INTO licenses (user_id, app_id, license_key, max_devices, expires_at, status)
VALUES (1, 1, 'TEST-1234-5678-ABCD', 2, '2025-12-31 23:59:59', 'active');
```

### 3.3. Test Activation Từ App

1. Mở PromptFlow Desktop (file .exe vừa build)
2. License dialog sẽ hiện lên
3. Nhập license key: `ABCD-1234-EFGH-5678` (hoặc license vừa tạo)
4. Click "Activate"
5. Nếu thành công → App sẽ mở

### 3.4. Kiểm Tra Activation Trong Database

```bash
mysql -u license_user -p license_db

SELECT * FROM activations;
-- Sẽ thấy 1 record mới với device_hash
```

## 📚 Các Bước Tiếp Theo

### 1. Build Admin Dashboard (Optional)

Tạo web app React/Vue để:
- Quản lý users
- Tạo và quản lý licenses
- Xem activations
- Xử lý renewal requests

### 2. Thêm Chức Năng

- Email notification khi license gần hết hạn
- Tích hợp payment gateway
- Analytics & reporting
- Multi-tier licensing (Basic/Pro/Enterprise)

### 3. Bảo Mật Nâng Cao

- Implement 2FA cho admin
- IP whitelisting
- Hardware fingerprinting nâng cao
- Code obfuscation cho Electron app

## 🐛 Troubleshooting

### App không kết nối được server

1. Kiểm tra server đang chạy:
   ```bash
   ssh user@your-vps-ip
   pm2 status
   ```

2. Kiểm tra domain trỏ đúng IP:
   ```bash
   ping api.dangthanhson.com
   ```

3. Kiểm tra firewall:
   ```bash
   sudo ufw status
   ```

### "Invalid license key"

1. Kiểm tra license có tồn tại trong database:
   ```bash
   mysql -u license_user -p license_db
   SELECT * FROM licenses WHERE license_key = 'YOUR-LICENSE-KEY';
   ```

2. Kiểm tra status = 'active' và chưa hết hạn

### "Maximum devices reached"

User đã activate trên quá nhiều máy. Solutions:

1. Admin revoke device cũ trong database:
   ```sql
   DELETE FROM activations
   WHERE license_id = X AND device_hash = 'old_device_hash';
   ```

2. Hoặc tăng `max_devices` cho license:
   ```sql
   UPDATE licenses SET max_devices = 3 WHERE id = X;
   ```

## 📞 Support

- Documentation: [`LICENSE_SYSTEM_README.md`](LICENSE_SYSTEM_README.md)
- Deployment Guide: [`license-server/DEPLOYMENT.md`](license-server/DEPLOYMENT.md)
- Client Library: [`license-client/README.md`](license-client/README.md)

## 🎯 Checklist

- [ ] VPS đã cài Ubuntu + Node.js + MySQL + Nginx
- [ ] License server đã deploy và chạy (PM2)
- [ ] SSL certificate đã cài (Let's Encrypt)
- [ ] Database đã init và có admin user
- [ ] Public key đã copy về local
- [ ] `license-manager.js` đã config đúng SERVER_URL
- [ ] Electron app đã build thành công
- [ ] Test activation thành công
- [ ] Đã tạo license cho user test
- [ ] Đã test toàn bộ flow

Good luck! 🚀
