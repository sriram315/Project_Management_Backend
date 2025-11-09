// const mysql = require('mysql2');
// const config = require('./config/db');

// const pool = mysql.createPool(config);

// // Check hemanth's data
// pool.execute('SELECT id, username, role FROM users WHERE username LIKE ?', ['%hemanth%'], (err, users) => {
//   if (err) {
//     console.error('Error finding hemanth:', err);
//     pool.end();
//     return;
//   }

//   if (!users || users.length === 0) {
//     console.log('❌ Hemanth user not found');
//     pool.end();
//     return;
//   }

//   const hemanth = users[0];
//   console.log('✅ Found user:', hemanth);

//   // Check project assignments
//   pool.execute(
//     'SELECT pa.*, p.name as project_name FROM project_assignments pa INNER JOIN projects p ON pa.project_id = p.id WHERE pa.assigned_to_user_id = ?',
//     [hemanth.id],
//     (err, assignments) => {
//       if (err) {
//         console.error('Error checking assignments:', err);
//         pool.end();
//         return;
//       }

//       console.log(`\n📋 Project Assignments (${assignments.length}):`);
//       if (assignments.length === 0) {
//         console.log('❌ Hemanth has NO project assignments!');
//         console.log('   This is why productivity/utilization data is not showing.');
//         console.log('   SOLUTION: Assign projects to hemanth via Project Assignments feature.');
//         pool.end();
//         return;
//       } else {
//         assignments.forEach((a, i) => {
//           console.log(`   ${i + 1}. Project: ${a.project_name} (ID: ${a.project_id})`);
//         });

//         // Check tasks in assigned projects
//         const projectIds = assignments.map(a => a.project_id);
//         const placeholders = projectIds.map(() => '?').join(',');

//         pool.execute(
//           `SELECT COUNT(*) as task_count, 
//            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
//            SUM(planned_hours) as total_planned,
//            SUM(actual_hours) as total_actual
//            FROM tasks 
//            WHERE project_id IN (${placeholders})`,
//           projectIds,
//           (err, taskStats) => {
//             if (err) {
//               console.error('Error checking tasks:', err);
//               pool.end();
//               return;
//             }

//             const stats = taskStats[0];
//             console.log(`\n📊 Task Statistics in Assigned Projects:`);
//             console.log(`   Total Tasks: ${stats.task_count}`);
//             console.log(`   Completed: ${stats.completed_count}`);
//             console.log(`   Total Planned Hours: ${stats.total_planned || 0}`);
//             console.log(`   Total Actual Hours: ${stats.total_actual || 0}`);

//             if (stats.task_count === 0) {
//               console.log('   ⚠️  No tasks found in assigned projects!');
//               console.log('   SOLUTION: Create tasks in the assigned projects.');
//             }

//             // Check team members in assigned projects
//             pool.execute(
//               `SELECT COUNT(DISTINCT ptm.user_id) as member_count,
//                SUM(COALESCE(u.available_hours_per_week, 40)) as total_available_hours
//                FROM project_team_members ptm
//                INNER JOIN users u ON ptm.user_id = u.id
//                WHERE ptm.project_id IN (${placeholders})`,
//               projectIds,
//               (err, memberStats) => {
//                 if (err) {
//                   console.error('Error checking team members:', err);
//                   pool.end();
//                   return;
//                 }

//                 const memberStatsData = memberStats[0];
//                 console.log(`\n👥 Team Members in Assigned Projects:`);
//                 console.log(`   Total Members: ${memberStatsData.member_count}`);
//                 console.log(`   Total Available Hours: ${memberStatsData.total_available_hours || 0}`);

//                 if (memberStatsData.member_count === 0) {
//                   console.log('   ⚠️  No team members found in assigned projects!');
//                   console.log('   SOLUTION: Add team members to the assigned projects.');
//                 }

//                 // Check task dates
//                 console.log(`\n📅 Checking Task Dates:`);
//                 pool.execute(
//                   `SELECT 
//                     t.id,
//                     t.name,
//                     t.status,
//                     t.due_date,
//                     t.created_at,
//                     DATE(COALESCE(t.due_date, t.created_at)) as task_date,
//                     t.planned_hours,
//                     t.actual_hours
//                    FROM tasks t
//                    INNER JOIN project_assignments pa ON t.project_id = pa.project_id
//                    WHERE pa.assigned_to_user_id = ?
//                    ORDER BY DATE(COALESCE(t.due_date, t.created_at)) DESC
//                    LIMIT 10`,
//                   [hemanth.id],
//                   (err, taskDates) => {
//                     if (err) {
//                       console.error('Error checking task dates:', err);
//                       pool.end();
//                       return;
//                     }

