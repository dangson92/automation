# License Key Server (Electron/NodeJS)

Backend quản lý License Key: Admin tạo/duyệt, User xem/gửi gia hạn, Client kích hoạt theo `licenseKey + appCode + deviceId` (JWT RS256 30 ngày).

## Chạy Nhanh

### Development (Local với Domains)

**Bước 1: Cấu hình /etc/hosts**
```bash
# Linux/macOS: sudo nano /etc/hosts
# Windows: C:\Windows\System32\drivers\etc\hosts (as Admin)

# Thêm vào:
127.0.0.1   license.dangthanhson.com
127.0.0.1   api.dangthanhson.com
```

**Bước 2: Backend API (Terminal 1)**
```bash
cp .env.example .env
nano .env  # FRONTEND_URL=http://license.dangthanhson.com
npm install
npm run backend
# Test: curl http://api.dangthanhson.com:3000/health
```

**Bước 3: Frontend UI (Terminal 2)**
```bash
cp .env.development.example .env
nano .env  # VITE_API_URL=http://api.dangthanhson.com:3000
sudo npm run dev
# Truy cập: http://license.dangthanhson.com
```

📖 **Chi tiết:** [Local Development Guide](docs/LOCAL_DEVELOPMENT.md)

### Production (VPS)

**Backend:**
```bash
pm2 start npm --name license-api -- run backend
pm2 save && pm2 startup
```

**Frontend:**
```bash
VITE_API_URL=https://api.dangthanhson.com npm run build
# Deploy dist/ lên /var/www/license-app/
```

## 🌐 Production URLs

Hệ thống tách thành 2 domains riêng biệt:

- **Frontend (Admin/User UI)**: https://license.dangthanhson.com
- **Backend API**: https://api.dangthanhson.com

**API Endpoints:**
- Health: `https://api.dangthanhson.com/health`
- Auth: `https://api.dangthanhson.com/auth/login`
- Activate: `https://api.dangthanhson.com/activate`
- Admin: `https://api.dangthanhson.com/admin/*`
- User: `https://api.dangthanhson.com/user/*`

**Client Apps** (Electron/NodeJS) sử dụng: `https://api.dangthanhson.com`

## Tính năng

- **Admin**: tạo apps, tạo license cho user, xem/lọc license, xem chi tiết kích hoạt, approve/reject yêu cầu gia hạn
- **User**: đăng ký/đăng nhập, xem danh sách license của riêng họ, xem chi tiết license, tạo yêu cầu gia hạn
- **Client Electron/Node**: kích hoạt license theo `licenseKey + appCode + deviceId`, nhận JWT RS256 30 ngày để verify offline
- **Bảo mật**: `helmet`, rate limit `/activate`, JWT user bằng `JWT_SECRET`, token kích hoạt ký bằng `PRIVATE_KEY` (RS256), `deviceId` được hash với `DEVICE_SALT`

## Công nghệ

- Backend: Node.js + Express
- Database: MySQL (`mysql2`)
- Auth: JWT (`jsonwebtoken`) + Bcrypt (`bcryptjs`)
- Bảo vệ: `helmet`, `cors`, `express-rate-limit`, `morgan`

## 📚 Tài Liệu Chi Tiết

- **[Local Development](docs/LOCAL_DEVELOPMENT.md)** - Setup development local với domains
- **[Kiến Trúc Hệ Thống](docs/ARCHITECTURE.md)** - Mô tả chi tiết database schema, API flow, security model
- **[Hướng Dẫn Triển Khai VPS](docs/DEPLOYMENT.md)** - Hướng dẫn từng bước triển khai lên Ubuntu VPS
- **[Cấu Hình Nginx 2 Domains](docs/NGINX_TWO_DOMAINS.md)** - Tách Frontend và Backend ra 2 domains riêng biệt
- **[Code Mẫu Client Electron](examples/electron-client/README.md)** - Tích hợp license vào ứng dụng Electron/NodeJS

## Cấu trúc dự án

```
.
├── server/                   # Backend Node.js
│   ├── index.js              # Khởi tạo Express, middleware, router
│   ├── db.js                 # Kết nối MySQL
│   ├── modules/
│   │   ├── auth.js          # Đăng ký/đăng nhập, middleware requireUser/requireAdmin
│   │   ├── user.js          # API user (licenses, renew-requests)
│   │   ├── admin.js         # API admin (apps, licenses, renew-requests)
│   │   └── activate.js      # API kích hoạt client
│   └── sql/
│       └── schema.sql       # Schema MySQL
├── docs/                     # Tài liệu hệ thống
│   ├── ARCHITECTURE.md       # Kiến trúc chi tiết
│   └── DEPLOYMENT.md         # Hướng dẫn triển khai VPS
├── examples/                 # Code mẫu
│   └── electron-client/      # Ví dụ tích hợp Electron
│       ├── licenseManager.js # License manager class
│       ├── main.js           # Main process integration
│       └── README.md         # Hướng dẫn sử dụng
├── .env                      # Biến môi trường (không commit)
├── .env.example              # Template file .env
└── package.json
```

