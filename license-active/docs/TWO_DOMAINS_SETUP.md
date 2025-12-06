# Thiết Lập 2 Domains - Quick Guide

Tài liệu nhanh về việc tách Frontend và Backend thành 2 domains.

---

## 🎯 Mục Tiêu

Tách hệ thống thành 2 domains riêng biệt:

1. **license.dangthanhson.com** → Frontend (React/Vite) - Giao diện Admin/User
2. **api.dangthanhson.com** → Backend (Node.js/Express) - API Server

---

## 📋 Checklist Nhanh

### 1. DNS Configuration

Thêm 2 A records trên DNS provider:

```
license.dangthanhson.com  →  YOUR_VPS_IP
api.dangthanhson.com      →  YOUR_VPS_IP
```

### 2. Backend Configuration

**File: `server/index.js`**
- ✅ CORS đã cấu hình để accept request từ `https://license.dangthanhson.com`

**File: `.env`**
```bash
FRONTEND_URL=https://license.dangthanhson.com
```

### 3. Frontend Configuration

**File: `.env`** (ở root project)
```bash
VITE_API_URL=https://api.dangthanhson.com
```

**File: `config.ts`**
- ✅ Đã tạo sẵn với API_URL config

### 4. Build Frontend

```bash
# Development
npm run dev  # → http://localhost:3000

# Production
VITE_API_URL=https://api.dangthanhson.com npm run build

# Output: dist/
```

### 5. Deploy Frontend

```bash
# Copy build output to web root
sudo mkdir -p /var/www/license-app
sudo chown licenseapp:licenseapp /var/www/license-app
cp -r dist/* /var/www/license-app/
```

### 6. Nginx Configuration

**Backend API:**
```bash
sudo nano /etc/nginx/sites-available/api-license-server
```

Copy config từ: [docs/NGINX_TWO_DOMAINS.md](NGINX_TWO_DOMAINS.md#1-cấu-hình-backend-api-apidangthanhsoncom)

**Frontend:**
```bash
sudo nano /etc/nginx/sites-available/frontend-license-app
```

Copy config từ: [docs/NGINX_TWO_DOMAINS.md](NGINX_TWO_DOMAINS.md#2-cấu-hình-frontend-licensedangthanhsoncom)

**Enable sites:**
```bash
sudo ln -s /etc/nginx/sites-available/api-license-server /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/frontend-license-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. SSL Certificates

```bash
# API domain
sudo certbot --nginx -d api.dangthanhson.com

# Frontend domain
sudo certbot --nginx -d license.dangthanhson.com
```

### 8. Restart Backend

```bash
pm2 restart license-server
pm2 logs license-server
```

---

## ✅ Verification

### Test API

```bash
curl https://api.dangthanhson.com/health
# → {"ok":true}
```

### Test Frontend

Mở browser: https://license.dangthanhson.com

### Test CORS

1. Mở https://license.dangthanhson.com
2. Đăng nhập
3. Mở DevTools → Network tab
4. Kiểm tra API calls đến `https://api.dangthanhson.com`
5. Không có CORS errors

---

## 🔧 Client Apps

Electron/Node client apps phải dùng:

```javascript
const licenseManager = new LicenseManager({
  serverUrl: 'https://api.dangthanhson.com',  // ← Backend API
  appCode: 'APP001',
  // ...
})
```

---

## 📖 Chi Tiết

Xem tài liệu đầy đủ tại: [docs/NGINX_TWO_DOMAINS.md](NGINX_TWO_DOMAINS.md)

---

## 🚨 Troubleshooting

### CORS Error

**Triệu chứng:**
```
Access to XMLHttpRequest blocked by CORS policy
```

**Fix:**
1. Check backend `.env`: `FRONTEND_URL=https://license.dangthanhson.com`
2. Restart: `pm2 restart license-server`

### Frontend không load được

**Fix:**
1. Check build: `ls /var/www/license-app/`
2. Rebuild: `npm run build`
3. Copy lại: `cp -r dist/* /var/www/license-app/`

### SSL certificate error

**Fix:**
```bash
sudo certbot certificates
sudo certbot renew
sudo systemctl reload nginx
```

---

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│              USERS/BROWSERS                     │
└─────────────────────────────────────────────────┘
                    │
        ┌───────────┴────────────┐
        │                        │
┌───────▼─────────┐    ┌────────▼────────┐
│   Frontend      │    │   Backend API   │
│ license.domain  │    │  api.domain     │
│   (Vite SPA)    │───▶│  (Express)      │
└─────────────────┘    └─────────────────┘
                              │
                       ┌──────▼──────┐
                       │   MySQL     │
                       └─────────────┘
```

---

## 🎉 Kết Quả

Sau khi hoàn thành:

- ✅ Frontend: https://license.dangthanhson.com
- ✅ Backend API: https://api.dangthanhson.com
- ✅ CORS configured
- ✅ SSL/TLS enabled
- ✅ Client apps dùng API domain
