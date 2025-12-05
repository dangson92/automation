# Hệ Thống Quản Lý License - PromptFlow Desktop

Hệ thống quản lý license hoàn chỉnh cho ứng dụng Electron, bao gồm backend API, client library và tích hợp vào ứng dụng.

## Tổng Quan Hệ Thống

### Kiến Trúc

```
┌─────────────────────────────────────────────────────────────┐
│                    USERS & CLIENTS                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                │
│  │ Admin Panel  │         │ Electron App │                │
│  │ (Dashboard)  │         │   (Client)   │                │
│  └──────┬───────┘         └──────┬───────┘                │
│         │                        │                         │
│         │ HTTPS                  │ HTTPS                   │
│         ▼                        ▼                         │
│  ┌─────────────────────────────────────┐                  │
│  │     License Server (API)            │                  │
│  │  - Auth (JWT)                       │                  │
│  │  - User Management                  │                  │
│  │  - Admin Management                 │                  │
│  │  - License Activation               │                  │
│  │  - Renewal Requests                 │                  │
│  └─────────────┬───────────────────────┘                  │
│                │                                            │
│                ▼                                            │
│  ┌─────────────────────────────────────┐                  │
│  │         MySQL Database              │                  │
│  │  - users                            │                  │
│  │  - apps                             │                  │
│  │  - licenses                         │                  │
│  │  - activations                      │                  │
│  │  - renew_requests                   │                  │
│  └─────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### Luồng Hoạt Động

#### 1. Luồng Kích Hoạt License (First Time)

```
User mở App → Chưa có license → Hiển thị License Dialog
             ↓
User nhập License Key → Gửi lên Server (POST /activate)
             ↓
Server kiểm tra:
  - License hợp lệ?
  - App đúng không?
  - Còn hạn?
  - Số thiết bị < max_devices?
             ↓
Server tạo Activation & trả JWT Token
             ↓
Client lưu Token vào local (userData/.promptflow/license/)
             ↓
App khởi động bình thường
```

#### 2. Luồng Kiểm Tra License (Subsequent Launches)

```
User mở App → Đọc Token từ file local
             ↓
Verify Token:
  - Token hợp lệ?
  - Chưa hết hạn (30 ngày)?
  - App đúng?
             ↓
    Valid? → Vào App
    Invalid? → Yêu cầu nhập License lại
```

#### 3. Luồng Admin Tạo License

```
Admin đăng nhập Dashboard → POST /admin/licenses
             ↓
Chọn User, App, Max Devices, Expires Date
             ↓
Server sinh License Key ngẫu nhiên (XXXX-XXXX-XXXX-XXXX)
             ↓
Lưu vào database với status = 'active'
             ↓
Admin gửi License Key cho User (email, etc.)
```

#### 4. Luồng User Xin Gia Hạn

```
User login Dashboard → Xem danh sách Licenses của mình
             ↓
Click "Request Renewal" → POST /user/licenses/:id/renew-requests
             ↓
Tạo renew_request với status = 'pending'
             ↓
Admin nhận được request → Xem trong Admin Panel
             ↓
Admin approve/reject → PATCH /admin/renew-requests/:id
             ↓
