# VPS Setup Quick Guide

Hướng dẫn nhanh deploy lên VPS với 2 domains.

---

## 🎯 Mục Tiêu

- **Frontend**: license.dangthanhson.com (Nginx serve static files)
- **Backend**: api.dangthanhson.com (Nginx → Node.js:3000)

---

## 📋 Prerequisites

- VPS Ubuntu đã có Nginx
- DNS đã trỏ 2 domains về VPS IP
- MySQL đã cài và chạy
- Node.js đã cài (v18+)
- PM2 đã cài (`npm install -g pm2`)

---

## 🚀 Deployment Steps

### 1. Build Frontend

```bash
cd ~/apps/license-active

# Tạo .env cho production build
nano .env

# Thêm:
VITE_API_URL=https://api.dangthanhson.com
```

Build:
```bash
npm run build
# → Output: dist/
```

### 2. Deploy Frontend lên Nginx

```bash
# Tạo thư mục web root
sudo mkdir -p /var/www/license-app

# Copy build files
sudo cp -r dist/* /var/www/license-app/

# Set permissions
sudo chown -R www-data:www-data /var/www/license-app
sudo chmod -R 755 /var/www/license-app

# Verify
ls -la /var/www/license-app/
```

### 3. Cấu Hình Nginx - Frontend

```bash
sudo nano /etc/nginx/sites-available/license-frontend
```

**Paste nội dung:**

```nginx
server {
    listen 80;
    server_name license.dangthanhson.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name license.dangthanhson.com;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/license.dangthanhson.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/license.dangthanhson.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Web root
    root /var/www/license-app;
    index index.html;

    # Logs
    access_log /var/log/nginx/license-frontend-access.log;
    error_log /var/log/nginx/license-frontend-error.log;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Cache static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable:
```bash
sudo ln -s /etc/nginx/sites-available/license-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Cấu Hình Nginx - Backend API

```bash
sudo nano /etc/nginx/sites-available/license-backend
```

**Paste nội dung:**

```nginx
server {
    listen 80;
    server_name api.dangthanhson.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.dangthanhson.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/api.dangthanhson.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.dangthanhson.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Logs
    access_log /var/log/nginx/license-backend-access.log;
    error_log /var/log/nginx/license-backend-error.log;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Reverse proxy to Node.js
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

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }
}
```

Enable:
```bash
sudo ln -s /etc/nginx/sites-available/license-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Backend Setup

```bash
cd ~/apps/license-active

# Setup .env
nano .env
```

**Paste:**
```bash
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=license_user
DB_PASS=your_actual_password
DB_NAME=license_db
JWT_SECRET=your_generated_jwt_secret
DEVICE_SALT=your_generated_device_salt
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
FRONTEND_URL=https://license.dangthanhson.com
```

**Start backend:**
```bash
pm2 start npm --name license-api -- run backend
pm2 save
pm2 startup  # Follow instructions
```

### 6. SSL Certificates

Nếu chưa có SSL:

```bash
# Frontend
sudo certbot --nginx -d license.dangthanhson.com

# Backend
sudo certbot --nginx -d api.dangthanhson.com

# Auto-renewal check
sudo certbot renew --dry-run
```

---

## ✅ Verification

### 1. Frontend

```bash
curl https://license.dangthanhson.com
# → HTML content

# Hoặc mở browser
```

### 2. Backend

```bash
curl https://api.dangthanhson.com/health
# → {"ok":true}
```

### 3. CORS

Mở https://license.dangthanhson.com → Login → Check Network tab:
- API calls đến `https://api.dangthanhson.com`
- No CORS errors

---

## 🔄 Update Frontend

Khi có thay đổi code:

```bash
cd ~/apps/license-active

# Pull code mới (nếu dùng git)
git pull

# Rebuild
VITE_API_URL=https://api.dangthanhson.com npm run build

# Deploy
sudo rm -rf /var/www/license-app/*
sudo cp -r dist/* /var/www/license-app/
sudo chown -R www-data:www-data /var/www/license-app
```

**Script tự động:**

```bash
nano ~/deploy-frontend.sh
```

```bash
#!/bin/bash
set -e

echo "🚀 Deploying frontend..."

cd ~/apps/license-active

# Build
echo "📦 Building..."
VITE_API_URL=https://api.dangthanhson.com npm run build

# Deploy
echo "🚢 Deploying to /var/www/license-app..."
sudo rm -rf /var/www/license-app/*
sudo cp -r dist/* /var/www/license-app/
sudo chown -R www-data:www-data /var/www/license-app

echo "✅ Done! Visit: https://license.dangthanhson.com"
```

```bash
chmod +x ~/deploy-frontend.sh
./deploy-frontend.sh
```

---

## 🔄 Update Backend

```bash
cd ~/apps/license-active
git pull
pm2 restart license-api
pm2 logs license-api
```

---

## 🐛 Troubleshooting

### Frontend không load

```bash
# Check files
ls -la /var/www/license-app/

# Check Nginx config
sudo nginx -t

# Check logs
sudo tail -f /var/log/nginx/license-frontend-error.log

# Rebuild
npm run build
sudo cp -r dist/* /var/www/license-app/
```

### Backend 502 Bad Gateway

```bash
# Check backend running
pm2 status

# Check logs
pm2 logs license-api

# Restart
pm2 restart license-api

# Check port
netstat -tlnp | grep 3000
```

### CORS errors

```bash
# Check backend .env
grep FRONTEND_URL .env
# → FRONTEND_URL=https://license.dangthanhson.com

# Restart backend
pm2 restart license-api
```

### SSL errors

```bash
# Check certificates
sudo certbot certificates

# Renew
sudo certbot renew

# Reload Nginx
sudo systemctl reload nginx
```

---

## 📊 Checklist

VPS Production Setup:

- [ ] DNS đã trỏ về VPS IP
- [ ] Nginx đã cài
- [ ] MySQL đã cài và running
- [ ] Node.js + PM2 đã cài
- [ ] Database `license_db` đã tạo
- [ ] Import schema SQL
- [ ] Tạo RSA keys (private.pem)
- [ ] Build frontend (với VITE_API_URL production)
- [ ] Deploy frontend → /var/www/license-app/
- [ ] Nginx config frontend (license.dangthanhson.com)
- [ ] Nginx config backend (api.dangthanhson.com)
- [ ] Backend .env với FRONTEND_URL production
- [ ] PM2 start backend
- [ ] SSL certificates cho cả 2 domains
- [ ] Test: https://license.dangthanhson.com
- [ ] Test: https://api.dangthanhson.com/health
- [ ] No CORS errors

---

## 🎯 Architecture

```
Port 80/443 (Nginx)
├── license.dangthanhson.com → /var/www/license-app/ (static)
└── api.dangthanhson.com → localhost:3000 (Node.js/PM2)
```

---

**Ready to go! 🚀**
