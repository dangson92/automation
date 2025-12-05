#!/usr/bin/env node

/**
 * Initialize database schema
 * Run this script after creating the database
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDatabase() {
  console.log('Initializing database...\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
  });

  try {
    // Read SQL schema file
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema.sql...');
    await connection.query(sql);

    console.log('✓ Database initialized successfully!\n');
    console.log('Next steps:');
    console.log('  1. Run: npm run create-admin');
    console.log('  2. Start server: npm start\n');

  } catch (err) {
    console.error('✗ Database initialization failed:', err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

initDatabase();