## Yêu cầu hệ thống

- Node.js LTS (v18 trở lên)
- MySQL Server 8.0+
- npm hoặc yarn

## Cài đặt

### 1. Cài đặt MySQL Server

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

### 2. Tạo Database và User

```bash
# Đăng nhập MySQL với quyền root
mysql -u root -p

# Tạo database
CREATE DATABASE license_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Tạo user và cấp quyền
CREATE USER 'license_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON license_db.* TO 'license_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 3. Import Schema

```bash
mysql -u license_user -p license_db < server/sql/schema.sql
```

### 4. Cài đặt Dependencies

```bash
npm install
```

### 5. Cấu hình biến môi trường

Tạo file `.env` trong thư mục gốc:

```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=license_user
DB_PASS=your_password
DB_NAME=license_db
JWT_SECRET=your_jwt_secret_here
DEVICE_SALT=your_device_salt_here
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYour_Private_Key_Here\n-----END PRIVATE KEY-----
```

**Lưu ý:**
- `JWT_SECRET`: Chuỗi ngẫu nhiên dài tối thiểu 32 ký tự
- `DEVICE_SALT`: Chuỗi ngẫu nhiên để hash deviceId
- `PRIVATE_KEY`: RSA Private Key (PEM format) để ký token kích hoạt. Client sẽ cần Public Key tương ứng để verify

**Tạo RSA Key Pair:**
```bash
# Tạo private key
openssl genrsa -out private.pem 2048

# Tạo public key từ private key
openssl rsa -in private.pem -pubout -out public.pem

# Xem private key để copy vào .env (nhớ thay \n cho xuống dòng)
cat private.pem
```

## Chạy ứng dụng

### Development

```bash
npm run server
```

### Production (với PM2)

```bash
pm2 start npm --name license-server -- run server
pm2 save
pm2 startup
```

### Kiểm tra Health Check

```bash
curl http://localhost:3000/health
```

Kết quả: `{"ok":true}`

## Khởi tạo dữ liệu

### 1. Tạo tài khoản Admin

```bash
# Đăng ký user mới qua API
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin@123",
    "name": "Administrator"
  }'

# Cập nhật role thành admin trong database
mysql -u license_user -p license_db -e "UPDATE users SET role='admin' WHERE email='admin@example.com';"
```

### 2. Đăng nhập và lấy token

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin@123"
  }'
```

### 3. Tạo App (với Admin token)

```bash
curl -X POST http://localhost:3000/admin/apps \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "code": "APP001",
    "name": "My Application"
  }'
```

### 4. Tạo License cho User

```bash
curl -X POST http://localhost:3000/admin/licenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "user_id": 1,
    "app_id": 1,
    "max_devices": 3,
    "expires_at": "2025-12-31T23:59:59Z",
    "status": "active"
  }'
```

## API Endpoints

### Auth

| Method | Endpoint | Mô tả | Auth |
|--------|----------|-------|------|
| POST | `/auth/register` | Đăng ký user mới (role mặc định: `user`) | - |
| POST | `/auth/login` | Đăng nhập, trả về JWT | - |

### User APIs (yêu cầu Bearer token)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/user/licenses` | Danh sách license của user hiện tại |
| GET | `/user/licenses/:id` | Chi tiết license + activations |
| POST | `/user/licenses/:id/renew-requests` | Tạo yêu cầu gia hạn |
| GET | `/user/renew-requests` | Danh sách yêu cầu gia hạn |

### Admin APIs (yêu cầu Admin token)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/admin/users` | Danh sách users |
| GET | `/admin/apps` | Danh sách apps |
| POST | `/admin/apps` | Tạo app mới |
| GET | `/admin/licenses` | Danh sách licenses (có filter) |
| POST | `/admin/licenses` | Tạo license mới |
| GET | `/admin/licenses/:id` | Chi tiết license + activations |
| PATCH | `/admin/licenses/:id` | Cập nhật license |
| GET | `/admin/renew-requests` | Danh sách yêu cầu gia hạn |
| PATCH | `/admin/renew-requests/:id` | Approve/Reject yêu cầu gia hạn |

### Client Activation API

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/activate` | Kích hoạt license từ client |

**Request body:**
```json
{
  "licenseKey": "XXXX-XXXX-XXXX",
  "appCode": "APP001",
  "deviceId": "unique-device-identifier",
  "appVersion": "1.0.0"
}
```

**Response:**
```json
{
  "token": "JWT_TOKEN_30_DAYS",
  "licenseInfo": {
    "licenseKey": "XXXX-XXXX-XXXX",
    "appCode": "APP001",
    "expiresAt": "2025-12-31T23:59:59Z",
    "maxDevices": 3
  }
}
```

## Triển khai trên VPS Ubuntu

### 1. Chuẩn bị VPS

```bash
# Tạo user hệ thống
sudo adduser licenseapp
sudo usermod -aG sudo licenseapp

# Copy SSH key từ máy local
ssh-copy-id licenseapp@your-server-ip