Nếu approved: Cập nhật expires_at của license (+30 ngày)
```

---

## Cấu Trúc Thư Mục

```
/home/user/automation/
├── license-server/              # Backend API Server
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js         # Đăng ký, đăng nhập
│   │   │   ├── user.js         # User xem license, gửi renewal request
│   │   │   ├── admin.js        # Admin quản lý license, xử lý requests
│   │   │   └── activation.js   # Activate license cho client app
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT middleware
│   │   ├── config/
│   │   │   ├── database.js     # MySQL connection pool
│   │   │   └── keys.js         # RSA keys
│   │   └── utils/
│   │       └── crypto.js       # Hash device ID, generate license key
│   ├── scripts/
│   │   ├── init-db.js          # Khởi tạo database
│   │   ├── create-admin.js     # Tạo admin user
│   │   └── generate-keys.sh    # Tạo RSA key pair
│   ├── schema.sql              # Database schema
│   ├── package.json
│   ├── .env.example
│   └── DEPLOYMENT.md           # Hướng dẫn triển khai
│
├── license-client/              # Client Library
│   ├── src/
│   │   └── index.js            # LicenseClient class
│   ├── package.json
│   └── README.md
│
├── license-manager.js           # License manager cho Electron app
├── electron-main.js             # Electron main process (đã tích hợp license)
├── electron-preload.js          # Preload script (expose license API)
│
└── LICENSE_SYSTEM_README.md     # File này
```

---

## Database Schema

### Bảng: `users`

| Field           | Type          | Description                    |
|-----------------|---------------|--------------------------------|
| id              | INT           | Primary key                    |
| email           | VARCHAR(255)  | Email (unique)                 |
| password_hash   | VARCHAR(255)  | Bcrypt hash của password       |
| full_name       | VARCHAR(255)  | Họ tên                         |
| role            | ENUM          | 'user' hoặc 'admin'            |
| created_at      | TIMESTAMP     | Ngày tạo                       |
| last_login_at   | TIMESTAMP     | Lần login cuối                 |

### Bảng: `apps`

| Field        | Type         | Description                        |
|--------------|--------------|------------------------------------|
| id           | INT          | Primary key                        |
| code         | VARCHAR(50)  | Mã app (unique), VD: 'PROMPTFLOW_DESKTOP' |
| name         | VARCHAR(255) | Tên app                            |
| description  | TEXT         | Mô tả                              |
| created_at   | TIMESTAMP    | Ngày tạo                           |

### Bảng: `licenses`

| Field       | Type          | Description                           |
|-------------|---------------|---------------------------------------|
| id          | INT           | Primary key                           |
| user_id     | INT           | FK -> users.id (chủ sở hữu license)   |
| app_id      | INT           | FK -> apps.id                         |
| license_key | VARCHAR(100)  | License key (unique)                  |
| max_devices | INT           | Số máy tối đa được activate           |
| expires_at  | TIMESTAMP     | Ngày hết hạn (NULL = vô hạn)          |
| status      | ENUM          | 'active', 'revoked', 'expired'        |
| meta        | JSON          | Metadata khác                         |
| created_at  | TIMESTAMP     | Ngày tạo                              |

### Bảng: `activations`

| Field              | Type         | Description                           |
|--------------------|--------------|---------------------------------------|
| id                 | INT          | Primary key                           |
| license_id         | INT          | FK -> licenses.id                     |
| device_hash        | VARCHAR(64)  | SHA256 hash của device ID             |
| first_activated_at | TIMESTAMP    | Lần activate đầu tiên                 |
| last_checkin_at    | TIMESTAMP    | Lần checkin cuối (mỗi lần mở app)     |
| status             | ENUM         | 'active', 'banned'                    |
| meta               | JSON         | Thông tin thiết bị, app version, etc. |

**UNIQUE KEY:** (license_id, device_hash)

### Bảng: `renew_requests`

| Field                  | Type      | Description                           |
|------------------------|-----------|---------------------------------------|
| id                     | INT       | Primary key                           |
| user_id                | INT       | FK -> users.id (người gửi request)    |
| license_id             | INT       | FK -> licenses.id                     |
| message                | TEXT      | Lý do xin gia hạn                     |
| status                 | ENUM      | 'pending', 'approved', 'rejected'     |
| created_at             | TIMESTAMP | Ngày gửi request                      |
| processed_at           | TIMESTAMP | Ngày xử lý (NULL nếu chưa xử lý)      |
| processed_by_admin_id  | INT       | FK -> users.id (admin xử lý)          |
| admin_notes            | TEXT      | Ghi chú của admin                     |

---

## API Endpoints

### Authentication

#### `POST /auth/register`
Đăng ký tài khoản user mới.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "fullName": "John Doe",
    "role": "user"
  }
}
```

