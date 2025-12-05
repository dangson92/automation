# Kiến Trúc Hệ Thống License Key Server

## Mục Lục

1. [Tổng Quan](#tổng-quan)
2. [Kiến Trúc Tổng Thể](#kiến-trúc-tổng-thể)
3. [Database Schema](#database-schema)
4. [API Flow](#api-flow)
5. [Security Model](#security-model)
6. [Deployment Architecture](#deployment-architecture)

---

## Tổng Quan

Hệ thống License Key Server là một giải pháp quản lý license cho các phần mềm Electron/NodeJS với 3 actor chính:

- **Admin**: Quản lý apps, licenses, users, và xử lý yêu cầu gia hạn
- **User (Khách hàng)**: Xem licenses của mình và gửi yêu cầu gia hạn
- **Client App**: Kích hoạt license theo deviceId và nhận JWT token

### Đặc Điểm Chính

- ✅ License binding theo device (max_devices)
- ✅ JWT RS256 token (30 ngày) cho offline verification
- ✅ Renew request workflow (user request → admin approve)
- ✅ Rate limiting, security headers, CORS
- ✅ MySQL database với foreign keys

---

## Kiến Trúc Tổng Thể

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT APPS                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Electron 1  │  │  Electron 2  │  │  Electron 3  │          │
│  │  deviceId: A │  │  deviceId: B │  │  deviceId: C │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                    │
│         └─────────────────┴─────────────────┘                    │
│                           │                                       │
│                           │ POST /activate                        │
│                           │ {licenseKey, appCode, deviceId}       │
│                           ▼                                       │
└───────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS (SSL/TLS)
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│                      NGINX REVERSE PROXY                           │
│                    license.dangthanhson.com                        │
│                         (Port 80/443)                              │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            │ Proxy to localhost:3000
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│                     NODE.JS EXPRESS SERVER                         │
│                          (Port 3000)                               │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Middleware Stack:                                           │ │
│  │  - CORS                                                      │ │
│  │  - Helmet (Security Headers)                                │ │
│  │  - Morgan (Logging)                                         │ │
│  │  - Rate Limiter (/activate: 100 req/15min)                 │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Routers:                                                    │ │
│  │  - /auth         → Auth Module (register, login)           │ │
│  │  - /user         → User Module (licenses, renew-requests)  │ │
│  │  - /admin        → Admin Module (manage all resources)     │ │
│  │  - /activate     → Activate Module (client activation)     │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Authentication:                                             │ │
│  │  - JWT_SECRET     → Sign user tokens (HS256)               │ │
│  │  - PRIVATE_KEY    → Sign activation tokens (RS256)         │ │
│  │  - DEVICE_SALT    → Hash deviceId                          │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            │ MySQL Connection Pool
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│                       MYSQL DATABASE                               │
│                      (license_db)                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │  users   │  │   apps   │  │ licenses │  │activation│         │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │
│                                                                    │
│  ┌──────────────────┐                                             │
│  │ renew_requests   │                                             │
│  └──────────────────┘                                             │
└────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      WEB ADMIN PANEL                             │
│                   (React + Vite Frontend)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Login      │  │   Manage     │  │   Renew      │          │
│  │   Admin      │  │   Licenses   │  │   Requests   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### 1. Table: `users`

Lưu thông tin user (cả admin và khách hàng).

```sql
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL,
  created_at DATETIME NOT NULL,
  last_login_at DATETIME NULL
);
```

**Fields:**
- `id`: Primary key
- `email`: Email đăng nhập (unique)
- `password_hash`: Bcrypt hash của password
- `full_name`: Tên đầy đủ
- `role`: 'user' (khách hàng) hoặc 'admin'
- `created_at`: Thời gian tạo tài khoản
- `last_login_at`: Lần đăng nhập cuối

**Indexes:**
- PRIMARY KEY (`id`)
- UNIQUE KEY (`email`)

---

### 2. Table: `apps`

Danh sách các phần mềm (applications) trong hệ thống.

```sql
CREATE TABLE IF NOT EXISTS apps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(128) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Fields:**
- `id`: Primary key
- `code`: Mã app duy nhất (ví dụ: 'APP001', 'EDITOR_PRO')
- `name`: Tên app hiển thị
- `created_at`: Thời gian tạo

**Indexes:**
- PRIMARY KEY (`id`)
- UNIQUE KEY (`code`)

**Example data:**
```sql
INSERT INTO apps (code, name) VALUES
  ('APP001', 'My Editor Pro'),
  ('APP002', 'SEO Tool'),
  ('APP003', 'Video Converter');
```

---

### 3. Table: `licenses`

License keys được tạo bởi admin và gán cho user.

```sql
CREATE TABLE IF NOT EXISTS licenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  app_id INT NOT NULL,
  license_key VARCHAR(64) UNIQUE NOT NULL,
  max_devices INT NOT NULL,
  expires_at DATETIME NULL,
  status ENUM('active','revoked','expired') NOT NULL,
  meta JSON NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_licenses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_licenses_app FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
);
```

**Fields:**
- `id`: Primary key
- `user_id`: ID của user sở hữu license (FK → users.id)
- `app_id`: ID của app (FK → apps.id)
- `license_key`: License key (format: XXXX-XXXX-XXXX)
- `max_devices`: Số lượng máy tối đa có thể kích hoạt
- `expires_at`: Ngày hết hạn (NULL = vô thời hạn)
- `status`: Trạng thái (active/revoked/expired)
- `meta`: Metadata dạng JSON (optional)
- `created_at`: Thời gian tạo license

**Indexes:**
- PRIMARY KEY (`id`)
- UNIQUE KEY (`license_key`)
- FOREIGN KEY (`user_id`) → users(id)
- FOREIGN KEY (`app_id`) → apps(id)

**Business Rules:**
- License chỉ hợp lệ khi: `status = 'active'` AND (`expires_at IS NULL` OR `expires_at > NOW()`)
- Khi user bị xóa → licenses của user đó cũng bị xóa (CASCADE)
- Khi app bị xóa → licenses của app đó cũng bị xóa (CASCADE)

---

### 4. Table: `activations`

Lưu thông tin các device đã kích hoạt license.

```sql
CREATE TABLE IF NOT EXISTS activations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  license_id INT NOT NULL,
  device_hash VARCHAR(255) NOT NULL,
  first_activated_at DATETIME NOT NULL,
  last_checkin_at DATETIME NOT NULL,
  status ENUM('active','banned') NOT NULL,
  UNIQUE KEY uniq_activation (license_id, device_hash),
  CONSTRAINT fk_activations_license FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);
```

**Fields:**
- `id`: Primary key
- `license_id`: ID của license (FK → licenses.id)
- `device_hash`: Hash của deviceId (SHA256 + DEVICE_SALT)
- `first_activated_at`: Lần đầu kích hoạt
- `last_checkin_at`: Lần cuối checkin (renew token)
- `status`: Trạng thái (active/banned)

**Indexes:**
- PRIMARY KEY (`id`)
- UNIQUE KEY (`license_id`, `device_hash`) → 1 device chỉ activate 1 lần cho 1 license
- FOREIGN KEY (`license_id`) → licenses(id)

**Business Rules:**
- Số lượng activations với status='active' không được vượt quá `licenses.max_devices`
- `device_hash` được tạo từ: `SHA256(deviceId + DEVICE_SALT)`
- Khi client activate lại (cùng deviceId) → chỉ update `last_checkin_at`

---

### 5. Table: `renew_requests`

Yêu cầu gia hạn license từ user, chờ admin duyệt.

```sql
CREATE TABLE IF NOT EXISTS renew_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  license_id INT NOT NULL,
  message TEXT,
  status ENUM('pending','approved','rejected') NOT NULL,
  created_at DATETIME NOT NULL,
  processed_at DATETIME NULL,
  processed_by_admin_id INT NULL,
  CONSTRAINT fk_rr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rr_license FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
  CONSTRAINT fk_rr_admin FOREIGN KEY (processed_by_admin_id) REFERENCES users(id)
);
```

**Fields:**
- `id`: Primary key
- `user_id`: User gửi request (FK → users.id)
- `license_id`: License cần gia hạn (FK → licenses.id)
- `message`: Nội dung yêu cầu (lý do, gói muốn nâng cấp, ...)
- `status`: Trạng thái (pending/approved/rejected)
- `created_at`: Thời gian tạo request
- `processed_at`: Thời gian admin xử lý (NULL nếu chưa xử lý)
- `processed_by_admin_id`: Admin nào đã xử lý (FK → users.id)

**Indexes:**
- PRIMARY KEY (`id`)
- FOREIGN KEY (`user_id`) → users(id)
- FOREIGN KEY (`license_id`) → licenses(id)
- FOREIGN KEY (`processed_by_admin_id`) → users(id)

**Workflow:**
1. User tạo request → status = 'pending'
2. Admin approve:
   - Cập nhật `licenses.expires_at += 30 days`
   - Cập nhật `status = 'approved'`, `processed_at = NOW()`, `processed_by_admin_id`
3. Admin reject:
   - Cập nhật `status = 'rejected'`, `processed_at = NOW()`, `processed_by_admin_id`

---

## API Flow

### 1. User Registration & Login

```mermaid
sequenceDiagram
    participant User
    participant API
    participant DB

    User->>API: POST /auth/register {email, password, fullName}
    API->>API: Bcrypt hash password
    API->>DB: INSERT user (role='user')
    DB-->>API: OK
    API->>API: Sign JWT (HS256, JWT_SECRET)
    API-->>User: {token}

    User->>API: POST /auth/login {email, password}
    API->>DB: SELECT user WHERE email=?
    DB-->>API: user data
    API->>API: Bcrypt compare password
    API->>DB: UPDATE last_login_at
    API->>API: Sign JWT
    API-->>User: {token}
```

**User Token (JWT payload):**
```json
{
  "id": 123,
  "email": "user@example.com",
  "role": "user",
  "iat": 1234567890,
  "exp": 1234567890
}
```

---

### 2. Admin Create License

```mermaid
sequenceDiagram
    participant Admin
    participant API
    participant DB

    Admin->>API: POST /admin/licenses {user_id, app_id, max_devices, expires_at}
    API->>API: Verify Admin token (requireAdmin middleware)
    API->>API: Generate license_key (XXXX-XXXX-XXXX)
    API->>DB: INSERT license
    DB-->>API: OK
    API-->>Admin: {id, license_key}
```

**License Key Format:**
- Pattern: `XXXX-XXXX-XXXX`
- Charset: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (bỏ ký tự dễ nhầm: 0, O, 1, I, L)
- Example: `A3B4-C5D6-E7F8`

---

### 3. Client Activation

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant DB

    Client->>API: POST /activate {licenseKey, appCode, deviceId, appVersion}
    API->>DB: SELECT app WHERE code=?
    DB-->>API: app
    API->>DB: SELECT license WHERE license_key=? AND app_id=?
    DB-->>API: license
    API->>API: Check license.status='active'
    API->>API: Check license.expires_at > NOW()
    API->>API: Hash deviceId → deviceHash
    API->>DB: SELECT activation WHERE license_id=? AND device_hash=?
    DB-->>API: activation or NULL

    alt New Device
        API->>DB: COUNT activations WHERE license_id=? AND status='active'
        DB-->>API: count
        API->>API: Check count < max_devices
        API->>DB: INSERT activation
    else Existing Device
        API->>DB: UPDATE activation SET last_checkin_at=NOW()
    end

    API->>API: Sign JWT (RS256, PRIVATE_KEY, 30 days)
    API-->>Client: {token, expiresAt, licenseInfo}
```

**Activation Token (JWT payload):**
```json
{
  "licenseId": 456,
  "appCode": "APP001",
  "deviceHash": "abc123...",
  "licenseStatus": "active",
  "maxDevices": 3,
  "appVersion": "1.0.0",
  "iat": 1234567890,
  "exp": 1234567890
}
```

**Device Hashing:**
```javascript
deviceHash = SHA256(deviceId + DEVICE_SALT)
```

---

### 4. User Request Renew

```mermaid
sequenceDiagram
    participant User
    participant API
    participant DB

    User->>API: POST /user/licenses/:id/renew-requests {message}
    API->>API: Verify User token (requireUser middleware)
    API->>DB: SELECT license WHERE id=? AND user_id=?
    DB-->>API: license or 404
    API->>DB: INSERT renew_request (status='pending')
    DB-->>API: OK
    API-->>User: {request}
```

---

### 5. Admin Process Renew Request

```mermaid
sequenceDiagram
    participant Admin
    participant API
    participant DB

    Admin->>API: PATCH /admin/renew-requests/:id {status: 'approved'}
    API->>API: Verify Admin token (requireAdmin middleware)
    API->>DB: SELECT renew_request WHERE id=?
    DB-->>API: request

    alt Approved
        API->>DB: UPDATE licenses SET expires_at=COALESCE(expires_at,NOW()) + 30 DAY
        API->>DB: UPDATE renew_request SET status='approved', processed_at=NOW(), processed_by_admin_id=?
    else Rejected
        API->>DB: UPDATE renew_request SET status='rejected', processed_at=NOW(), processed_by_admin_id=?
    end

    DB-->>API: OK
    API-->>Admin: {id, status}
```

**Renew Logic:**
- Nếu `expires_at` là NULL → set thành `NOW() + 30 days`
- Nếu `expires_at` có giá trị → cộng thêm 30 ngày
- Formula: `expires_at = COALESCE(expires_at, NOW()) + INTERVAL 30 DAY`

---

## Security Model

### 1. Authentication

**User/Admin Token (JWT HS256):**
- Signed with `JWT_SECRET` (symmetric key)
- Expiration: 7 days
- Payload: `{id, email, role}`
- Used for: API authentication (Bearer token)

**Activation Token (JWT RS256):**
- Signed with `PRIVATE_KEY` (asymmetric key)
- Expiration: 30 days
- Payload: `{licenseId, appCode, deviceHash, licenseStatus, maxDevices}`
- Used for: Client offline verification

### 2. Authorization

**Middleware:**
- `requireUser`: Cho phép cả user và admin
- `requireAdmin`: Chỉ cho phép admin (role='admin')

**Access Control:**
- User chỉ xem được licenses của riêng họ
- User chỉ tạo renew_requests cho licenses của họ
- Admin xem được tất cả resources
- Admin tạo/sửa/xóa licenses, users, apps

### 3. Device Binding

**Device ID Generation (Client):**
```javascript
deviceId = SHA256(hostname + username + platform + arch + macAddress + salt)
```

**Device Hash (Server):**
```javascript
deviceHash = SHA256(deviceId + DEVICE_SALT)
```

**Security:**
- Token bị bind với `deviceHash`
- Client verify token → check deviceHash khớp với deviceId hiện tại
- Nếu copy token sang máy khác → deviceHash không khớp → invalid

### 4. Rate Limiting

```javascript
const activateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 100                   // 100 requests
})
app.use('/activate', activateLimiter)
```

### 5. Security Headers (Helmet)

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000`

### 6. HTTPS Only

- Production phải dùng HTTPS (SSL/TLS)
- Nginx reverse proxy với Let's Encrypt certificate
- Redirect HTTP → HTTPS

---

## Deployment Architecture

### Production Stack

```
┌─────────────────────────────────────────────────────────────┐
│  VPS Ubuntu 22.04                                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │   Nginx    │  │   Node.js  │  │   MySQL    │           │
│  │ (Port 443) │→ │ (Port 3000)│→ │ (Port 3306)│           │
│  └────────────┘  └────────────┘  └────────────┘           │
│                        ↑                                     │
│                   ┌────┴────┐                               │
│                   │   PM2   │ (Process Manager)            │
│                   └─────────┘                               │
│                                                              │
│  User: licenseapp (non-root, no sudo)                      │
│  SSH: Key-based authentication only                        │
│  Firewall: UFW (Port 22, 80, 443)                          │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
/home/licenseapp/
├── apps/
│   └── license-active/
│       ├── server/
│       ├── node_modules/
│       ├── .env              # Environment variables (chmod 600)
│       └── package.json
├── keys/
│   ├── private.pem           # RSA Private Key (chmod 600)
│   └── public.pem            # RSA Public Key
└── backups/
    └── license_db_*.sql      # Database backups
```

### Environment Variables (.env)

```bash
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=license_user
DB_PASS=secure_password_here
DB_NAME=license_db
JWT_SECRET=random_secret_at_least_32_chars
DEVICE_SALT=random_salt_for_device_hashing
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----
```

### SSL Certificate (Let's Encrypt)

```bash
# Auto-renewal với certbot
/etc/letsencrypt/live/license.dangthanhson.com/
├── fullchain.pem
├── privkey.pem
└── cert.pem
```

### PM2 Configuration

```bash
pm2 start npm --name license-server -- run server
pm2 save
pm2 startup systemd

# Monitoring
pm2 logs license-server
pm2 monit
```

### Backup Strategy

**Database:**
```bash
# Daily backup (cron)
0 2 * * * mysqldump -u license_user -p license_db > ~/backups/license_db_$(date +\%F).sql
```

**Keep last 30 days:**
```bash
find ~/backups -name "license_db_*.sql" -mtime +30 -delete
```

---

## Performance Considerations

### Database Indexes

Đã có sẵn:
- PRIMARY KEY trên tất cả bảng
- UNIQUE KEY trên email, code, license_key
- FOREIGN KEY indexes

Có thể thêm (nếu scale lớn):
```sql
CREATE INDEX idx_licenses_status ON licenses(status);
CREATE INDEX idx_licenses_user_id ON licenses(user_id);
CREATE INDEX idx_activations_license ON activations(license_id);
CREATE INDEX idx_renew_status ON renew_requests(status);
```

### Connection Pooling

```javascript
const pool = mysql.createPool({
  connectionLimit: 10,  // Tăng nếu traffic cao
  queueLimit: 0
})
```

### Caching

Hiện tại chưa có cache. Có thể thêm:
- Redis cache cho public key
- In-memory cache cho app list
- Cache layer cho license lookup

---

## Monitoring & Logging

### Application Logs (Morgan)

```
GET /health 200 2.123 ms - 12
POST /auth/login 200 142.456 ms - 234
POST /activate 200 89.234 ms - 567
```

### PM2 Logs

```bash
pm2 logs license-server --lines 100
pm2 logs license-server --err    # Error logs only
```

### MySQL Logs

```bash
tail -f /var/log/mysql/error.log
```

### Nginx Logs

```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

---

## Scaling Considerations

### Vertical Scaling (Single Server)

Current setup hỗ trợ tốt cho:
- ~1000-5000 licenses
- ~100-500 concurrent activations/minute
- ~10-50 admin users

**Upgrade path:**
- Tăng RAM, CPU của VPS
- Tăng MySQL connection pool
- Thêm Redis cache

### Horizontal Scaling (Multiple Servers)

Khi cần scale lớn hơn:

1. **Load Balancer:**
   - Nginx load balancer phía trước
   - Multiple Node.js instances (PM2 cluster mode)

2. **Database:**
   - MySQL Master-Slave replication
   - Read replicas cho GET requests
   - Write to master only

3. **Session:**
   - JWT stateless (đã dùng)
   - Không cần shared session store

4. **File Storage:**
   - Hiện tại không có file upload
   - Nếu có: dùng S3/object storage

---

## Security Checklist

- ✅ HTTPS only (SSL/TLS)
- ✅ JWT with expiration
- ✅ Bcrypt password hashing
- ✅ Rate limiting on /activate
- ✅ CORS configured
- ✅ Helmet security headers
- ✅ SQL injection prevention (parameterized queries)
- ✅ Input validation
- ✅ Device binding (deviceHash)
- ✅ Private key on server only
- ✅ SSH key-based auth
- ✅ Firewall (UFW)
- ✅ Regular backups
- ⚠️ TODO: Add CSRF protection (nếu có web form)
- ⚠️ TODO: Add audit logs (track admin actions)
- ⚠️ TODO: Add 2FA for admin (optional)

---

## Error Handling

### API Error Format

```json
{
  "error": "error_code",
  "message": "Human readable message" // optional
}
```

### Common Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `invalid_input` | 400 | Missing or invalid request params |
| `unauthorized` | 401 | Invalid or missing token |
| `forbidden` | 403 | Not enough permissions |
| `not_found` | 404 | Resource not found |
| `email_exists` | 409 | Email already registered |
| `license_not_found` | 404 | Invalid license key |
| `license_inactive` | 400 | License revoked or not active |
| `license_expired` | 400 | License expired |
| `max_devices_reached` | 429 | Too many devices activated |
| `server_error` | 500 | Internal server error |

---

## Future Enhancements

1. **Analytics Dashboard:**
   - Số lượng activations theo ngày/tháng
   - Top apps
   - User growth chart

2. **Email Notifications:**
   - License sắp hết hạn → email user
   - Renew request mới → email admin
   - License activated → email user

3. **Webhook:**
   - Notify external systems khi có event (license created, activated, renewed)

4. **API Versioning:**
   - `/v1/activate`, `/v2/activate`
   - Backward compatibility

5. **Multi-tenancy:**
   - Nhiều organization/company
   - Mỗi org có admin riêng

6. **License Templates:**
   - Admin tạo template (vd: "Basic Plan", "Pro Plan")
   - 1 click tạo license theo template

---

## Tài Liệu Tham Khảo

- Database schema: `/server/sql/schema.sql`
- API implementation: `/server/modules/`
- Client example: `/examples/electron-client/`
- Deployment guide: `/docs/DEPLOYMENT.md`