//                     if (taskDates.length === 0) {
//                       console.log('   ⚠️  No tasks found!');
//                     } else {
//                       console.log(`   Found ${taskDates.length} tasks:`);
//                       taskDates.forEach((task, i) => {
//                         console.log(`   ${i + 1}. ${task.name}`);
//                         console.log(`      Status: ${task.status}`);
//                         console.log(`      Due Date: ${task.due_date || 'NULL'}`);
//                         console.log(`      Created At: ${task.created_at || 'NULL'}`);
//                         console.log(`      Task Date (used in queries): ${task.task_date || 'NULL'}`);
//                         console.log(`      Planned Hours: ${task.planned_hours || 0}`);
//                         console.log(`      Actual Hours: ${task.actual_hours || 0}`);
//                       });
                      
//                       // Check if tasks are in the current week range
//                       const now = new Date();
//                       const dayOfWeek = now.getDay();
//                       const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
//                       const monday = new Date(now);
//                       monday.setDate(now.getDate() + diffToMonday);
//                       const friday = new Date(monday);
//                       friday.setDate(monday.getDate() + 4);
//                       const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
//                       const weekStart = formatDate(monday);
//                       const weekEnd = formatDate(friday);
                      
//                       console.log(`\n   📊 Current Week Range: ${weekStart} to ${weekEnd}`);
//                       const tasksInRange = taskDates.filter(t => {
//                         const taskDate = t.task_date;
//                         return taskDate && taskDate >= weekStart && taskDate <= weekEnd;
//                       });
                      
//                       if (tasksInRange.length === 0) {
//                         console.log(`   ⚠️  NO TASKS IN CURRENT WEEK RANGE!`);
//                         console.log(`   This is why productivity/utilization data is not showing.`);
//                         console.log(`   SOLUTION: Either:`);
//                         console.log(`     1. Select a date range that includes the tasks`);
//                         console.log(`     2. Update task due_date or created_at to fall within the range`);
//                         console.log(`     3. The system should show all tasks regardless of date (will be fixed)`);
//                       } else {
//                         console.log(`   ✅ ${tasksInRange.length} tasks are in the current week range`);
//                       }
//                     }

//                     // Test the actual dashboard query with date filter
//                     console.log(`\n🔍 Testing Dashboard Query with Date Filter (2025-11-03 to 2025-11-07):`);
//                     const testQueryWithDate = `
//                       SELECT 
//                         DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u') as week,
//                         COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
//                         SUM(t.actual_hours) as actual_hours,
//                         SUM(t.planned_hours) as planned_hours
//                       FROM tasks t
//                       INNER JOIN project_assignments pa ON t.project_id = pa.project_id
//                       WHERE pa.assigned_to_user_id = ?
//                         AND DATE(COALESCE(t.due_date, t.created_at)) >= '2025-11-03'
//                         AND DATE(COALESCE(t.due_date, t.created_at)) <= '2025-11-07'
//                       GROUP BY DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u')
//                       ORDER BY week ASC
//                       LIMIT 5
//                     `;

//                     pool.execute(testQueryWithDate, [hemanth.id], (err, testResults) => {
//                       if (err) {
//                         console.error('Error testing query:', err);
//                         pool.end();
//                         return;
//                       }

//                       console.log(`   Query returned ${testResults.length} weeks of data`);
//                       if (testResults.length > 0) {
//                         console.log('   ✅ Sample data:', testResults[0]);
//                       } else {
//                         console.log('   ⚠️  Query returned no data with date filter!');
//                       }

//                       // Test without date filter
//                       console.log(`\n🔍 Testing Dashboard Query WITHOUT Date Filter:`);
//                       const testQueryNoDate = `
//                         SELECT 
//                           DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u') as week,
//                           COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
//                           SUM(t.actual_hours) as actual_hours,
//                           SUM(t.planned_hours) as planned_hours
//                         FROM tasks t
//                         INNER JOIN project_assignments pa ON t.project_id = pa.project_id
//                         WHERE pa.assigned_to_user_id = ?
//                         GROUP BY DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u')
//                         ORDER BY week ASC
//                         LIMIT 5
//                       `;

//                       pool.execute(testQueryNoDate, [hemanth.id], (err, testResultsNoDate) => {
//                         if (err) {
//                           console.error('Error testing query:', err);
//                           pool.end();
//                           return;
//                         }

//                         console.log(`   Query returned ${testResultsNoDate.length} weeks of data`);
//                         if (testResultsNoDate.length > 0) {
//                           console.log('   ✅ Sample data:', testResultsNoDate[0]);
//                           console.log('   ✅ Tasks exist, but date filter is excluding them!');
//                         }

//                         pool.end();
//                       });
//                     });
//                   }
//                 );
//               }
//             );
//           }
//         );
//       }
//     }
//   );
// });