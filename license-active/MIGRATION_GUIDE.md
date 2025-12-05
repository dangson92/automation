# Migration Guide: Option 1 (env) → Option 2 (file-based)

Hướng dẫn migrate từ private key trong `.env` sang load từ file.

## 🎯 Mục Đích

Chuyển từ:
```env
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...long string...\n-----END PRIVATE KEY-----
```

Sang:
```env
PRIVATE_KEY_PATH=./keys/private.pem
PUBLIC_KEY_PATH=./keys/public.pem
```

## 📋 Changes Made

### 1. New File: `server/config/keys.js`
Load RSA keys từ file thay vì từ env variable.

### 2. Updated: `server/modules/activate.js`
```javascript
// Before:
const token = jwt.sign(payload, process.env.PRIVATE_KEY, ...)

// After:
import { privateKey } from '../config/keys.js'
const token = jwt.sign(payload, privateKey, ...)
```

### 3. Updated: `.env.example`
Added `PRIVATE_KEY_PATH` and `PUBLIC_KEY_PATH` variables.

### 4. New Directory: `keys/`
Contains RSA key files and documentation.

## 🚀 Migration Steps

### Step 1: Generate RSA Keys (if not already have)

```bash
cd license-active/keys

# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem

# Set permissions
chmod 600 private.pem
chmod 644 public.pem
```

**OR** if you already have a private key in `.env`:

```bash
cd license-active/keys

# Extract private key from .env to file
# Copy the PRIVATE_KEY value from .env
# Replace \n with actual newlines
echo -e "YOUR_PRIVATE_KEY_WITH_\\n" > private.pem

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem

# Set permissions
chmod 600 private.pem
```

### Step 2: Update `.env` on Server

```bash
# Edit .env file
nano .env

# Remove or comment out old PRIVATE_KEY:
# PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...

# Add new paths:
PRIVATE_KEY_PATH=./keys/private.pem
PUBLIC_KEY_PATH=./keys/public.pem
```

Or use absolute paths:
```env
PRIVATE_KEY_PATH=/home/user/license-active/keys/private.pem
PUBLIC_KEY_PATH=/home/user/license-active/keys/public.pem
```

### Step 3: Verify Keys Work

```bash
# Test JWT signing/verification
cd license-active

# Create test script
cat > test-keys.js << 'EOF'
import jwt from 'jsonwebtoken'
import { privateKey, publicKey } from './server/config/keys.js'

const payload = { test: 'data', userId: 123 }
const token = jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' })

console.log('✓ Token signed:', token.substring(0, 50) + '...')

try {
  const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] })
  console.log('✓ Token verified!', decoded)
} catch (err) {
  console.error('✗ Verification failed:', err.message)
}
EOF

# Run test
node test-keys.js

# Clean up
rm test-keys.js
```

Expected output:
```
✓ Private key loaded from: ./keys/private.pem
✓ Public key loaded from: ./keys/public.pem
✓ Token signed: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0Z...
✓ Token verified! { test: 'data', userId: 123, iat: ..., exp: ... }
```

### Step 4: Restart Server

```bash
# If using pm2
pm2 restart license-server

# Or if running directly
npm start
```

Check logs for:
```
✓ Private key loaded from: ./keys/private.pem
✓ Public key loaded from: ./keys/public.pem
```

### Step 5: Test Activation Endpoint

```bash
# Test /activate endpoint
curl -X POST http://localhost:3000/activate \
  -H "Content-Type: application/json" \
  -d '{
    "licenseKey": "YOUR-LICENSE-KEY",
    "appCode": "PROMPTFLOW_DESKTOP",
    "deviceId": "test-device-123",
    "appVersion": "1.0.0"
  }'
```

Should return JWT token if license is valid.

### Step 6: Distribute Public Key to Clients

```bash
# Copy public key to client project
scp license-active/keys/public.pem user@client:/path/to/electron-app/keys/public.pem
```

## 🔄 Rollback (if needed)

If something goes wrong, you can rollback:

### Option A: Keep both methods

Server code now supports both file-based and env-based.

If keys fail to load from file, you can still use env:
```env
# Fallback to env method
PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...full key...\n-----END PRIVATE KEY-----
```

Then update `server/config/keys.js` to check env as fallback.

### Option B: Revert code changes

```bash
git revert <commit-hash>
```

## ✅ Verification Checklist

- [ ] Keys generated and placed in `license-active/keys/`
- [ ] `private.pem` has permissions 600
- [ ] `.env` updated with `PRIVATE_KEY_PATH` and `PUBLIC_KEY_PATH`
- [ ] Server starts without errors
- [ ] Logs show "Private key loaded" message
- [ ] `/activate` endpoint works
- [ ] JWT tokens can be verified
- [ ] Public key distributed to clients
- [ ] Client apps can verify tokens

## 🐛 Troubleshooting

### Error: "Failed to load private key"

**Cause:** File not found or wrong path

**Solution:**
```bash
# Check file exists
ls -la license-active/keys/private.pem

# Check path in .env
cat .env | grep PRIVATE_KEY_PATH

# Use absolute path if relative doesn't work
PRIVATE_KEY_PATH=/full/path/to/license-active/keys/private.pem
```

### Error: "Permission denied"

**Cause:** Wrong file permissions

**Solution:**
```bash
chmod 600 license-active/keys/private.pem
```

### Error: "invalid key format"

**Cause:** Private key format is wrong

**Solution:**
```bash
# Check key format
head -1 license-active/keys/private.pem
# Should be: -----BEGIN PRIVATE KEY-----

# If it's RSA PRIVATE KEY, convert to PKCS8:
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in private.pem -out private_pkcs8.pem
mv private_pkcs8.pem private.pem
```

## 📞 Support

Nếu gặp vấn đề:
1. Check server logs: `pm2 logs license-server`
2. Verify key files exist and have correct permissions
3. Test keys manually với openssl commands
4. Check `.env` configuration

---

**Status:** ✅ Migration Complete
**Date:** 2024-12-05
