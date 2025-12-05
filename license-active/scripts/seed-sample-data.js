import { query } from '../server/db.js'
import bcrypt from 'bcrypt'

async function seedSampleData() {
  try {
    console.log('=== Tạo dữ liệu mẫu ===\n')

    // Check if we already have data
    const apps = await query('SELECT COUNT(*) as count FROM apps')
    if (apps.rows[0].count > 0) {
      console.log('⚠️  Database đã có apps. Bỏ qua việc tạo app mẫu.')
    } else {
      console.log('1. Tạo apps mẫu...')
      await query('INSERT INTO apps(code, name, created_at) VALUES(?, ?, NOW())',
        ['my-app', 'My Application'])
      await query('INSERT INTO apps(code, name, created_at) VALUES(?, ?, NOW())',
        ['test-app', 'Test Application'])
      console.log('   ✓ Đã tạo 2 apps mẫu')
    }
    console.log()

    // Check users
    const users = await query('SELECT COUNT(*) as count FROM users')
    if (users.rows[0].count > 0) {
      console.log('⚠️  Database đã có users. Bỏ qua việc tạo user mẫu.')
    } else {
      console.log('2. Tạo users mẫu...')
      const hashedPassword = await bcrypt.hash('password123', 10)

      await query(
        'INSERT INTO users(email, password_hash, full_name, role, created_at) VALUES(?, ?, ?, ?, NOW())',
        ['admin@example.com', hashedPassword, 'Admin User', 'admin']
      )
      await query(
        'INSERT INTO users(email, password_hash, full_name, role, created_at) VALUES(?, ?, ?, ?, NOW())',
        ['user@example.com', hashedPassword, 'Test User', 'user']
      )
      console.log('   ✓ Đã tạo 2 users mẫu')
      console.log('   - admin@example.com / password123 (admin)')
      console.log('   - user@example.com / password123 (user)')
    }
    console.log()

    console.log('=== Hoàn tất ===')
    console.log('Bạn có thể login bằng: admin@example.com / password123')
    process.exit(0)
  } catch (error) {
    console.error('Lỗi khi tạo dữ liệu mẫu:', error)
    process.exit(1)
  }
}

seedSampleData()
