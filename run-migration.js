const pool = require('./config/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('🔄 Starting database migration...\n');

    // Read the SQL file
    const sqlPath = path.join(__dirname, 'sql', 'add_project_assignments.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Split SQL into individual statements
    // Remove comments first
    let cleanSql = sql
      .split('\n')
      .map(line => {
        const commentIndex = line.indexOf('--');
        if (commentIndex !== -1) {
          return line.substring(0, commentIndex);
        }
        return line;
      })
      .join('\n');
    
    // Split by semicolon and filter empty statements
    const statements = cleanSql
      .split(';')
      .map(s => s.trim().replace(/\n+/g, ' '))
      .filter(s => s.length > 0 && !s.match(/^\s*$/));

    console.log(`📝 Found ${statements.length} SQL statement(s) to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`);
      console.log(`   ${statement.substring(0, 100)}...\n`);
      
      await pool.promise().execute(statement);
      
      console.log(`✅ Statement ${i + 1} executed successfully\n`);
    }

    console.log('✨ Migration completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   - Added "super_admin" to users.role ENUM');
    console.log('   - Created project_assignments table');
    console.log('\n🎉 You can now use the project assignment feature!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('\nError details:', error.message);
    process.exit(1);
  }
}

runMigration();

