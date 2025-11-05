const pool = require('./config/db');

async function checkUserAssignments() {
  try {
    const username = process.argv[2] || 'hemanth kumar';
    
    console.log(`🔍 Checking assignments for user: ${username}\n`);

    // Find user
    const [users] = await pool.promise().execute(
      'SELECT id, username, role, email FROM users WHERE username LIKE ?',
      [`%${username}%`]
    );

    if (users.length === 0) {
      console.log('❌ User not found!');
      process.exit(1);
    }

    const user = users[0];
    console.log(`✅ Found user:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Email: ${user.email}\n`);

    if (user.role === 'manager' || user.role === 'team_lead') {
      // Check project assignments
      const [assignments] = await pool.promise().execute(
        `SELECT 
          pa.id,
          pa.project_id,
          p.name as project_name,
          pa.assigned_at
        FROM project_assignments pa
        JOIN projects p ON pa.project_id = p.id
        WHERE pa.assigned_to_user_id = ?`,
        [user.id]
      );

      console.log(`📋 Project Assignments: ${assignments.length}`);
      if (assignments.length === 0) {
        console.log('   ⚠️  No projects assigned! User will see all projects.');
        console.log('\n💡 To assign projects, use the "Assign Projects" page as super admin.');
      } else {
        assignments.forEach((a, i) => {
          console.log(`   ${i + 1}. ${a.project_name} (ID: ${a.project_id})`);
        });
      }
    } else {
      console.log(`ℹ️  User is ${user.role}, no project assignments needed.`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkUserAssignments();

