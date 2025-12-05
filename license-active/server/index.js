import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import authRouter from './modules/auth.js'
import userRouter from './modules/user.js'
import adminRouter from './modules/admin.js'
import activateRouter from './modules/activate.js'

const app = express()

// CORS must be FIRST - before any other middleware
// CORS configuration for frontend domain
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'https://license.dangthanhson.com',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400 // 24 hours
}
app.use(cors(corsOptions))

// Handle preflight requests explicitly
app.options('*', cors(corsOptions))

app.use(express.json())
app.use(helmet({
  crossOriginResourcePolicy: false, // Don't block cross-origin requests
}))
app.use(morgan('combined'))

const activateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
app.use('/activate', activateLimiter)

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'license-server' })
})

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

app.use('/auth', authRouter)
app.use('/user', userRouter)
app.use('/admin', adminRouter)
app.use('/activate', activateRouter)

const port = process.env.PORT ? Number(process.env.PORT) : 3000
app.listen(port, () => {})
