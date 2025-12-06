# Debug Scripts

Các script giúp kiểm tra và debug hệ thống license.

## Kiểm tra Database

Chạy script này để kiểm tra xem database có đủ dữ liệu không:

```bash
node scripts/check-db.js
```

Script này sẽ kiểm tra:
- Số lượng users trong database
- Số lượng apps trong database
- Số lượng licenses hiện có

## Tạo dữ liệu mẫu

Nếu database chưa có apps hoặc users, chạy script này để tạo dữ liệu mẫu:

```bash
node scripts/seed-sample-data.js
```

Script này sẽ tạo:
- 2 apps mẫu: `my-app`, `test-app`
- 2 users mẫu:
  - `admin@example.com / password123` (admin role)
  - `user@example.com / password123` (user role)

## Xem server logs

Khi tạo license key, server sẽ in ra logs chi tiết. Hãy mở terminal chạy server và xem output để biết lỗi cụ thể.

Ví dụ logs khi tạo license thành công:
```
Create license request: { user_id: 1, app_id: 1, max_devices: 1, expires_at: '2025-01-05T...', status: 'active' }
Generated license key: a1b2c3d4-e5f6-4g7h-8i9j-k0l1m2n3o4p5
Inserting license with expires_at: 2025-01-05 10:30:00
License created successfully: 123
```

## Các lỗi thường gặp

### 1. Foreign key constraint error
```
Error: Cannot add or update a child row: a foreign key constraint fails
```
**Nguyên nhân:** user_id hoặc app_id không tồn tại trong database.
**Giải pháp:** Chạy `node scripts/check-db.js` để kiểm tra.

### 2. Invalid input error
```
Error: invalid_input
```
**Nguyên nhân:** Thiếu các field bắt buộc (user_id, app_id, max_devices).
**Giải pháp:** Kiểm tra console log trên frontend để xem data gửi đi.

### 3. Database connection error
```
Error: connect ECONNREFUSED
```
**Nguyên nhân:** Database server chưa chạy.
**Giải pháp:** Kiểm tra MySQL/MariaDB service đang chạy.
