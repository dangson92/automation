# Cấu Hình Nginx Cho 2 Domains

Hướng dẫn cấu hình Nginx để tách Frontend và Backend ra 2 domains riêng biệt.

---

## Kiến Trúc

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS/BROWSERS                          │
└─────────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴────────────┐
                │                        │
        ┌───────▼─────────┐    ┌────────▼────────┐
        │   Frontend      │    │   Backend API   │
        │ license.domain  │    │  api.domain     │
        │   (Port 443)    │    │   (Port 443)    │
        └───────┬─────────┘    └────────┬────────┘
                │                        │
                │                        │
        ┌───────▼─────────┐    ┌────────▼────────┐
        │   Vite Build    │    │  Express App    │
        │   (Static)      │    │  (Port 3000)    │
        │ /var/www/html   │    │  localhost:3000 │
        └─────────────────┘    └─────────────────┘
```

---

## 1. Cấu Hình Backend API (api.dangthanhson.com)

### File: `/etc/nginx/sites-available/api-license-server`

```nginx
# Backend API Server
server {
    listen 80;
    server_name api.dangthanhson.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.dangthanhson.com;

    # SSL Configuration (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/api.dangthanhson.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.dangthanhson.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Logs
    access_log /var/log/nginx/api-license-access.log;
    error_log /var/log/nginx/api-license-error.log;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # CORS Headers (handled by Express, but can add backup here)
    add_header Access-Control-Allow-Origin "https://license.dangthanhson.com" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept" always;
    add_header Access-Control-Allow-Credentials "true" always;

    # Handle preflight requests
    if ($request_method = 'OPTIONS') {
        add_header Access-Control-Allow-Origin "https://license.dangthanhson.com" always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept" always;
        add_header Access-Control-Max-Age 86400;
        add_header Content-Type "text/plain charset=UTF-8";
        add_header Content-Length 0;
        return 204;
    }

    # Reverse proxy to Node.js Express
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

    # Health check endpoint (no auth, no log)
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }

    # Rate limiting for sensitive endpoints (optional, already in Express)
    # location /activate {
    #     limit_req zone=activate_limit burst=20 nodelay;
    #     proxy_pass http://127.0.0.1:3000;
    # }
}
```

---

## 2. Cấu Hình Frontend (license.dangthanhson.com)

### File: `/etc/nginx/sites-available/frontend-license-app`

```nginx
# Frontend Application
server {
    listen 80;
    server_name license.dangthanhson.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name license.dangthanhson.com;

    # SSL Configuration (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/license.dangthanhson.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/license.dangthanhson.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Logs
    access_log /var/log/nginx/frontend-license-access.log;
    error_log /var/log/nginx/frontend-license-error.log;

    # Root directory (Vite build output)
    root /var/www/license-app;
    index index.html;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # SPA fallback (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Disable access to hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

---

## 3. Triển Khai

### Bước 1: Tạo thư mục cho frontend build

```bash
# Tạo thư mục
sudo mkdir -p /var/www/license-app

# Chown cho user licenseapp
sudo chown -R licenseapp:licenseapp /var/www/license-app
```

### Bước 2: Build frontend

```bash
# Đăng nhập với user licenseapp
su - licenseapp

# Vào thư mục project
cd ~/apps/license-active

# Tạo file .env cho frontend
nano .env

# Thêm:
VITE_API_URL=https://api.dangthanhson.com

# Build frontend
npm run build

# Copy build output sang /var/www
cp -r dist/* /var/www/license-app/
```

### Bước 3: Tạo Nginx config cho Backend API

```bash
# Tạo file config
sudo nano /etc/nginx/sites-available/api-license-server

# Paste nội dung từ phần 1 ở trên

# Enable site
sudo ln -s /etc/nginx/sites-available/api-license-server /etc/nginx/sites-enabled/

# Test config
sudo nginx -t
```

### Bước 4: Tạo Nginx config cho Frontend

```bash
# Tạo file config
sudo nano /etc/nginx/sites-available/frontend-license-app

# Paste nội dung từ phần 2 ở trên

# Enable site
sudo ln -s /etc/nginx/sites-available/frontend-license-app /etc/nginx/sites-enabled/

# Test config
sudo nginx -t
```

### Bước 5: Xóa config cũ (nếu có)

```bash
# Disable old config
sudo rm /etc/nginx/sites-enabled/license-server

# Reload Nginx
sudo systemctl reload nginx
```

### Bước 6: Cấu hình DNS

Trên DNS provider của bạn, thêm 2 A records:

```
api.dangthanhson.com      →  VPS_IP_ADDRESS
license.dangthanhson.com  →  VPS_IP_ADDRESS
```

### Bước 7: Lấy SSL certificates

```bash
# Dừng Nginx tạm thời (nếu port 80 đang bận)
sudo systemctl stop nginx

# Lấy cert cho API domain
sudo certbot certonly --standalone -d api.dangthanhson.com

# Lấy cert cho Frontend domain
sudo certbot certonly --standalone -d license.dangthanhson.com

# Start Nginx lại
sudo systemctl start nginx

# Hoặc dùng --nginx plugin (tự động)
sudo certbot --nginx -d api.dangthanhson.com
sudo certbot --nginx -d license.dangthanhson.com
```

### Bước 8: Cập nhật Backend .env

```bash
nano ~/apps/license-active/.env

# Thêm/cập nhật:
FRONTEND_URL=https://license.dangthanhson.com
```

### Bước 9: Restart Backend

```bash
pm2 restart license-server
```

### Bước 10: Test

**Test API:**
```bash
curl https://api.dangthanhson.com/health
# → {"ok":true}
```

**Test Frontend:**
```bash
curl https://license.dangthanhson.com
# → HTML content
```

**Test CORS từ browser:**
- Mở https://license.dangthanhson.com
- Đăng nhập → kiểm tra API calls trong Network tab

---

## 4. Cấu Hình Package.json (Frontend)

Thêm vào `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "npm run build && rsync -avz dist/ licenseapp@your-vps-ip:/var/www/license-app/"
  }
}
```

**Deploy từ máy local:**
```bash
npm run deploy
```

---

## 5. Auto Deploy Script

Tạo script deploy tự động:

```bash
nano ~/deploy-frontend.sh
```

Nội dung:

```bash
#!/bin/bash

set -e

echo "🚀 Deploying Frontend..."

cd ~/apps/license-active

# Pull latest code (nếu dùng git)
echo "📥 Pulling latest code..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build
echo "🔨 Building frontend..."
npm run build

# Copy to web root
echo "📋 Copying to /var/www/license-app..."
sudo cp -r dist/* /var/www/license-app/

# Set permissions
sudo chown -R licenseapp:licenseapp /var/www/license-app

echo "✅ Frontend deployed successfully!"
echo "🌐 Visit: https://license.dangthanhson.com"
```

Chmod:
```bash
chmod +x ~/deploy-frontend.sh
```

Chạy:
```bash
./deploy-frontend.sh
```

---

## 6. Nginx Rate Limiting (Optional)

Nếu muốn thêm rate limit ở Nginx level (ngoài Express):

Thêm vào `/etc/nginx/nginx.conf` trong `http` block:

```nginx
http {
    # ... existing config

    # Rate limit zones
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=activate_limit:10m rate=1r/s;

    # ... rest of config
}
```

Trong server block của API:

```nginx
location / {
    limit_req zone=api_limit burst=20 nodelay;
    proxy_pass http://127.0.0.1:3000;
    # ... other proxy settings
}

location /activate {
    limit_req zone=activate_limit burst=5 nodelay;
    proxy_pass http://127.0.0.1:3000;
    # ... other proxy settings
}
```

---

## 7. Monitoring

### Check Nginx logs

```bash
# Frontend logs
sudo tail -f /var/log/nginx/frontend-license-access.log
sudo tail -f /var/log/nginx/frontend-license-error.log

# API logs
sudo tail -f /var/log/nginx/api-license-access.log
sudo tail -f /var/log/nginx/api-license-error.log
```

### Check SSL expiration

```bash
sudo certbot certificates
```

---

## 8. Troubleshooting

### CORS errors

**Triệu chứng:**
```
Access to XMLHttpRequest at 'https://api.dangthanhson.com/auth/login' from origin 'https://license.dangthanhson.com' has been blocked by CORS policy
```

**Fix:**
1. Check backend `.env`: `FRONTEND_URL=https://license.dangthanhson.com`
2. Restart backend: `pm2 restart license-server`
3. Check Nginx CORS headers trong API config

### SSL certificate not found

**Triệu chứng:**
```
nginx: [emerg] cannot load certificate "/etc/letsencrypt/live/api.dangthanhson.com/fullchain.pem"
```

**Fix:**
```bash
# Lấy certificate
sudo certbot certonly --standalone -d api.dangthanhson.com
sudo certbot certonly --standalone -d license.dangthanhson.com

# Reload Nginx
sudo systemctl reload nginx
```

### 502 Bad Gateway (API)

**Triệu chứng:** API trả về 502

**Fix:**
```bash
# Check backend running
pm2 status

# Check logs
pm2 logs license-server

# Restart backend
pm2 restart license-server
```

### Frontend shows blank page

**Triệu chứng:** Frontend trắng tinh

**Fix:**
```bash
# Check build output
ls -la /var/www/license-app/

# Rebuild
cd ~/apps/license-active
npm run build
sudo cp -r dist/* /var/www/license-app/

# Check Nginx config
sudo nginx -t

# Check browser console for errors
```

---

## 9. Checklist Triển Khai

- [ ] DNS A records cho cả 2 domains
- [ ] Build frontend với `VITE_API_URL` đúng
- [ ] Copy build output sang `/var/www/license-app`
- [ ] Tạo Nginx config cho API
- [ ] Tạo Nginx config cho Frontend
- [ ] Enable cả 2 sites
- [ ] Test Nginx config (`nginx -t`)
- [ ] Lấy SSL certificates cho cả 2 domains
- [ ] Cập nhật backend `.env` với `FRONTEND_URL`
- [ ] Restart backend (`pm2 restart`)
- [ ] Reload Nginx (`systemctl reload nginx`)
- [ ] Test API: `curl https://api.dangthanhson.com/health`
- [ ] Test Frontend: Mở browser → https://license.dangthanhson.com
- [ ] Test CORS: Login → check Network tab
- [ ] Setup auto-renew SSL (certbot timer)
- [ ] Setup deploy script

---

## 10. Kết Luận

Sau khi hoàn thành, bạn có:

- ✅ **Frontend**: https://license.dangthanhson.com (Vite static files)
- ✅ **Backend API**: https://api.dangthanhson.com (Node.js Express)
- ✅ CORS configured properly
- ✅ SSL/TLS encryption
- ✅ Nginx reverse proxy
- ✅ Auto-deploy script

**URLs:**
- Admin/User UI: https://license.dangthanhson.com
- API Health: https://api.dangthanhson.com/health
- API Login: https://api.dangthanhson.com/auth/login
- API Activate: https://api.dangthanhson.com/activate

**Client apps** (Electron) sẽ dùng: `https://api.dangthanhson.com`