#### `POST /auth/login`
Đăng nhập.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": { ... }
}
```

---

### User Routes (Requires JWT)

#### `GET /user/licenses`
Xem danh sách licenses của user hiện tại.

**Headers:**
```
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "success": true,
  "licenses": [
    {
      "id": 1,
      "licenseKey": "ABCD-1234-EFGH-5678",
      "appCode": "PROMPTFLOW_DESKTOP",
      "appName": "PromptFlow Desktop",
      "maxDevices": 2,
      "expiresAt": "2025-12-31T23:59:59.000Z",
      "status": "active",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `POST /user/licenses/:id/renew-requests`
Gửi yêu cầu gia hạn license.

**Request:**
```json
{
  "message": "Tôi muốn gia hạn thêm 1 năm"
}
```

---

### Admin Routes (Requires JWT + Admin Role)

#### `POST /admin/licenses`
Tạo license mới.

**Request:**
```json
{
  "userId": 5,
  "appId": 1,
  "maxDevices": 2,
  "expiresAt": "2025-12-31T23:59:59.000Z",
  "status": "active"
}
```

**Response:**
```json
{
  "success": true,
  "licenseId": 10,
  "licenseKey": "ABCD-1234-EFGH-5678"
}
```

#### `PATCH /admin/renew-requests/:id`
Xử lý yêu cầu gia hạn.

**Request:**
```json
{
  "status": "approved",
  "adminNotes": "Đã gia hạn thêm 30 ngày",
  "extendDays": 30
}
```

---

### Activation Routes (Public)

#### `POST /activate`
Kích hoạt license cho thiết bị.

**Request:**
```json
{
  "licenseKey": "ABCD-1234-EFGH-5678",
  "appCode": "PROMPTFLOW_DESKTOP",
  "deviceId": "unique-device-id-hash",
  "appVersion": "1.0.0"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_activation_token_here",
  "expiresAt": "2025-02-04T00:00:00.000Z",
  "license": {
    "expiresAt": "2025-12-31T23:59:59.000Z",
    "status": "active",
    "appCode": "PROMPTFLOW_DESKTOP",
    "maxDevices": 2
  }
}
```

---

## Triển Khai

### 1. Backend Server

Xem chi tiết tại: [`license-server/DEPLOYMENT.md`](license-server/DEPLOYMENT.md)

**Tóm tắt:**
```bash
# Trên VPS Ubuntu
cd ~/apps/license-server
npm install --production
npm run init-db
npm run create-admin
pm2 start src/index.js --name license-server
```

### 2. Cấu Hình Nginx

```nginx
server {
    listen 443 ssl;
    server_name api.dangthanhson.com;

    ssl_certificate /etc/letsencrypt/live/api.dangthanhson.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.dangthanhson.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. Tích Hợp Vào Electron App

**Copy public key:**
```bash
# Copy public key từ server
scp licenseapp@your-vps:/home/licenseapp/apps/license-server/keys/public.pem ./keys/
```

**Cập nhật `license-manager.js`:**
```javascript
const LICENSE_CONFIG = {
  APP_CODE: 'PROMPTFLOW_DESKTOP',
  APP_VERSION: '1.0.0',
  SERVER_URL: 'https://api.dangthanhson.com',
  PUBLIC_KEY: fs.readFileSync('./keys/public.pem', 'utf8')
};
```

**Build Electron app:**
```bash
npm run build:exe
```

---

## Bảo Mật

### 1. Server Side

- ✅ HTTPS bắt buộc (SSL certificate)
- ✅ JWT authentication cho user/admin
- ✅ RSA signing cho activation tokens
- ✅ Device ID được hash trước khi lưu
- ✅ Rate limiting cho /activate endpoint
- ✅ Password hashing với bcrypt
- ✅ SQL injection prevention (prepared statements)
- ✅ Private key chỉ nằm trên server

### 2. Client Side

- ✅ Public key verify activation token
- ✅ Token có thời hạn (30 ngày)
- ✅ Device ID unique cho mỗi máy
- ✅ License data lưu trong userData (khó truy cập)
- ✅ Code obfuscation khi build production

### 3. Recommendations

- 🔒 Thường xuyên update dependencies
- 🔒 Monitor logs để phát hiện abuse
- 🔒 Implement hardware fingerprinting nâng cao
- 🔒 Add IP whitelisting cho admin panel
- 🔒 Implement 2FA cho admin accounts
- 🔒 Regular database backups
- 🔒 Rotate keys định kỳ

---

## Testing

### Test Backend API

```bash
# Health check
curl https://api.dangthanhson.com/health

# Register
curl -X POST https://api.dangthanhson.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456","fullName":"Test"}'

# Activate
curl -X POST https://api.dangthanhson.com/activate \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"XXXX-XXXX-XXXX-XXXX","appCode":"PROMPTFLOW_DESKTOP","deviceId":"test123","appVersion":"1.0.0"}'
```

### Test Electron App

1. **First launch (chưa có license):**
   - Mở app → License dialog xuất hiện
   - Nhập license key → Click Activate
   - Thành công → App mở

2. **Subsequent launches:**
   - Mở app → Tự động verify token → Vào app luôn

3. **Invalid license:**
   - Xóa file token: `~/.promptflow/license/license_token.json`
   - Mở app → License dialog xuất hiện lại

---

## Workflow Sử Dụng

### Cho Admin

1. Login vào admin dashboard
2. Tạo license cho user:
   - Chọn user (email)
   - Chọn app (PROMPTFLOW_DESKTOP)
   - Set max_devices (ví dụ: 2)
   - Set expires_at (ví dụ: 2025-12-31)
   - Click "Create License"
3. Copy license key và gửi cho user
4. Xem danh sách licenses, activations
5. Xử lý renewal requests từ users

### Cho User

1. Nhận license key từ admin (qua email)
2. Mở PromptFlow Desktop lần đầu
3. Nhập license key vào dialog
4. Sử dụng app bình thường
5. Nếu muốn gia hạn:
   - Login vào dashboard (nếu có)
   - Gửi renewal request
   - Đợi admin approve

---

## Roadmap

### Phase 1 (Current)
- ✅ Backend API hoàn chỉnh
- ✅ Database schema
- ✅ Client library
- ✅ Electron integration
- ✅ Basic license activation

### Phase 2 (Future)
- ⏳ Admin dashboard UI (React/Vue)
- ⏳ User dashboard UI
- ⏳ Email notifications
- ⏳ Payment integration
- ⏳ Auto-renewal
- ⏳ Analytics & reporting

### Phase 3 (Advanced)
- ⏳ Multi-tier licensing (Basic/Pro/Enterprise)
- ⏳ Trial licenses
- ⏳ License transfer
- ⏳ Offline activation
- ⏳ Hardware binding nâng cao

---

## FAQ

**Q: User có thể crack license không?**
A: Khó, nhưng không thể 100% chống crack. Hệ thống sử dụng RSA signing, device binding, và server-side verification để làm khó việc crack. Nên combine với code obfuscation và regular updates.

**Q: Nếu user format máy thì sao?**
A: Device ID sẽ thay đổi, cần activate lại. Nếu đã đạt max_devices, user cần liên hệ admin để revoke device cũ.

**Q: License key có thể dùng cho nhiều máy?**
A: Có, nhưng giới hạn bởi `max_devices`. Ví dụ max_devices=2 thì chỉ activate được 2 máy.

**Q: Token hết hạn 30 ngày thì sao?**
A: App sẽ tự động gọi `/activate` lại với cùng license key để lấy token mới (silent re-activation).

**Q: Có cần internet để dùng app không?**
A: Chỉ cần internet khi activate lần đầu. Sau đó có thể offline (trong 30 ngày cho đến khi token hết hạn).

---

## Support

Nếu cần hỗ trợ:
- Email: support@dangthanhson.com
- Docs: https://docs.dangthanhson.com
- GitHub Issues: https://github.com/your-repo/issues

---

**License:** MIT
**Version:** 1.0.0
**Last Updated:** 2024-12-05
