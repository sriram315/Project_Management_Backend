const pool = require("./config/db");

// Helper function to format date as YYYY-MM-DD
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Calculate week boundaries
function calculateWeekBoundaries() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  const todayStr = formatDate(now);
  
  // Calculate next Saturday from today
  const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
  const endOfThisWeek = new Date(now);
  if (daysUntilSaturday === 0) {
    endOfThisWeek.setDate(now.getDate());
  } else {
    endOfThisWeek.setDate(now.getDate() + daysUntilSaturday);
  }
  endOfThisWeek.setHours(23, 59, 59, 999);
  const endOfThisWeekStr = formatDate(endOfThisWeek);
  
  // Next Week: From Sunday after this week's Saturday onwards
  const startOfNextWeek = new Date(endOfThisWeek);
  startOfNextWeek.setDate(endOfThisWeek.getDate() + 1);
  startOfNextWeek.setHours(0, 0, 0, 0);
  const startOfNextWeekStr = formatDate(startOfNextWeek);
  
  const endOfNextWeek = new Date(startOfNextWeek);
  endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
  endOfNextWeek.setHours(23, 59, 59, 999);
  const endOfNextWeekStr = formatDate(endOfNextWeek);
  
  return {
    today: todayStr,
    thisWeek: { start: todayStr, end: endOfThisWeekStr },
    nextWeek: { start: startOfNextWeekStr, end: endOfNextWeekStr },
    currentDayOfWeek: now.getDay()
  };
}

