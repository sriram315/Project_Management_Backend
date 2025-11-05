const pool = require('./config/db');

async function createSuperAdmin() {
  try {
    console.log('🔐 Creating Super Admin User...\n');

    // Option 1: Update existing user to super_admin
    const updateExisting = process.argv[2] === '--update';
    const username = updateExisting ? (process.argv[3] || 'admin') : (process.argv[2] || 'admin');

    if (updateExisting) {
      console.log(`📝 Updating user "${username}" to super_admin role...\n`);
      
      const [result] = await pool.promise().execute(
        'UPDATE users SET role = ? WHERE username = ?',
        ['super_admin', username]
      );

      if (result.affectedRows === 0) {
        console.error(`❌ User "${username}" not found!`);
        console.log('\n💡 Available users:');
        const [users] = await pool.promise().execute('SELECT id, username, role FROM users LIMIT 10');
        users.forEach(u => console.log(`   - ${u.username} (${u.role})`));
        process.exit(1);
      }

      console.log(`✅ User "${username}" updated to super_admin successfully!\n`);
      console.log(`🎉 You can now log in with username: ${username}`);
    } else {
      // Option 2: Create new super admin user
      const password = process.argv[3] || 'admin123';
      const email = process.argv[4] || `${username}@example.com`;

      console.log(`📝 Creating new super_admin user...`);
      console.log(`   Username: ${username}`);
      console.log(`   Password: ${password}`);
      console.log(`   Email: ${email}\n`);

      // Check if user already exists
      const [existing] = await pool.promise().execute(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );

      if (existing.length > 0) {
        console.error(`❌ User with username "${username}" or email "${email}" already exists!`);
        console.log('\n💡 Use --update flag to change existing user role:');
        console.log(`   node create-super-admin.js --update ${username}`);
        process.exit(1);
      }

      await pool.promise().execute(
        'INSERT INTO users (username, password, role, email, available_hours_per_week) VALUES (?, ?, ?, ?, ?)',
        [username, password, 'super_admin', email, 40]
      );

      console.log(`✅ Super admin user created successfully!\n`);
      console.log(`🎉 Login credentials:`);
      console.log(`   Username: ${username}`);
      console.log(`   Password: ${password}`);
      console.log(`   Email: ${email}`);
    }

    console.log('\n✨ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Show usage if no arguments
if (process.argv.length < 3) {
  console.log('📖 Usage:');
  console.log('');
  console.log('  Create new super admin:');
  console.log('    node create-super-admin.js <username> [password] [email]');
  console.log('');
  console.log('  Update existing user to super_admin:');
  console.log('    node create-super-admin.js --update <username>');
  console.log('');
  console.log('  Examples:');
  console.log('    node create-super-admin.js admin admin123 admin@example.com');
  console.log('    node create-super-admin.js --update john');
  console.log('');
  process.exit(0);
}

createSuperAdmin();

