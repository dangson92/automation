import { query } from '../server/db.js'

async function checkDatabase() {
  try {
    console.log('=== Kiểm tra Database ===\n')

    // Check users
    console.log('1. Kiểm tra Users:')
    const users = await query('SELECT id, email, role FROM users ORDER BY id')
    if (users.rows.length === 0) {
      console.log('   ⚠️  CẢNH BÁO: Không có user nào trong database!')
      console.log('   Hãy tạo user admin trước khi tạo license key.')
    } else {
      console.log(`   ✓ Có ${users.rows.length} users:`)
      users.rows.forEach(u => {
        console.log(`     - ID: ${u.id}, Email: ${u.email}, Role: ${u.role}`)
      })
    }
    console.log()

    // Check apps
    console.log('2. Kiểm tra Apps:')
    const apps = await query('SELECT id, code, name FROM apps ORDER BY id')
    if (apps.rows.length === 0) {
      console.log('   ⚠️  CẢNH BÁO: Không có app nào trong database!')
      console.log('   Hãy tạo app trước khi tạo license key.')
    } else {
      console.log(`   ✓ Có ${apps.rows.length} apps:`)
      apps.rows.forEach(a => {
        console.log(`     - ID: ${a.id}, Code: ${a.code}, Name: ${a.name}`)
      })
    }
    console.log()

    // Check licenses
    console.log('3. Kiểm tra Licenses:')
    const licenses = await query('SELECT COUNT(*) as count FROM licenses')
    console.log(`   ✓ Có ${licenses.rows[0].count} licenses trong database`)
    console.log()

    console.log('=== Kết thúc kiểm tra ===')
    process.exit(0)
  } catch (error) {
    console.error('Lỗi khi kiểm tra database:', error)
    process.exit(1)
  }
}

checkDatabase()
