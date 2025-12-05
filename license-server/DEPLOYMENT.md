# Hướng Dẫn Triển Khai License Server Trên VPS

Hướng dẫn chi tiết triển khai hệ thống quản lý license lên VPS Ubuntu.

## Mục Lục

1. [Chuẩn Bị VPS](#1-chuẩn-bị-vps)
2. [Cài Đặt Môi Trường](#2-cài-đặt-môi-trường)
3. [Cấu Hình Database](#3-cấu-hình-database)
4. [Triển Khai Backend](#4-triển-khai-backend)
5. [Cấu Hình Nginx & SSL](#5-cấu-hình-nginx--ssl)
6. [Bảo Mật](#6-bảo-mật)
7. [Quản Lý & Monitoring](#7-quản-lý--monitoring)

---

## 1. Chuẩn Bị VPS

### 1.1. Yêu Cầu Tối Thiểu

- OS: Ubuntu 20.04 LTS hoặc 22.04 LTS
- RAM: 1GB (khuyến nghị 2GB)
- CPU: 1 core (khuyến nghị 2 cores)
- Storage: 20GB SSD
- Domain: api.dangthanhson.com (trỏ về IP VPS)

### 1.2. Tạo User Hệ Thống

```bash
# SSH vào VPS với user root
ssh root@your-vps-ip

# Tạo user mới cho deploy
adduser licenseapp
# Nhập password và thông tin (có thể skip các field khác bằng Enter)

# Thêm user vào sudo group (nếu cần quyền admin)
usermod -aG sudo licenseapp

# Chuyển sang user mới
su - licenseapp
```

### 1.3. Cấu Hình SSH Key Authentication

**Trên máy local:**

```bash
# Tạo SSH key (nếu chưa có)
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"

# Copy public key lên VPS
ssh-copy-id licenseapp@your-vps-ip
```

**Trên VPS (as licenseapp user):**

```bash
# Kiểm tra authorized_keys
cat ~/.ssh/authorized_keys

# Set permissions đúng
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### 1.4. Tắt Password Authentication (Tăng bảo mật)

```bash
# Chỉnh sửa SSH config (cần sudo)
sudo nano /etc/ssh/sshd_config

# Tìm và sửa các dòng sau:
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes

# Restart SSH service
sudo systemctl restart sshd
```

⚠️ **LƯU Ý:** Test kết nối SSH bằng key trước khi tắt password authentication!

---

## 2. Cài Đặt Môi Trường

### 2.1. Update Hệ Thống

```bash
sudo apt update
sudo apt upgrade -y
```

### 2.2. Cài Đặt Node.js

```bash
# Cài Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Kiểm tra version
node --version
npm --version
```

### 2.3. Cài Đặt MySQL

```bash
# Cài MySQL Server
sudo apt install -y mysql-server

# Chạy script bảo mật
sudo mysql_secure_installation

# Làm theo hướng dẫn:
# - Set root password: YES (chọn password mạnh)
# - Remove anonymous users: YES
# - Disallow root login remotely: YES
# - Remove test database: YES
# - Reload privilege tables: YES
```

### 2.4. Cài Đặt PM2

```bash
# Cài PM2 globally để quản lý Node.js process
sudo npm install -g pm2

# Cài đặt PM2 startup script
pm2 startup
# Copy và chạy command được gợi ý
```

### 2.5. Cài Đặt Nginx

```bash
sudo apt install -y nginx

# Start và enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## 3. Cấu Hình Database

### 3.1. Tạo Database User

```bash
# Login vào MySQL
sudo mysql -u root -p

# Trong MySQL console:
CREATE DATABASE license_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'license_user'@'localhost' IDENTIFIED BY 'YOUR_STRONG_PASSWORD_HERE';

GRANT ALL PRIVILEGES ON license_db.* TO 'license_user'@'localhost';

FLUSH PRIVILEGES;

EXIT;
```

### 3.2. Test Connection

```bash
mysql -u license_user -p license_db
# Nhập password và kiểm tra kết nối thành công
```

---

## 4. Triển Khai Backend

### 4.1. Clone Code

```bash
# Tạo thư mục cho app
mkdir -p ~/apps
cd ~/apps

# Clone repository (hoặc upload code)
git clone https://github.com/your-repo/license-server.git
# Hoặc scp từ máy local:
# scp -r /path/to/license-server licenseapp@your-vps-ip:~/apps/

cd license-server
```

### 4.2. Cài Đặt Dependencies

```bash
npm install --production
```

### 4.3. Generate RSA Keys

```bash
# Tạo thư mục keys
mkdir -p keys

# Generate private key
openssl genrsa -out keys/private.pem 2048

# Extract public key
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# Set permissions
chmod 600 keys/private.pem
chmod 644 keys/public.pem
```

**⚠️ QUAN TRỌNG:**
- `private.pem` chỉ giữ trên server, KHÔNG BAO GIỜ share
- `public.pem` sẽ được nhúng vào client app

### 4.4. Cấu Hình Environment Variables

```bash
# Copy file .env.example
cp .env.example .env

# Chỉnh sửa .env
nano .env
```

**Nội dung file `.env`:**

```env
# Server Config
PORT=3000
NODE_ENV=production

# Database
DB_HOST=localhost
DB_USER=license_user
DB_PASSWORD=YOUR_DATABASE_PASSWORD_HERE
DB_NAME=license_db

# JWT Secret (generate random string)
JWT_SECRET=your_jwt_secret_here_change_this_to_random_string_min_32_chars

# Device Salt (generate random string)
DEVICE_SALT=your_device_salt_here_change_this_to_random_string

# RSA Keys
PRIVATE_KEY_PATH=./keys/private.pem
PUBLIC_KEY_PATH=./keys/public.pem

# CORS
CORS_ORIGINS=https://license.dangthanhson.com,https://api.dangthanhson.com

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Generate random strings:**

```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate DEVICE_SALT
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4.5. Khởi Tạo Database

```bash
# Chạy script init database
npm run init-db

# Tạo admin user
npm run create-admin
# Nhập thông tin admin (email, password, full name)
```

### 4.6. Test Server

```bash
# Chạy thử server
npm start

# Trong terminal khác, test API:
curl http://localhost:3000/health
# Kết quả: {"status":"ok","timestamp":"..."}

# Stop server (Ctrl+C)
```

### 4.7. Deploy với PM2

```bash
# Start server với PM2
pm2 start src/index.js --name license-server

# Kiểm tra status
pm2 status

# Xem logs
pm2 logs license-server

# Save PM2 process list
pm2 save
```

**PM2 Commands:**

```bash
pm2 list              # List all processes
pm2 logs              # View logs
pm2 restart all       # Restart all
pm2 stop all          # Stop all
pm2 delete all        # Delete all
pm2 monit             # Monitor resources
```

---

## 5. Cấu Hình Nginx & SSL

### 5.1. Cấu Hình Nginx Reverse Proxy

```bash
# Tạo file config cho domain
sudo nano /etc/nginx/sites-available/api.dangthanhson.com
```

**Nội dung file:**

```nginx
server {
    listen 80;
    server_name api.dangthanhson.com;

    # Redirect to HTTPS (sẽ cấu hình sau khi có SSL)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://localhost:3000;
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

**Enable site:**

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/api.dangthanhson.com /etc/nginx/sites-enabled/

# Test Nginx config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 5.2. Cài Đặt SSL Certificate (Let's Encrypt)

```bash
# Cài Certbot
sudo apt install -y certbot python3-certbot-nginx

# Tạo SSL certificate
sudo certbot --nginx -d api.dangthanhson.com

# Làm theo hướng dẫn:
# - Nhập email
# - Agree to terms: Yes
# - Redirect HTTP to HTTPS: Yes (option 2)

# Certbot sẽ tự động cấu hình Nginx với SSL
```

**Test SSL:**

```bash
# Test trong browser
https://api.dangthanhson.com/health

# Hoặc dùng curl
curl https://api.dangthanhson.com/health
```

### 5.3. Auto-Renewal SSL

```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot đã tự động setup cronjob để renew
# Kiểm tra:
sudo systemctl status certbot.timer
```

---

## 6. Bảo Mật

### 6.1. Firewall (UFW)

```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow OpenSSH

# Allow HTTP & HTTPS
sudo ufw allow 'Nginx Full'

# Kiểm tra status
sudo ufw status
```

### 6.2. Fail2Ban (Chống brute-force)

```bash
# Cài Fail2Ban
sudo apt install -y fail2ban

# Copy config
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Chỉnh sửa config
sudo nano /etc/fail2ban/jail.local

# Tìm [sshd] section và đảm bảo:
# enabled = true
# maxretry = 3
# bantime = 3600

# Restart Fail2Ban
sudo systemctl restart fail2ban

# Kiểm tra status
sudo fail2ban-client status
```

### 6.3. Bảo Vệ File Nhạy Cảm

```bash
cd ~/apps/license-server

# Set ownership
sudo chown -R licenseapp:licenseapp .

# Bảo vệ .env và keys
chmod 600 .env
chmod 600 keys/private.pem
chmod 644 keys/public.pem
```

### 6.4. Giới Hạn Truy Cập MySQL

```bash
# Kiểm tra MySQL chỉ listen localhost
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf

# Tìm dòng:
bind-address = 127.0.0.1

# Restart MySQL
sudo systemctl restart mysql
```

---

## 7. Quản Lý & Monitoring

### 7.1. Logs

```bash
# PM2 logs
pm2 logs license-server

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log

# MySQL logs
sudo tail -f /var/log/mysql/error.log
```

### 7.2. Database Backup

**Tạo script backup:**

```bash
nano ~/backup-db.sh
```

**Nội dung:**

```bash
#!/bin/bash

BACKUP_DIR="/home/licenseapp/backups"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="license_db_$DATE.sql.gz"

mkdir -p $BACKUP_DIR

mysqldump -u license_user -p'YOUR_DB_PASSWORD' license_db | gzip > "$BACKUP_DIR/$FILENAME"

# Xóa backup cũ hơn 7 ngày
find $BACKUP_DIR -type f -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: $FILENAME"
```

**Set permissions và cronjob:**

```bash
chmod +x ~/backup-db.sh

# Thêm vào crontab
crontab -e

# Thêm dòng (backup hàng ngày lúc 2AM):
0 2 * * * /home/licenseapp/backup-db.sh >> /home/licenseapp/backup.log 2>&1
```

### 7.3. Monitoring với PM2 Plus (Optional)

```bash
# Đăng ký tài khoản tại: https://app.pm2.io/
# Link server với PM2 Plus
pm2 link YOUR_SECRET_KEY YOUR_PUBLIC_KEY
```

### 7.4. Update Code

```bash
cd ~/apps/license-server

# Pull code mới
git pull origin main

# Install dependencies nếu có thay đổi
npm install --production

# Restart PM2
pm2 restart license-server

# Kiểm tra logs
pm2 logs license-server
```

---

## 8. Troubleshooting

### 8.1. Server không start

```bash
# Kiểm tra logs
pm2 logs license-server --lines 50

# Kiểm tra .env file
cat .env

# Test database connection
mysql -u license_user -p license_db
```

### 8.2. Nginx 502 Bad Gateway

```bash
# Kiểm tra PM2 process đang chạy
pm2 status

# Kiểm tra port 3000
netstat -tulpn | grep 3000

# Kiểm tra Nginx error log
sudo tail -f /var/log/nginx/error.log
```

### 8.3. SSL Certificate Issues

```bash
# Renew certificate manually
sudo certbot renew

# Check certificate expiry
sudo certbot certificates
```

---

## 9. Testing API

### 9.1. Health Check

```bash
curl https://api.dangthanhson.com/health
```

### 9.2. Test Register

```bash
curl -X POST https://api.dangthanhson.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "fullName": "Test User"
  }'
```

### 9.3. Test Login

```bash
curl -X POST https://api.dangthanhson.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 9.4. Test Activation

```bash
curl -X POST https://api.dangthanhson.com/activate \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "XXXX-XXXX-XXXX-XXXX",
    "appCode": "PROMPTFLOW_DESKTOP",
    "deviceId": "test-device-123",
    "appVersion": "1.0.0"
  }'
```

---

## 10. Checklist Triển Khai

- [ ] VPS đã cài Ubuntu 20.04/22.04
- [ ] Tạo user deploy (licenseapp)
- [ ] Cấu hình SSH key authentication
- [ ] Tắt password authentication
- [ ] Cài Node.js 18 LTS
- [ ] Cài MySQL và tạo database
- [ ] Cài PM2 và Nginx
- [ ] Clone code và install dependencies
- [ ] Generate RSA keys
- [ ] Cấu hình .env file
- [ ] Khởi tạo database schema
- [ ] Tạo admin user
- [ ] Start server với PM2
- [ ] Cấu hình Nginx reverse proxy
- [ ] Cài SSL certificate
- [ ] Enable UFW firewall
- [ ] Cài Fail2Ban
- [ ] Setup database backup cronjob
- [ ] Test tất cả API endpoints
- [ ] Kiểm tra logs và monitoring

---

## Liên Hệ & Hỗ Trợ

Nếu gặp vấn đề trong quá trình triển khai, vui lòng kiểm tra:

1. Logs của PM2: `pm2 logs license-server`
2. Logs của Nginx: `sudo tail -f /var/log/nginx/error.log`
3. Database connection
4. Firewall settings

Good luck! 🚀