async function diagnoseTasksTimeline() {
  console.log("=".repeat(80));
  console.log("TASKS TIMELINE DIAGNOSTIC SCRIPT");
  console.log("=".repeat(80));
  console.log();

  const weekBoundaries = calculateWeekBoundaries();
  console.log("Week Boundaries:");
  console.log(`  Today: ${weekBoundaries.today} (Day of week: ${weekBoundaries.currentDayOfWeek})`);
  console.log(`  This Week: ${weekBoundaries.thisWeek.start} to ${weekBoundaries.thisWeek.end}`);
  console.log(`  Next Week: ${weekBoundaries.nextWeek.start} to ${weekBoundaries.nextWeek.end}`);
  console.log();

  try {
    // 1. Check total tasks in database
    const [totalTasks] = await pool.promise().execute(`
      SELECT COUNT(*) as total FROM tasks
    `);
    console.log(`1. Total tasks in database: ${totalTasks[0].total}`);
    console.log();

    // 2. Check tasks by role (superadmin, manager, employee)
    const [superadminTasks] = await pool.promise().execute(`
      SELECT COUNT(*) as total FROM tasks
    `);
    console.log(`2. Tasks visible to superadmin (should be all): ${superadminTasks[0].total}`);
    console.log();

    // 3. Check tasks for managers
    const [managers] = await pool.promise().execute(`
      SELECT DISTINCT u.id, u.username, u.role
      FROM users u
      WHERE u.role IN ('manager', 'team_lead')
      LIMIT 5
    `);

    for (const manager of managers) {
      const [managerTasks] = await pool.promise().execute(`
        SELECT COUNT(*) as total
        FROM tasks t
        WHERE t.project_id IN (
          SELECT project_id FROM project_assignments WHERE assigned_to_user_id = ?
        )
      `, [manager.id]);
      console.log(`   Manager ${manager.username} (ID: ${manager.id}): ${managerTasks[0].total} tasks`);
    }
    console.log();

    // 4. Check tasks for employees
    const [employees] = await pool.promise().execute(`
      SELECT DISTINCT u.id, u.username, u.role
      FROM users u
      WHERE u.role = 'employee'
      LIMIT 5
    `);

    for (const employee of employees) {
      const [employeeTasks] = await pool.promise().execute(`
        SELECT COUNT(*) as total
        FROM tasks t
        WHERE t.assignee_id = ?
      `, [employee.id]);
      console.log(`   Employee ${employee.username} (ID: ${employee.id}): ${employeeTasks[0].total} tasks`);
    }
    console.log();

    // 5. Check task distribution by due date
    console.log("5. Task Distribution by Due Date:");
    const [taskDistribution] = await pool.promise().execute(`
      SELECT 
        CASE 
          WHEN due_date IS NULL THEN 'No Due Date'
          WHEN DATE(due_date) < ? THEN 'Past'
          WHEN DATE(due_date) >= ? AND DATE(due_date) <= ? THEN 'This Week'
          WHEN DATE(due_date) >= ? AND DATE(due_date) <= ? THEN 'Next Week'
          ELSE 'Future'
        END as period,
        COUNT(*) as count
      FROM tasks
      GROUP BY period
    `, [
      weekBoundaries.today,
      weekBoundaries.thisWeek.start,
      weekBoundaries.thisWeek.end,
      weekBoundaries.nextWeek.start,
      weekBoundaries.nextWeek.end
    ]);

    taskDistribution.forEach(row => {
      console.log(`   ${row.period}: ${row.count} tasks`);
    });
    console.log();

    // 6. Check tasks with NULL or empty due_date
    const [nullDueDateTasks] = await pool.promise().execute(`
      SELECT COUNT(*) as total
      FROM tasks
      WHERE due_date IS NULL OR due_date = ''
    `);
    console.log(`6. Tasks with NULL or empty due_date: ${nullDueDateTasks[0].total}`);
    console.log();

    // 7. Test the actual query used in tasks-timeline endpoint for superadmin
    console.log("7. Testing tasks-timeline query for superadmin:");
    const conditions = [];
    const params = [];
    
    const dateField = "COALESCE(NULLIF(t.due_date, ''), t.created_at)";
    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ')
      : '';
    
    // This Week query
    const thisWeekQuery = `
      SELECT 
        t.id,
        t.name as title,
        u.username as assignee,
        t.status,
        COALESCE(t.planned_hours, 0) AS estimated,
        COALESCE(t.actual_hours, 0) AS logged,
        t.due_date,
        t.created_at,
        DATE(${dateField}) as task_date
      FROM tasks t
      JOIN users u ON u.id = t.assignee_id
      WHERE DATE(${dateField}) >= ? AND DATE(${dateField}) <= ?
      ORDER BY COALESCE(NULLIF(t.due_date, ''), t.created_at) ASC, t.created_at DESC
    `;
    
    const [thisWeekTasks] = await pool.promise().execute(thisWeekQuery, [
      weekBoundaries.thisWeek.start,
      weekBoundaries.thisWeek.end
    ]);
    
    console.log(`   This Week tasks: ${thisWeekTasks.length}`);
    if (thisWeekTasks.length > 0) {
      console.log(`   Sample tasks (first 5):`);
      thisWeekTasks.slice(0, 5).forEach((task, idx) => {
        console.log(`     ${idx + 1}. [${task.status}] ${task.title} - ${task.assignee} (due: ${task.due_date || 'N/A'}, created: ${task.created_at})`);
      });
    }
    console.log();

    // Next Week query
    const nextWeekQuery = `
      SELECT 
        t.id,
        t.name as title,
        u.username as assignee,
        t.status,
        COALESCE(t.planned_hours, 0) AS estimated,
        COALESCE(t.actual_hours, 0) AS logged,
        t.due_date,
        t.created_at,
        DATE(${dateField}) as task_date
      FROM tasks t
      JOIN users u ON u.id = t.assignee_id
      WHERE DATE(${dateField}) >= ? AND DATE(${dateField}) <= ?
      ORDER BY COALESCE(NULLIF(t.due_date, ''), t.created_at) ASC, t.created_at DESC
    `;
    
    const [nextWeekTasks] = await pool.promise().execute(nextWeekQuery, [
      weekBoundaries.nextWeek.start,
      weekBoundaries.nextWeek.end
    ]);
    
    console.log(`   Next Week tasks: ${nextWeekTasks.length}`);
    if (nextWeekTasks.length > 0) {
      console.log(`   Sample tasks (first 5):`);
      nextWeekTasks.slice(0, 5).forEach((task, idx) => {
        console.log(`     ${idx + 1}. [${task.status}] ${task.title} - ${task.assignee} (due: ${task.due_date || 'N/A'}, created: ${task.created_at})`);
      });
    }
    console.log();

    // 8. Test query for manager
    if (managers.length > 0) {
      const manager = managers[0];
      console.log(`8. Testing tasks-timeline query for manager ${manager.username} (ID: ${manager.id}):`);
      
      const managerConditions = [
        "t.project_id IN (SELECT project_id FROM project_assignments WHERE assigned_to_user_id = ?)"
      ];
      const managerParams = [manager.id];
      
      const managerThisWeekQuery = `
        SELECT 
          t.id,
          t.name as title,
          u.username as assignee,
          t.status,
          COALESCE(t.planned_hours, 0) AS estimated,
          COALESCE(t.actual_hours, 0) AS logged,
          t.due_date,
          t.created_at,
          DATE(${dateField}) as task_date
        FROM tasks t
        JOIN users u ON u.id = t.assignee_id
        WHERE DATE(${dateField}) >= ? AND DATE(${dateField}) <= ?
          AND ${managerConditions.join(' AND ')}
        ORDER BY COALESCE(NULLIF(t.due_date, ''), t.created_at) ASC, t.created_at DESC
      `;
      
      const [managerThisWeekTasks] = await pool.promise().execute(managerThisWeekQuery, [
        weekBoundaries.thisWeek.start,
        weekBoundaries.thisWeek.end,
        ...managerParams
      ]);
      
      console.log(`   This Week tasks: ${managerThisWeekTasks.length}`);
      if (managerThisWeekTasks.length > 0) {
        console.log(`   Sample tasks (first 5):`);
        managerThisWeekTasks.slice(0, 5).forEach((task, idx) => {
          console.log(`     ${idx + 1}. [${task.status}] ${task.title} - ${task.assignee} (due: ${task.due_date || 'N/A'})`);
        });
      }
      
      const [managerNextWeekTasks] = await pool.promise().execute(`
        SELECT 
          t.id,
          t.name as title,
          u.username as assignee,
          t.status,
          COALESCE(t.planned_hours, 0) AS estimated,
          COALESCE(t.actual_hours, 0) AS logged,
          t.due_date,
          t.created_at,
          DATE(${dateField}) as task_date
        FROM tasks t
        JOIN users u ON u.id = t.assignee_id
        WHERE DATE(${dateField}) >= ? AND DATE(${dateField}) <= ?
          AND ${managerConditions.join(' AND ')}
        ORDER BY COALESCE(NULLIF(t.due_date, ''), t.created_at) ASC, t.created_at DESC
      `, [
        weekBoundaries.nextWeek.start,
        weekBoundaries.nextWeek.end,
        ...managerParams
      ]);
      
      console.log(`   Next Week tasks: ${managerNextWeekTasks.length}`);
      console.log();
    }

    // 9. Test query for employee
    if (employees.length > 0) {
      const employee = employees[0];
      console.log(`9. Testing tasks-timeline query for employee ${employee.username} (ID: ${employee.id}):`);
      
      const employeeConditions = ["t.assignee_id = ?"];
      const employeeParams = [employee.id];
      
      const employeeThisWeekQuery = `
        SELECT 
          t.id,
          t.name as title,
          u.username as assignee,
          t.status,
          COALESCE(t.planned_hours, 0) AS estimated,
          COALESCE(t.actual_hours, 0) AS logged,
          t.due_date,
          t.created_at,
          DATE(${dateField}) as task_date
        FROM tasks t
        JOIN users u ON u.id = t.assignee_id
        WHERE DATE(${dateField}) >= ? AND DATE(${dateField}) <= ?
          AND ${employeeConditions.join(' AND ')}
        ORDER BY COALESCE(NULLIF(t.due_date, ''), t.created_at) ASC, t.created_at DESC
      `;
      
      const [employeeThisWeekTasks] = await pool.promise().execute(employeeThisWeekQuery, [
        weekBoundaries.thisWeek.start,
        weekBoundaries.thisWeek.end,
        ...employeeParams
      ]);
      
      console.log(`   This Week tasks: ${employeeThisWeekTasks.length}`);
      if (employeeThisWeekTasks.length > 0) {
        console.log(`   Sample tasks (first 5):`);
        employeeThisWeekTasks.slice(0, 5).forEach((task, idx) => {
          console.log(`     ${idx + 1}. [${task.status}] ${task.title} - ${task.assignee} (due: ${task.due_date || 'N/A'})`);
        });
      }
      
      const [employeeNextWeekTasks] = await pool.promise().execute(`
        SELECT 
          t.id,
          t.name as title,
          u.username as assignee,
          t.status,
          COALESCE(t.planned_hours, 0) AS estimated,
          COALESCE(t.actual_hours, 0) AS logged,
          t.due_date,
          t.created_at,
          DATE(${dateField}) as task_date
        FROM tasks t
        JOIN users u ON u.id = t.assignee_id
        WHERE DATE(${dateField}) >= ? AND DATE(${dateField}) <= ?
          AND ${employeeConditions.join(' AND ')}
        ORDER BY COALESCE(NULLIF(t.due_date, ''), t.created_at) ASC, t.created_at DESC
      `, [
        weekBoundaries.nextWeek.start,
        weekBoundaries.nextWeek.end,
        ...employeeParams
      ]);
      
      console.log(`   Next Week tasks: ${employeeNextWeekTasks.length}`);
      console.log();
    }

    // 10. Check for tasks that might be missing due to date calculation issues
    console.log("10. Checking for potential issues:");
    
    // Check tasks with dates that might fall between weeks incorrectly
    const [dateIssues] = await pool.promise().execute(`
      SELECT 
        t.id,
        t.name,
        t.due_date,
        t.created_at,
        DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at)) as task_date,
        CASE 
          WHEN DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at)) >= ? AND DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at)) <= ? THEN 'This Week'
          WHEN DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at)) >= ? AND DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at)) <= ? THEN 'Next Week'
          ELSE 'Other'
        END as expected_period
      FROM tasks t
      WHERE DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at)) IS NOT NULL
      LIMIT 20
    `, [
      weekBoundaries.thisWeek.start,
      weekBoundaries.thisWeek.end,
      weekBoundaries.nextWeek.start,
      weekBoundaries.nextWeek.end
    ]);
    
    console.log(`   Sample tasks with date calculations (first 10):`);
    dateIssues.slice(0, 10).forEach((task, idx) => {
      console.log(`     ${idx + 1}. Task: ${task.name}`);
      console.log(`        Due Date: ${task.due_date || 'NULL'}`);
      console.log(`        Created: ${task.created_at}`);
      console.log(`        Calculated Date: ${task.task_date}`);
      console.log(`        Expected Period: ${task.expected_period}`);
      console.log();
    });

    // 11. Summary and recommendations
    console.log("=".repeat(80));
    console.log("SUMMARY AND RECOMMENDATIONS");
    console.log("=".repeat(80));
    console.log();
    console.log("Issues Found:");
    console.log("1. Check if week boundary calculation matches between frontend and backend");
    console.log("2. Verify that tasks with NULL due_date are using created_at correctly");
    console.log("3. Ensure date comparisons are using DATE() function consistently");
    console.log("4. Check if there are any LIMIT clauses that might restrict results");
    console.log();
    console.log("Next Steps:");
    console.log("- Review the week boundary calculation logic");
    console.log("- Verify date field handling (due_date vs created_at)");
    console.log("- Check for any query limits or pagination issues");
    console.log();

  } catch (error) {
    console.error("Error during diagnosis:", error);
  } finally {
    process.exit(0);
  }
}

// Run the diagnostic
diagnoseTasksTimeline();

