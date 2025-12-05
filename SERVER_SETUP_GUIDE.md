# Server Setup Guide - RSA Keys cho License System

Hướng dẫn setup RSA keys cho license server api.dangthanhson.com

## 📋 Vấn Đề Hiện Tại

Server của bạn đang dùng `process.env.PRIVATE_KEY` trong code:

```javascript
const token = jwt.sign(payload, process.env.PRIVATE_KEY, { algorithm: 'RS256', expiresIn: '30d' })
```

Trong `.env.example`:
```
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...replace_with_your_RSA_private_key...\n-----END PRIVATE KEY-----
```

## 🔧 Giải Pháp

### Option 1: Format Private Key trong .env (RECOMMENDED)

Private key cần được format đúng cách khi lưu vào env variable.

#### Bước 1: Generate RSA Key Pair (nếu chưa có)

```bash
# SSH vào server
ssh user@api.dangthanhson.com

# Generate private key (2048 bits)
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem
```

#### Bước 2: Format Private Key cho .env

RSA private key có dạng:
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj
MzEfYyjiWA4R4/M2bS1+fWIcPm15j9w...
...nhiều dòng...
-----END PRIVATE KEY-----
```

**Cách format:** Thay tất cả newlines thành `\n` literal:

```bash
# Trên server, chạy script này để convert
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' private.pem
```

Output sẽ là một dòng duy nhất:
```
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\nMzEfYyjiWA4R4/M2bS1+fWIcPm15j9w...\n-----END PRIVATE KEY-----
```

Copy output này vào file `.env`:

```bash
# Mở .env
nano .env

# Paste vào:
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\nMzEfYyjiWA4R4/M2bS1+fWIcPm15j9w...\n-----END PRIVATE KEY-----
```

#### Bước 3: Update Server Code để Parse Newlines

Server code cần replace `\n` thành newlines thật:

```javascript
// Thêm vào đầu file activate.js hoặc trong config
const privateKey = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');

// Sau đó dùng privateKey thay vì process.env.PRIVATE_KEY
const token = jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '30d' })
```

---

### Option 2: Load Private Key từ File (CLEANER)

Thay vì lưu trong env, lưu trong file và load vào.

#### Bước 1: Generate Keys

```bash
# Trên server
mkdir -p ~/keys
cd ~/keys

# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem

# Set permissions
chmod 600 private.pem
chmod 644 public.pem
```

#### Bước 2: Update Server Code

Tạo file `server/config/keys.js`:

```javascript
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load private key từ file
const privateKeyPath = process.env.PRIVATE_KEY_PATH || path.join(__dirname, '../../keys/private.pem')
const publicKeyPath = process.env.PUBLIC_KEY_PATH || path.join(__dirname, '../../keys/public.pem')

export const privateKey = fs.readFileSync(privateKeyPath, 'utf8')
export const publicKey = fs.readFileSync(publicKeyPath, 'utf8')
```

Update `server/modules/activate.js`:

```javascript
import express from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { query } from '../db.js'
import { privateKey } from '../config/keys.js'  // ← Import private key

const router = express.Router()

// ... code khác ...

// Thay đổi dòng này:
const token = jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '30d' })
// Thay vì: process.env.PRIVATE_KEY
```

Update `.env`:

```bash
# Thay vì PRIVATE_KEY=..., dùng path:
PRIVATE_KEY_PATH=/home/user/keys/private.pem
PUBLIC_KEY_PATH=/home/user/keys/public.pem
```

---

## 📤 Export Public Key cho Client

Sau khi có private key, extract public key:

```bash
# Nếu dùng Option 1 (private key trong .env):
# Save private key từ .env ra file tạm (với newlines thật)
echo -e "$PRIVATE_KEY" > /tmp/private.pem
openssl rsa -in /tmp/private.pem -pubout -out public.pem
rm /tmp/private.pem

