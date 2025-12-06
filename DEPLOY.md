# Hướng dẫn Deploy License Server lên VPS

## Vấn đề hiện tại
Server VPS đang trả về 404 khi gọi `/check-in` - nghĩa là code chưa được deploy hoặc server chưa restart.

## Bước 1: Đẩy code lên repository

Code đã được commit và push lên branch:
```bash
git checkout claude/fix-license-persistence-01RoFxeSNFi1s7s1zqCXNiEN
git log --oneline -5
```

Merge vào main branch (nếu cần):
```bash
git checkout main
git merge claude/fix-license-persistence-01RoFxeSNFi1s7s1zqCXNiEN
git push origin main
```

## Bước 2: Deploy lên VPS

### Option 1: SSH vào VPS và pull code

```bash
# SSH vào VPS
ssh user@api.dangthanhson.com

# Vào thư mục project
cd /path/to/automation/license-active/server

# Pull code mới
git pull origin main

# Install dependencies (nếu có thay đổi package.json)
npm install

# Restart server
pm2 restart license-server
# hoặc
systemctl restart license-server
# hoặc
npm run restart
```

### Option 2: Deploy bằng script tự động (nếu có)

```bash
# Từ máy local
npm run deploy
# hoặc
./deploy.sh
```

## Bước 3: Kiểm tra server đã chạy đúng

```bash
# Kiểm tra health endpoint
curl https://api.dangthanhson.com/health

# Kiểm tra check-in endpoint tồn tại
curl -X POST https://api.dangthanhson.com/check-in \
  -H "Content-Type: application/json" \
  -d '{"token":"invalid","appCode":"test","deviceId":"test","appVersion":"1.0.0"}'

# Kết quả mong đợi: JSON response (không phải HTML 404)
# Ví dụ: {"active":false,"status":"invalid_token"}
```

## Bước 4: Kiểm tra logs (nếu có lỗi)

```bash
# Xem logs
pm2 logs license-server
# hoặc
journalctl -u license-server -f
# hoặc
tail -f /var/log/license-server.log
```

## Files đã thay đổi cần deploy

1. `license-active/server/modules/check-in.js` - Sửa lỗi require() → getPrivateKey()
2. `license-active/server/index.js` - Cập nhật CORS cho Electron apps
3. `license-manager.js` - Thêm logging (client-side, không cần deploy)
4. `electron-main.js` - UI và logic (client-side, không cần deploy)

## Kiểm tra sau khi deploy

1. Test activate license từ app
2. App sẽ check-in với server
3. Không còn lỗi "Cannot POST /check-in"
4. License được lưu lại sau khi restart app

## Troubleshooting

### Nếu vẫn lỗi 404:
- Kiểm tra server có import checkInRouter không: `import checkInRouter from './modules/check-in.js'`
- Kiểm tra server có use router: `app.use('/check-in', checkInRouter)`
- Restart lại server: `pm2 restart license-server`

### Nếu lỗi 500:
- Kiểm tra logs: `pm2 logs license-server`
- Kiểm tra database connection
- Kiểm tra .env file có đầy đủ không

### Nếu lỗi CORS:
- Kiểm tra code CORS đã update chưa (index.js line 17-39)
- Electron apps không gửi Origin header nên phải allow undefined origin
