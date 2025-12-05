# License Server

Backend API server để quản lý license cho PromptFlow Desktop.

## Features

- ✅ User authentication (JWT)
- ✅ Admin & User roles
- ✅ License creation & management
- ✅ Device activation với hardware binding
- ✅ Renewal requests
- ✅ RSA-signed activation tokens
- ✅ Rate limiting & security
- ✅ RESTful API

## Tech Stack

- Node.js + Express
- MySQL
- JWT for authentication
- RSA-2048 for license tokens
- Bcrypt for password hashing

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate RSA Keys

```bash
bash scripts/generate-keys.sh
```

### 3. Configure Environment

```bash
cp .env.example .env
nano .env
```

### 4. Initialize Database

```bash
npm run init-db
npm run create-admin
```

### 5. Start Server

```bash
# Development
npm run dev

# Production
npm start

# Or with PM2
pm2 start src/index.js --name license-server
```

## API Documentation

### Authentication

- `POST /auth/register` - Register new user
- `POST /auth/login` - Login and get JWT token

### User Routes (Authenticated)

- `GET /user/licenses` - Get user's licenses
- `GET /user/licenses/:id` - Get license details
- `POST /user/licenses/:id/renew-requests` - Request license renewal
- `GET /user/renew-requests` - Get user's renewal requests

### Admin Routes (Admin Only)

- `GET /admin/users` - List all users
- `GET /admin/licenses` - List all licenses
- `POST /admin/licenses` - Create new license
- `GET /admin/licenses/:id` - Get license details with activations
- `PATCH /admin/licenses/:id` - Update license
- `GET /admin/renew-requests` - List renewal requests
- `PATCH /admin/renew-requests/:id` - Process renewal request

### Activation Routes (Public)

- `POST /activate` - Activate license for device
- `POST /verify` - Verify activation token (debug)

## Database Schema

See [`schema.sql`](schema.sql) for complete schema.

Tables:
- `users` - User accounts (admin & regular users)
- `apps` - Applications
- `licenses` - License keys
- `activations` - Device activations
- `renew_requests` - License renewal requests

## Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for detailed deployment instructions.

## Security

- HTTPS required
- JWT authentication
- RSA-signed activation tokens
- Password hashing with bcrypt
- Rate limiting on activation endpoint
- Device ID hashing
- SQL injection prevention

## Environment Variables

See [`.env.example`](.env.example) for all configuration options.

Required:
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`
- `DEVICE_SALT`
- `PRIVATE_KEY_PATH`, `PUBLIC_KEY_PATH`

## Scripts

- `npm run init-db` - Initialize database schema
- `npm run create-admin` - Create admin user
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon

## License

MIT
