import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'

const router = express.Router()

const signUserToken = (user) => {
  const payload = { id: user.id, role: user.role, email: user.email }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' })
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body
    if (!email || !password || !fullName) return res.status(400).json({ error: 'invalid_input' })
    const existing = await query('SELECT id FROM users WHERE email=?', [email])
    if (existing.rows.length) return res.status(409).json({ error: 'email_exists' })
    const passwordHash = await bcrypt.hash(password, 10)
    await query(
      'INSERT INTO users(email,password_hash,full_name,role,created_at) VALUES(?,?,?,?,NOW())',
      [email, passwordHash, fullName, 'user']
    )
    const created = await query('SELECT id,email,role FROM users WHERE email=?', [email])
    const token = signUserToken(created.rows[0])
    res.json({ token })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'invalid_input' })
    const result = await query('SELECT id,email,password_hash,role FROM users WHERE email=?', [email])
    if (!result.rows.length) return res.status(401).json({ error: 'invalid_credentials' })
    const user = result.rows[0]
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' })
    await query('UPDATE users SET last_login_at=NOW() WHERE id=?', [user.id])
    const token = signUserToken(user)
    res.json({ token })
  } catch (e) {
    res.status(500).json({ error: 'server_error' })
  }
})

export const requireUser = (req, res, next) => {
  try {
    const h = req.headers.authorization || ''
    const parts = h.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'unauthorized' })
    const data = jwt.verify(parts[1], process.env.JWT_SECRET)
    req.user = { id: data.id, role: data.role, email: data.email }
    next()
  } catch (e) {
    res.status(401).json({ error: 'unauthorized' })
  }
}

export const requireAdmin = (req, res, next) => {
  requireUser(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' })
    next()
  })
}

export default router
