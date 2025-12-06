# RSA Keys Directory

This directory contains RSA key pair for JWT token signing/verification.

## Setup

### 1. Generate RSA Key Pair

```bash
# Generate private key (2048 bits)
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem

# Set correct permissions
chmod 600 private.pem
chmod 644 public.pem
```

### 2. Verify Keys

```bash
# Test sign & verify
echo "test data" > test.txt
openssl dgst -sha256 -sign private.pem -out signature.bin test.txt
openssl dgst -sha256 -verify public.pem -signature signature.bin test.txt
# Should output: Verified OK
```

### 3. Update .env

```bash
# Copy .env.example to .env
cp ../.env.example ../.env

# Keys will be loaded from:
PRIVATE_KEY_PATH=./keys/private.pem
PUBLIC_KEY_PATH=./keys/public.pem
```

## Files

- `private.pem` - RSA private key (2048 bits) - **KEEP SECRET!**
- `public.pem` - RSA public key (for verification)
- `.gitkeep` - Keep this directory in git

## Security

⚠️ **IMPORTANT:**
- `private.pem` is added to `.gitignore` - NEVER commit it!
- Only `private.pem` should exist on the server
- `public.pem` should be distributed to clients for token verification
- Set permissions: `chmod 600 private.pem`

## Distribution

**For Client Apps:**
```bash
# Copy public key to client project
scp public.pem user@client-machine:/path/to/app/keys/public.pem
```

Client apps will use `public.pem` to verify JWT tokens signed by the server.
