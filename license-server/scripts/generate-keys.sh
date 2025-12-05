#!/bin/bash

# Generate RSA key pair for license activation tokens

echo "Generating RSA key pair..."

# Create keys directory if it doesn't exist
mkdir -p keys

# Generate private key (2048 bits)
openssl genrsa -out keys/private.pem 2048

# Extract public key
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

echo "✓ Keys generated successfully!"
echo ""
echo "Private key: keys/private.pem"
echo "Public key: keys/public.pem"
echo ""
echo "IMPORTANT: Keep private.pem secure on the server!"
echo "The public key will be distributed with the client app."
