# Local Development với Domains

Hướng dẫn chạy development local sử dụng domains thay vì localhost.

---

## 🎯 Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Admin/User UI)                               │
│  license.dangthanhson.com → localhost:80                │
│  - Tạo/sửa/xóa license keys                            │
│  - Quản lý users, apps                                  │
│  - Xem activations                                      │
└─────────────────────────────────────────────────────────┘
                            │
                            │ API Calls
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Backend API Server                                     │
│  api.dangthanhson.com → localhost:3000                  │
│  - REST API endpoints                                   │
│  - Giao tiếp với MySQL                                  │
│  - Tools/clients kích hoạt license                     │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  MySQL Database                                         │
│  localhost:3306                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 📝 Cấu Hình /etc/hosts

### Linux / macOS

```bash
sudo nano /etc/hosts
```

Thêm vào cuối file:
```
127.0.0.1   license.dangthanhson.com
127.0.0.1   api.dangthanhson.com
```

Lưu và thoát (Ctrl+X, Y, Enter).

### Windows

**File:** `C:\Windows\System32\drivers\etc\hosts`

Mở Notepad **as Administrator**, sau đó mở file trên và thêm:
```
127.0.0.1   license.dangthanhson.com
127.0.0.1   api.dangthanhson.com
```

Lưu file.

---

## 🚀 Chạy Development

### 1. Backend API (Terminal 1)

```bash
cd ~/license-active

# Setup .env
cp .env.example .env
nano .env
# Điền DB credentials, JWT_SECRET, DEVICE_SALT, PRIVATE_KEY
# FRONTEND_URL=http://license.dangthanhson.com

# Chạy backend
npm run backend
```

**Kiểm tra:**
```bash
curl http://api.dangthanhson.com:3000/health
# → {"ok":true}
```

### 2. Frontend UI (Terminal 2)

```bash
cd ~/license-active

# Setup .env
cp .env.development.example .env
nano .env
# VITE_API_URL=http://api.dangthanhson.com:3000

# Chạy frontend (port 80 cần sudo)
sudo npm run dev
```

**Truy cập:** http://license.dangthanhson.com

---

## 🔧 Configuration Files

### Backend `.env`

```bash
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=license_user
DB_PASS=your_password
DB_NAME=license_db
JWT_SECRET=your_jwt_secret_here
DEVICE_SALT=your_device_salt_here
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----

# Frontend domain (cho CORS)
FRONTEND_URL=http://license.dangthanhson.com
```

### Frontend `.env`

```bash
# API Backend URL (với port)
VITE_API_URL=http://api.dangthanhson.com:3000
```

---

## 🌐 URLs

| Service | URL | Port | Mục đích |
|---------|-----|------|----------|
| Frontend | http://license.dangthanhson.com | 80 | Admin/User UI |
| Backend | http://api.dangthanhson.com:3000 | 3000 | REST API |
| MySQL | localhost | 3306 | Database |

---

## 🔒 CORS Configuration

Backend đã config CORS để accept requests từ frontend domain:

```javascript
// server/index.js
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://license.dangthanhson.com',
  credentials: true,
  optionsSuccessStatus: 200
}
```

**Lưu ý:** Development dùng `http://`, production dùng `https://`

---

## 📦 Production vs Development

### Development (Local)

```
Frontend: http://license.dangthanhson.com (port 80)
Backend:  http://api.dangthanhson.com:3000
```

### Production (VPS)

```
Frontend: https://license.dangthanhson.com (Nginx serve static)
Backend:  https://api.dangthanhson.com (Nginx → Node.js:3000)
```

---

## 🛠️ Troubleshooting

### 1. Domain không resolve

**Triệu chứng:** `curl: (6) Could not resolve host: license.dangthanhson.com`

**Fix:**
```bash
# Kiểm tra /etc/hosts
cat /etc/hosts | grep dangthanhson

# Nếu không có, thêm vào:
echo "127.0.0.1   license.dangthanhson.com" | sudo tee -a /etc/hosts
echo "127.0.0.1   api.dangthanhson.com" | sudo tee -a /etc/hosts
```

### 2. CORS Error

**Triệu chứng:** Browser console: `CORS policy blocked`