# Cấu hình SSH an toàn
sudo nano /etc/ssh/sshd_config
# Đặt: PasswordAuthentication no
#      PermitRootLogin no
sudo systemctl restart ssh
```

### 2. Cài đặt môi trường

```bash
# Cài Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# Cài PM2 global
sudo npm install -g pm2

# Cài Git
sudo apt install -y git

# Cài MySQL
sudo apt update
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

### 3. Cài đặt phpMyAdmin (tùy chọn)

```bash
sudo apt install -y phpmyadmin php-fpm php-mbstring php-zip php-gd php-json php-curl

# Cấu hình Nginx cho phpMyAdmin
sudo nano /etc/nginx/sites-available/license-server
```

Thêm location block:
```nginx
location /phpmyadmin {
    root /usr/share;
    index index.php;
    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $request_filename;
        include fastcgi_params;
    }
}
```

### 4. Clone và cấu hình project

```bash
# Đăng nhập với user licenseapp
su - licenseapp

# Tạo thư mục apps
mkdir -p ~/apps
cd ~/apps

# Clone project (hoặc dùng rsync/scp)
git clone your-repo-url license-active
cd license-active

# Cài dependencies
npm install

# Tạo file .env
nano .env
# (Copy nội dung từ phần Cấu hình biến môi trường)
chmod 600 .env
```

### 5. Khởi động với PM2

```bash
# Start server
pm2 start npm --name license-server -- run server

# Tự động khởi động cùng hệ thống
pm2 save
pm2 startup systemd
# (Chạy lệnh được in ra để enable startup)

# Kiểm tra logs
pm2 logs license-server
```

### 6. Cài đặt Nginx Reverse Proxy

```bash
sudo apt install -y nginx

# Tạo server block
sudo nano /etc/nginx/sites-available/license-server
```

Nội dung file:
```nginx
server {
    listen 80;
server_name license.dangthanhson.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Kích hoạt site:
```bash
sudo ln -s /etc/nginx/sites-available/license-server /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Cài đặt SSL với Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d license.dangthanhson.com

# Tự động gia hạn
sudo systemctl status certbot.timer
```

### 8. Cấu hình Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

### 9. Quy trình cập nhật

```bash
cd ~/apps/license-active
git pull
npm install
pm2 restart license-server
pm2 logs license-server

# Kiểm tra health
curl -f http://127.0.0.1:3000/health
```

## Bảo mật

- ✅ Bắt buộc sử dụng HTTPS khi triển khai production
- ✅ Không bao giờ gửi `PRIVATE_KEY` xuống client
- ✅ Client chỉ nhận `PUBLIC_KEY` để verify token
- ✅ Token kích hoạt có thời hạn 30 ngày
- ✅ Rate limit được áp dụng cho endpoint `/activate`
- ✅ `deviceId` được hash với `DEVICE_SALT` trước khi lưu
- ✅ JWT user token sử dụng `JWT_SECRET` để ký
- ✅ Logging với `morgan` để theo dõi requests

## Ghi chú

- License key được tự động sinh theo định dạng `XXXX-XXXX-XXXX` khi tạo mới
- Token kích hoạt hết hạn sau 30 ngày, client cần activate lại để gia hạn token
- Yêu cầu gia hạn cần admin approve, nếu được duyệt sẽ tự động cộng thêm 30 ngày vào `expires_at`
- Frontend React (Vite) đã có sẵn trong thư mục gốc cho giao diện quản trị

## Quản trị MySQL & ENV

### Tạo/Quản lý User SQL

```bash
# Tạo user mới và cấp quyền
mysql -u root -p -e "CREATE USER 'license_user'@'localhost' IDENTIFIED BY 'your_password';"
mysql -u root -p -e "GRANT ALL PRIVILEGES ON license_db.* TO 'license_user'@'localhost'; FLUSH PRIVILEGES;"

# Đổi mật khẩu user
mysql -u root -p -e "ALTER USER 'license_user'@'localhost' IDENTIFIED BY 'new_password'; FLUSH PRIVILEGES;"

# (Tuỳ chọn) cho phép kết nối từ IP khác (cần cấu hình tường lửa và bind-address)
mysql -u root -p -e "CREATE USER 'license_user'@'%' IDENTIFIED BY 'your_password';"
mysql -u root -p -e "GRANT ALL PRIVILEGES ON license_db.* TO 'license_user'@'%'; FLUSH PRIVILEGES;"
```

### Cập nhật Database (schema)

- Sao lưu trước khi cập nhật:
```bash
mysqldump -u license_user -p license_db > backup_$(date +%F).sql
```
- Áp dụng thay đổi schema (chạy lại toàn bộ schema nếu cần):
```bash
mysql -u license_user -p license_db < server/sql/schema.sql
```
- Áp dụng thay đổi nhỏ (ví dụ thêm cột):
```sql
ALTER TABLE licenses ADD COLUMN meta JSON NULL;
```

### Cập nhật ENV

- Sửa `.env` khi thay đổi DB hoặc secrets:
```bash
nano .env
# Sau khi chỉnh sửa, giới hạn quyền file
chmod 600 .env
```
- Khởi động lại tiến trình để nạp env mới:
```bash
pm2 restart license-server
```
