#!/usr/bin/env node

/**
 * Create an admin user
 */

const readline = require('readline');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createAdmin() {
  console.log('===========================================');
  console.log('Create Admin User');
  console.log('===========================================\n');

  try {
    const email = await question('Admin email: ');
    const password = await question('Admin password (min 6 chars): ');
    const fullName = await question('Full name: ');

    if (!email || !password || !fullName) {
      console.error('All fields are required!');
      process.exit(1);
    }

    if (password.length < 6) {
      console.error('Password must be at least 6 characters!');
      process.exit(1);
    }

    console.log('\nCreating admin user...');

    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    // Check if email already exists
    const [existing] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      console.error('✗ Email already exists!');
      process.exit(1);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create admin user
    await connection.execute(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [email, passwordHash, fullName, 'admin']
    );

    await connection.end();

    console.log('✓ Admin user created successfully!\n');
    console.log('You can now login with:');
    console.log(`  Email: ${email}`);
    console.log(`  Password: ${password}\n`);

  } catch (err) {
    console.error('✗ Failed to create admin user:', err.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

createAdmin();
