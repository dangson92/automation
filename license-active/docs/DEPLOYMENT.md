# Hướng Dẫn Triển Khai VPS Ubuntu

Tài liệu này hướng dẫn chi tiết cách triển khai License Key Server lên VPS Ubuntu từ A-Z.

## Mục Lục

1. [Yêu Cầu Hệ Thống](#yêu-cầu-hệ-thống)
2. [Chuẩn Bị VPS](#chuẩn-bị-vps)
3. [Cấu Hình User & SSH](#cấu-hình-user--ssh)
4. [Cài Đặt MySQL](#cài-đặt-mysql)
5. [Cài Đặt Node.js & PM2](#cài-đặt-nodejs--pm2)
6. [Deploy Ứng Dụng](#deploy-ứng-dụng)
7. [Cấu Hình Nginx](#cấu-hình-nginx)
8. [Cài Đặt SSL (Let's Encrypt)](#cài-đặt-ssl-lets-encrypt)
9. [Cấu Hình Firewall](#cấu-hình-firewall)
10. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Yêu Cầu Hệ Thống

### VPS Minimum

- **OS:** Ubuntu 22.04 LTS hoặc 20.04 LTS
- **RAM:** 1GB (khuyến nghị 2GB+)
- **CPU:** 1 vCore (khuyến nghị 2+ vCores)
- **Storage:** 20GB SSD
- **Network:** 1Gbps

### VPS Recommended (cho production)

- **RAM:** 4GB
- **CPU:** 2 vCores
- **Storage:** 50GB SSD
- **Bandwidth:** Unlimited hoặc 2TB+

### Domain Name

- Đã có domain hoặc subdomain (ví dụ: `license.dangthanhson.com`)
- DNS A record đã trỏ về IP của VPS

---

## Chuẩn Bị VPS

### 1. Đăng nhập VPS lần đầu

```bash
# Đăng nhập bằng root (hoặc user mặc định từ provider)
ssh root@your-vps-ip
```

### 2. Cập nhật hệ thống

```bash
# Update package list
apt update

# Upgrade packages
apt upgrade -y

# Install essential tools
apt install -y curl wget git vim ufw
```

### 3. Cấu hình timezone (tùy chọn)

```bash
# Kiểm tra timezone hiện tại
timedatectl

# Đặt timezone (ví dụ: Asia/Ho_Chi_Minh)
timedatectl set-timezone Asia/Ho_Chi_Minh
```

---

## Cấu Hình User & SSH

### 1. Tạo user mới (không dùng root)

```bash
# Tạo user cho app
adduser licenseapp

# Set password
# (Nhập password khi được hỏi)

# Thêm user vào group sudo (nếu cần quyền sudo)
# Lưu ý: Không khuyến khích cho user app có sudo
# Chỉ tạo thêm 1 user admin riêng có sudo
adduser admin
usermod -aG sudo admin
```

### 2. Tạo SSH key trên máy local

```bash
# Trên máy local (Windows/Mac/Linux)
ssh-keygen -t rsa -b 4096 -C "license-server"

# Lưu vào: ~/.ssh/license_server_rsa
# Nhập passphrase (hoặc để trống)
```

### 3. Copy public key lên VPS

**Cách 1: Dùng ssh-copy-id (Linux/Mac)**

```bash
ssh-copy-id -i ~/.ssh/license_server_rsa.pub licenseapp@your-vps-ip
ssh-copy-id -i ~/.ssh/license_server_rsa.pub admin@your-vps-ip
```

**Cách 2: Manual (Windows hoặc không có ssh-copy-id)**

```bash
# Trên máy local: copy nội dung public key
cat ~/.ssh/license_server_rsa.pub
# (Copy output)

# Trên VPS: đăng nhập bằng user licenseapp
su - licenseapp

# Tạo thư mục .ssh
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Paste public key vào authorized_keys
nano ~/.ssh/authorized_keys
# (Paste nội dung public key, save và exit)

chmod 600 ~/.ssh/authorized_keys
```

### 4. Test SSH key login

```bash
# Trên máy local
ssh -i ~/.ssh/license_server_rsa licenseapp@your-vps-ip

# Nếu thành công → có thể login không cần password
```

### 5. Tắt password authentication (bảo mật)

```bash
# Đăng nhập bằng root hoặc user có sudo
sudo nano /etc/ssh/sshd_config

# Tìm và sửa các dòng sau:
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes

# Save và exit (Ctrl+X, Y, Enter)

# Restart SSH service
sudo systemctl restart ssh
```

**⚠️ CẢNH BÁO:**
- Đảm bảo bạn đã test SSH key login thành công trước khi tắt password authentication
- Nếu bị khóa không vào được → phải dùng VPS console từ provider

### 6. Cấu hình SSH client (tùy chọn)

Trên máy local, tạo file `~/.ssh/config`:

```
Host license-server
    HostName your-vps-ip
    User licenseapp
    IdentityFile ~/.ssh/license_server_rsa
    Port 22
```

Giờ có thể login bằng:
```bash
ssh license-server
```

---

## Cài Đặt MySQL

### 1. Cài đặt MySQL Server

```bash
sudo apt update
sudo apt install -y mysql-server
```

### 2. Chạy MySQL Secure Installation

```bash
sudo mysql_secure_installation
```

Trả lời các câu hỏi:
- **Set root password?** Yes → Nhập password mạnh
- **Remove anonymous users?** Yes
- **Disallow root login remotely?** Yes
- **Remove test database?** Yes
- **Reload privilege tables?** Yes

### 3. Tạo database và user

```bash
# Đăng nhập MySQL với root
sudo mysql -u root -p

# Hoặc nếu chưa set password cho root:
sudo mysql
```

Trong MySQL shell:

```sql
-- Tạo database
CREATE DATABASE license_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Tạo user và cấp quyền
CREATE USER 'license_user'@'localhost' IDENTIFIED BY 'your_strong_password_here';
GRANT ALL PRIVILEGES ON license_db.* TO 'license_user'@'localhost';
FLUSH PRIVILEGES;

-- Kiểm tra
SHOW DATABASES;
SELECT User, Host FROM mysql.user;

-- Thoát
EXIT;
```

### 4. Test kết nối

```bash
mysql -u license_user -p license_db
# Nhập password → nếu vào được là OK
```

### 5. Import database schema

```bash
# Sau khi clone code (bước sau), chạy:
mysql -u license_user -p license_db < ~/apps/license-active/server/sql/schema.sql
```

### 6. Cấu hình MySQL (tùy chọn, cho performance)

```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

Thêm/sửa:
```ini
[mysqld]
max_connections = 150
innodb_buffer_pool_size = 256M  # 70% RAM nếu chỉ chạy MySQL
```

Restart MySQL:
```bash
sudo systemctl restart mysql
```

---

## Cài Đặt Node.js & PM2

### 1. Cài đặt Node.js LTS

```bash
# Thêm NodeSource repository (Node.js 20.x LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Cài đặt Node.js
sudo apt install -y nodejs

# Kiểm tra version
node -v   # v20.x.x
npm -v    # 10.x.x
```

### 2. Cài đặt PM2 (Process Manager)

```bash
# Cài đặt PM2 global
sudo npm install -g pm2

# Kiểm tra
pm2 -v
```

### 3. Cấu hình PM2 startup

```bash
# Generate startup script
pm2 startup systemd

# Copy và chạy lệnh được in ra (ví dụ):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u licenseapp --hp /home/licenseapp
```

---

## Deploy Ứng Dụng

### 1. Tạo thư mục project

```bash
# Đăng nhập với user licenseapp
su - licenseapp

# Tạo thư mục apps
mkdir -p ~/apps
cd ~/apps
```

### 2. Clone code từ Git

**Cách 1: Clone từ GitHub/GitLab**

```bash
git clone https://github.com/your-username/license-active.git
cd license-active
```

**Cách 2: Upload từ máy local bằng rsync**

```bash
# Trên máy local
rsync -avz -e "ssh -i ~/.ssh/license_server_rsa" \
  /path/to/local/license-active/ \
  licenseapp@your-vps-ip:~/apps/license-active/
```

**Cách 3: Upload bằng SCP**

```bash
# Trên máy local
scp -i ~/.ssh/license_server_rsa -r /path/to/local/license-active \
  licenseapp@your-vps-ip:~/apps/
```

### 3. Cài đặt dependencies

```bash
cd ~/apps/license-active
npm install --production
```

### 4. Tạo RSA key pair

```bash
cd ~/apps/license-active

# Tạo private key
openssl genrsa -out private.pem 2048

# Tạo public key từ private key
openssl rsa -in private.pem -pubout -out public.pem

# Bảo mật private key
chmod 600 private.pem

# Xem private key (để copy vào .env)
cat private.pem
```

**Lưu ý:**
- `private.pem`: Giữ trên server, dùng để ký JWT
- `public.pem`: Copy xuống client, dùng để verify JWT

### 5. Tạo file .env

```bash
cd ~/apps/license-active
nano .env
```

Nội dung:

```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=license_user
DB_PASS=your_strong_password_here
DB_NAME=license_db
JWT_SECRET=your_jwt_secret_at_least_32_chars_random_string
DEVICE_SALT=your_device_salt_random_string
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w...(paste từ private.pem, thay newline bằng \\n)...\n-----END PRIVATE KEY-----
```

**Lưu ý:**
- `PRIVATE_KEY`: Copy toàn bộ nội dung từ `private.pem`, thay các dòng mới bằng `\n`
- Hoặc để path: `PRIVATE_KEY_PATH=/home/licenseapp/apps/license-active/private.pem`

**Generate random secrets:**

```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate DEVICE_SALT
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Bảo mật file .env:**

```bash
chmod 600 .env
```

### 6. Import database schema

```bash
mysql -u license_user -p license_db < ~/apps/license-active/server/sql/schema.sql
```

### 7. Test chạy app

```bash
cd ~/apps/license-active
npm run server
```

Kiểm tra log:
- Không có lỗi kết nối DB
- Server listen trên port 3000

Test health check:
```bash
# Mở terminal khác
curl http://localhost:3000/health
# → {"ok":true}
```

Stop server: `Ctrl+C`

### 8. Chạy với PM2

```bash
cd ~/apps/license-active

# Start server
pm2 start npm --name license-server -- run server

# Lưu cấu hình
pm2 save

# Kiểm tra status
pm2 status
pm2 logs license-server
```

### 9. Test lại

```bash
curl http://localhost:3000/health
# → {"ok":true}
```

---

## Cấu Hình Nginx

### 1. Cài đặt Nginx

```bash
sudo apt update
sudo apt install -y nginx
```

### 2. Tạo server block

```bash
sudo nano /etc/nginx/sites-available/license-server
```

Nội dung:

```nginx
server {
    listen 80;
    server_name license.dangthanhson.com;

    # Logs
    access_log /var/log/nginx/license-server-access.log;
    error_log /var/log/nginx/license-server-error.log;

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

    # Health check endpoint (optional)
    location /health {
        proxy_pass http://127.0.0.1:3000/health;
        access_log off;
    }
}
```

**Lưu ý:** Thay `license.dangthanhson.com` bằng domain của bạn.

### 3. Enable site

```bash
# Tạo symlink
sudo ln -s /etc/nginx/sites-available/license-server /etc/nginx/sites-enabled/

# Xóa default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test cấu hình
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 4. Test

```bash
# Test từ VPS
curl http://localhost/health

# Test từ bên ngoài (máy local)
curl http://license.dangthanhson.com/health
```

---

## Cài Đặt SSL (Let's Encrypt)

### 1. Cài đặt Certbot

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

### 2. Lấy SSL certificate

```bash
sudo certbot --nginx -d license.dangthanhson.com
```

Trả lời các câu hỏi:
- **Email:** your-email@example.com
- **Terms of Service:** Agree (A)
- **Share email:** No (N)
- **Redirect HTTP to HTTPS:** Yes (2)

### 3. Kiểm tra auto-renewal

```bash
# Test renewal (dry-run)
sudo certbot renew --dry-run

# Kiểm tra timer
sudo systemctl status certbot.timer
```

### 4. Test HTTPS

```bash
# Từ máy local
curl https://license.dangthanhson.com/health
```

### 5. Cấu hình Nginx sau khi có SSL

Certbot đã tự động sửa file `/etc/nginx/sites-available/license-server`. Kiểm tra:

```bash
sudo nano /etc/nginx/sites-available/license-server
```

Nên có thêm:

```nginx
server {
    listen 443 ssl http2;
    server_name license.dangthanhson.com;

    ssl_certificate /etc/letsencrypt/live/license.dangthanhson.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/license.dangthanhson.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # ... rest of config
}

server {
    listen 80;
    server_name license.dangthanhson.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Cấu Hình Firewall

### 1. Enable UFW

```bash
# Cho phép SSH (QUAN TRỌNG: làm trước khi enable UFW)
sudo ufw allow OpenSSH

# Cho phép HTTP/HTTPS
sudo ufw allow 'Nginx Full'

# Enable firewall
sudo ufw enable

# Kiểm tra status
sudo ufw status
```

Output:

```
Status: active

To                         Action      From
--                         ------      ----
OpenSSH                    ALLOW       Anywhere
Nginx Full                 ALLOW       Anywhere
```

### 2. Quy tắc bảo mật

```bash
# Chặn ping (optional)
sudo ufw deny proto icmp

# Giới hạn SSH login attempts (brute-force protection)
sudo ufw limit OpenSSH

# Cho phép MySQL từ localhost only (mặc định)
# MySQL bind-address = 127.0.0.1 trong /etc/mysql/mysql.conf.d/mysqld.cnf
```

---

## Monitoring & Maintenance

### 1. PM2 Monitoring

```bash
# Xem logs real-time
pm2 logs license-server

# Xem logs 100 dòng gần nhất
pm2 logs license-server --lines 100

# Chỉ xem error logs
pm2 logs license-server --err

# Monitor resources
pm2 monit

# Xem status
pm2 status

# Restart app
pm2 restart license-server

# Stop app
pm2 stop license-server
```

### 2. Nginx Logs

```bash
# Access logs
sudo tail -f /var/log/nginx/license-server-access.log

# Error logs
sudo tail -f /var/log/nginx/license-server-error.log
```

### 3. MySQL Logs

```bash
# Error log
sudo tail -f /var/log/mysql/error.log

# Slow query log (nếu enable)
sudo tail -f /var/log/mysql/mysql-slow.log
```

### 4. Disk Usage

```bash
# Kiểm tra disk usage
df -h

# Xem thư mục lớn nhất
du -h --max-depth=1 /home/licenseapp | sort -h
```

### 5. Memory & CPU

```bash
# Memory
free -h

# CPU
top
# hoặc
htop

# Processes
ps aux | grep node
```

### 6. Database Backup

**Manual backup:**

```bash
# Backup
mysqldump -u license_user -p license_db > ~/backups/license_db_$(date +%F).sql

# Restore
mysql -u license_user -p license_db < ~/backups/license_db_2024-12-05.sql
```

**Auto backup (cron):**

```bash
# Tạo thư mục backup
mkdir -p ~/backups

# Edit crontab
crontab -e

# Thêm dòng (backup hàng ngày lúc 2h sáng):
0 2 * * * mysqldump -u license_user -p'your_password' license_db > ~/backups/license_db_$(date +\%F).sql

# Xóa backup cũ hơn 30 ngày (chạy hàng ngày lúc 3h sáng):
0 3 * * * find ~/backups -name "license_db_*.sql" -mtime +30 -delete
```

### 7. Update Application

```bash
# Đăng nhập VPS
ssh license-server

# Vào thư mục app
cd ~/apps/license-active

# Pull code mới (nếu dùng Git)
git pull

# Hoặc rsync từ máy local
# (chạy trên máy local)
rsync -avz -e "ssh -i ~/.ssh/license_server_rsa" \
  /path/to/local/license-active/ \
  licenseapp@your-vps-ip:~/apps/license-active/

# Install dependencies mới (nếu có)
npm install --production

# Restart app
pm2 restart license-server

# Kiểm tra logs
pm2 logs license-server --lines 50
```

### 8. Health Check Script

Tạo script tự động check health:

```bash
nano ~/health-check.sh
```

Nội dung:

```bash
#!/bin/bash

HEALTH_URL="http://localhost:3000/health"
EXPECTED='{"ok":true}'

RESPONSE=$(curl -s "$HEALTH_URL")

if [ "$RESPONSE" = "$EXPECTED" ]; then
    echo "$(date): OK"
else
    echo "$(date): FAIL - Response: $RESPONSE"
    # Restart app
    pm2 restart license-server
    echo "$(date): App restarted"
fi
```

Chmod:
```bash
chmod +x ~/health-check.sh
```

Thêm vào cron (chạy mỗi 5 phút):
```bash
crontab -e

# Thêm:
*/5 * * * * ~/health-check.sh >> ~/health-check.log 2>&1
```

---

## Troubleshooting

### 1. App không start được

**Check PM2 logs:**
```bash
pm2 logs license-server --err
```

**Common issues:**
- Database connection failed → check `.env` DB credentials
- Port 3000 already in use → `sudo lsof -i :3000`
- Missing dependencies → `npm install`

### 2. Nginx 502 Bad Gateway

**Nguyên nhân:**
- Node.js app không chạy
- Port không khớp (app chạy port 3001, nginx proxy to 3000)

**Fix:**
```bash
# Check app status
pm2 status

# Check app logs
pm2 logs license-server

# Restart app
pm2 restart license-server

# Restart Nginx
sudo systemctl restart nginx
```

### 3. SSL certificate not working

**Check certificate:**
```bash
sudo certbot certificates
```

**Renew manually:**
```bash
sudo certbot renew
sudo systemctl reload nginx
```

### 4. Database connection timeout

**Check MySQL running:**
```bash
sudo systemctl status mysql
```

**Check MySQL user:**
```bash
mysql -u license_user -p license_db
```

**Check bind-address:**
```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
# bind-address = 127.0.0.1
```

### 5. Out of memory

**Check memory:**
```bash
free -h
```

**Restart app:**
```bash
pm2 restart license-server
```

**Upgrade VPS RAM** nếu cần.

---

## Security Best Practices

### 1. SSH Hardening

- ✅ Disable password authentication
- ✅ Disable root login
- ✅ Use SSH keys only
- ⚠️ Change SSH port (optional): edit `/etc/ssh/sshd_config` → `Port 2222`
- ⚠️ Install fail2ban: `sudo apt install fail2ban`

### 2. Firewall

- ✅ Enable UFW
- ✅ Only open necessary ports (22, 80, 443)
- ✅ Limit SSH connections

### 3. Application

- ✅ Use HTTPS only
- ✅ Keep `.env` file secure (chmod 600)
- ✅ Use strong passwords for DB, JWT_SECRET
- ✅ Regular backups
- ✅ Update dependencies: `npm audit fix`

### 4. MySQL

- ✅ Strong root password
- ✅ Remove anonymous users
- ✅ Disable remote root login
- ✅ Bind to localhost only

### 5. Monitoring

- ✅ Setup health checks
- ✅ Monitor logs regularly
- ✅ Setup alerts (email/Slack) when app down

---

## Performance Optimization

### 1. PM2 Cluster Mode

Chạy nhiều instances để tận dụng multi-core:

```bash
pm2 delete license-server

pm2 start npm --name license-server -i max -- run server
# -i max: tự động tạo instances = số CPU cores

pm2 save
```

### 2. Nginx Caching

Thêm vào Nginx config:

```nginx
# Cache static files
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Cache API responses (optional, cẩn thận với dynamic data)
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m max_size=100m inactive=60m;

location /api/ {
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_use_stale error timeout updating;
    # ... other proxy settings
}
```

### 3. MySQL Optimization

```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

```ini
[mysqld]
# Connection pool
max_connections = 150

# InnoDB buffer pool (70% of RAM for MySQL-only server)
innodb_buffer_pool_size = 1G

# Query cache (nếu MySQL < 8.0)
query_cache_size = 32M
query_cache_type = 1
```

Restart MySQL:
```bash
sudo systemctl restart mysql
```

---

## Checklist Triển Khai

- [ ] Tạo VPS Ubuntu
- [ ] Cập nhật hệ thống
- [ ] Tạo user `licenseapp` và `admin`
- [ ] Cấu hình SSH key authentication
- [ ] Tắt password SSH login
- [ ] Cài đặt MySQL
- [ ] Tạo database và user
- [ ] Import schema
- [ ] Cài đặt Node.js LTS
- [ ] Cài đặt PM2
- [ ] Clone/upload code
- [ ] Tạo RSA key pair
- [ ] Tạo file `.env`
- [ ] Cài đặt dependencies
- [ ] Test chạy app
- [ ] Start app với PM2
- [ ] PM2 startup
- [ ] Cài đặt Nginx
- [ ] Cấu hình Nginx reverse proxy
- [ ] Test HTTP
- [ ] Cài đặt Certbot
- [ ] Lấy SSL certificate
- [ ] Test HTTPS
- [ ] Enable UFW firewall
- [ ] Cấu hình database backup (cron)
- [ ] Cấu hình health check script
- [ ] Test toàn bộ hệ thống
- [ ] Tạo admin account
- [ ] Tạo test app & license
- [ ] Test client activation

---

## Kết Luận

Sau khi hoàn thành các bước trên, bạn đã có một License Key Server hoàn chỉnh chạy trên VPS Ubuntu với:

- ✅ HTTPS (SSL/TLS)
- ✅ Nginx reverse proxy
- ✅ PM2 process manager
- ✅ MySQL database
- ✅ Firewall (UFW)
- ✅ Auto-restart khi reboot
- ✅ SSL auto-renewal
- ✅ Database backup tự động
- ✅ Health monitoring

Giờ bạn có thể:
1. Truy cập admin panel: `https://license.dangthanhson.com`
2. Tạo apps, licenses
3. Phát hành license keys cho khách hàng
4. Client apps kích hoạt license qua API

**Next steps:**
- Setup monitoring (Uptime Robot, Pingdom, ...)
- Setup email notifications
- Deploy frontend admin panel
- Tạo documentation cho end users
