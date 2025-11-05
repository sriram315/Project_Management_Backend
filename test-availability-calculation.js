/**
 * Test script to verify availability calculation for multiple employees
 */

const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'project_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const employeeIds = ['1', '2', '3'];

console.log('Testing availability calculation for employees:', employeeIds);

// Test 1: Single employee
const singleQuery = "SELECT COALESCE(SUM(available_hours_per_week), 0) as total FROM users WHERE id = ?";
pool.execute(singleQuery, [1], (err, rows) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  console.log('\n✅ Single employee (ID 1):', rows[0].total, 'hours');
  
  // Test 2: Multiple employees
  const placeholders = employeeIds.map(() => '?').join(',');
  const multiQuery = `SELECT COALESCE(SUM(available_hours_per_week), 0) as total FROM users WHERE id IN (${placeholders})`;
  
  pool.execute(multiQuery, employeeIds, (err, rows) => {
    if (err) {
      console.error('Error:', err);
      pool.end();
      return;
    }
    console.log('✅ Multiple employees (IDs 1,2,3):', rows[0].total, 'hours');
    console.log('   Expected: 120 hours (3 employees × 40 hours)');
    
    if (parseFloat(rows[0].total) === 120) {
      console.log('✅ PASS: Calculation is correct!');
    } else {
      console.log('❌ FAIL: Expected 120, got', rows[0].total);
    }
    
    // Test 3: Individual employee hours
    console.log('\n📋 Individual employee hours:');
    const individualQuery = "SELECT id, username, available_hours_per_week FROM users WHERE id IN (1, 2, 3) ORDER BY id";
    pool.execute(individualQuery, [], (err, rows) => {
      if (err) {
        console.error('Error:', err);
        pool.end();
        return;
      }
      rows.forEach(row => {
        console.log(`   Employee ${row.id} (${row.username}): ${row.available_hours_per_week} hours`);
      });
      pool.end();
    });
  });
});