**Fix:**
```bash
# Check backend .env
grep FRONTEND_URL .env
# → FRONTEND_URL=http://license.dangthanhson.com

# Restart backend
npm run backend
```

### 3. Port 80 Permission Denied

**Triệu chứng:** `Error: listen EACCES: permission denied 0.0.0.0:80`

**Fix:**
```bash
# Option 1: Dùng sudo
sudo npm run dev

# Option 2: Setcap (chỉ 1 lần)
sudo setcap 'cap_net_bind_service=+ep' $(which node)
npm run dev  # Không cần sudo nữa

# Option 3: Đổi port (vite.config.ts)
# port: 8080  # Không cần sudo
```

### 4. Frontend không connect được API

**Triệu chứng:** Network tab: `Failed to fetch`

**Fix:**
```bash
# Check frontend .env
cat .env | grep VITE_API_URL
# → VITE_API_URL=http://api.dangthanhson.com:3000

# Test API trực tiếp
curl http://api.dangthanhson.com:3000/health

# Restart frontend
sudo npm run dev
```

---

## 🎯 Testing Flow

### 1. Test Backend API

```bash
# Health check
curl http://api.dangthanhson.com:3000/health
# → {"ok":true}

# Register user
curl -X POST http://api.dangthanhson.com:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@123","fullName":"Test User"}'
```

### 2. Test Frontend

1. Mở browser: http://license.dangthanhson.com
2. Đăng ký tài khoản
3. Đăng nhập
4. Kiểm tra Network tab → API calls đến `api.dangthanhson.com:3000`

### 3. Test Client Activation

```bash
# Từ client app
curl -X POST http://api.dangthanhson.com:3000/activate \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "ABCD-1234-EFGH",
    "appCode": "APP001",
    "deviceId": "test-device-123",
    "appVersion": "1.0.0"
  }'
```

---

## 📚 Tài Liệu Liên Quan

- [Architecture](ARCHITECTURE.md) - Kiến trúc tổng thể
- [Deployment](DEPLOYMENT.md) - Triển khai VPS production
- [Nginx 2 Domains](NGINX_TWO_DOMAINS.md) - Cấu hình Nginx cho production

---

## 💡 Tips

### Auto-start Development

Tạo script `dev-start.sh`:

```bash
#!/bin/bash

# Start backend
echo "Starting backend..."
npm run backend &
BACKEND_PID=$!

# Wait for backend
sleep 2

# Start frontend
echo "Starting frontend..."
sudo npm run dev &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Frontend: http://license.dangthanhson.com"
echo "Backend: http://api.dangthanhson.com:3000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
```

Sử dụng:
```bash
chmod +x dev-start.sh
./dev-start.sh
```

---

## 🔄 Workflow

```
1. Setup /etc/hosts (1 lần)
   ├── 127.0.0.1 license.dangthanhson.com
   └── 127.0.0.1 api.dangthanhson.com

2. Config .env files
   ├── Backend: .env (FRONTEND_URL)
   └── Frontend: .env (VITE_API_URL)

3. Start servers
   ├── Terminal 1: npm run backend (port 3000)
   └── Terminal 2: sudo npm run dev (port 80)

4. Development
   ├── Admin UI: http://license.dangthanhson.com
   ├── API: http://api.dangthanhson.com:3000
   └── Hot reload: Vite auto-reload khi code thay đổi

5. Deploy to production
   ├── Build: npm run build
   ├── Deploy frontend: dist/ → /var/www/license-app/
   └── Backend: pm2 start npm -- run backend
```

---

## ✅ Checklist

Development setup:

- [ ] Cấu hình `/etc/hosts` (2 domains)
- [ ] MySQL đã cài và running
- [ ] Database `license_db` đã tạo
- [ ] Import schema: `mysql < server/sql/schema.sql`
- [ ] Tạo RSA key pair (private.pem, public.pem)
- [ ] Backend `.env` đã config đầy đủ
- [ ] Frontend `.env` với `VITE_API_URL`
- [ ] Test backend: `curl http://api.dangthanhson.com:3000/health`
- [ ] Test frontend: `http://license.dangthanhson.com`
- [ ] No CORS errors trong browser console

---

**Happy Coding! 🚀**