# Nếu dùng Option 2 (file):
openssl rsa -in ~/keys/private.pem -pubout -out ~/keys/public.pem
```

Download public key về máy local:

```bash
# Từ máy local
scp user@api.dangthanhson.com:~/keys/public.pem ./keys/public.pem
```

Paste nội dung vào `keys/public.pem` trong project Electron.

---

## ✅ Verify Setup

### Test 1: Verify Key Pair

```bash
# Trên server, test sign
echo "test data" > test.txt

# Sign bằng private key
openssl dgst -sha256 -sign private.pem -out signature.bin test.txt

# Verify bằng public key
openssl dgst -sha256 -verify public.pem -signature signature.bin test.txt
# Kết quả: Verified OK
```

### Test 2: Test JWT Sign & Verify

Tạo script test:

```javascript
// test-jwt.js
import jwt from 'jsonwebtoken'
import fs from 'fs'

const privateKey = fs.readFileSync('./keys/private.pem', 'utf8')
const publicKey = fs.readFileSync('./keys/public.pem', 'utf8')

// Sign
const payload = { test: 'data', userId: 123 }
const token = jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' })

console.log('Token:', token)

// Verify
try {
  const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] })
  console.log('Verified!', decoded)
} catch (err) {
  console.error('Verification failed:', err.message)
}
```

Chạy:
```bash
node test-jwt.js
```

Nếu thấy "Verified!" → Setup đúng!

---

## 🔒 Security Best Practices

1. **Private Key:**
   - ⚠️ KHÔNG BAO GIỜ commit vào git
   - ⚠️ KHÔNG share qua email/chat
   - ⚠️ Set permissions: `chmod 600 private.pem`
   - ✅ Chỉ giữ trên server
   - ✅ Backup an toàn (encrypted storage)

2. **Public Key:**
   - ✅ Có thể public
   - ✅ Distribute với client app
   - ✅ Có thể commit vào git (trong client app)

3. **.env File:**
   - ⚠️ Thêm vào `.gitignore`
   - ✅ Set permissions: `chmod 600 .env`
   - ✅ Backup an toàn

4. **Key Rotation:**
   - Nên rotate keys định kỳ (6 tháng - 1 năm)
   - Khi rotate:
     1. Generate key pair mới
     2. Update server
     3. Re-build client app với public key mới
     4. Deploy gradually

---

## 📝 Summary

### Recommendation: Dùng Option 2 (File-based)

**Pros:**
- ✅ Dễ quản lý
- ✅ Không lo escape newlines
- ✅ Dễ backup
- ✅ Dễ rotate keys

**Steps:**
1. Generate keys: `openssl genrsa -out private.pem 2048`
2. Extract public: `openssl rsa -in private.pem -pubout -out public.pem`
3. Update server code để load từ file
4. Download public.pem về client
5. Restart server
6. Test activation

---

## 🐛 Troubleshooting

### Error: "invalid key format"

**Nguyên nhân:** Private key format sai

**Giải pháp:**
```bash
# Check format
cat private.pem | head -1
# Phải là: -----BEGIN PRIVATE KEY-----

# Nếu là RSA PRIVATE KEY, convert:
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in private.pem -out private_pkcs8.pem
```

### Error: "error:0909006C:PEM routines"

**Nguyên nhân:** Newlines không đúng trong env variable

**Giải pháp:** Dùng Option 2 (file-based) thay vì env.

### Error: "jwt malformed"

**Nguyên nhân:** Token format sai

**Giải pháp:** Check private key có đúng format PEM không.

---

## 📞 Next Steps

1. **Trên Server:**
   - [ ] Generate RSA key pair
   - [ ] Update code để load keys đúng
   - [ ] Restart server
   - [ ] Test `/activate` endpoint

2. **Trên Client:**
   - [ ] Download public.pem
   - [ ] Copy vào `keys/public.pem`
   - [ ] Build app
   - [ ] Test activation

3. **Verify End-to-End:**
   - [ ] Client gửi activation request
   - [ ] Server trả token
   - [ ] Client verify token thành công

---

Nếu cần hỗ trợ thêm, ping tôi! 🚀
