const pool = require("./config/db");

/**
 * This script tests the tasks-timeline queries to verify they work correctly
 * after applying the fixes recommended in TASKS_TIMELINE_FIX_GUIDE.md
 */

console.log("=".repeat(80));
console.log("TESTING TASKS TIMELINE QUERIES");
console.log("=".repeat(80));
console.log();

async function testQueries() {
  try {
    // Calculate week boundaries (same as server.js)
    function formatDate(d) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayStr = formatDate(now);
    
    const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
    const endOfThisWeek = new Date(now);
    if (daysUntilSaturday === 0) {
      endOfThisWeek.setDate(now.getDate());
    } else {
      endOfThisWeek.setDate(now.getDate() + daysUntilSaturday);
    }
    endOfThisWeek.setHours(23, 59, 59, 999);
    const endOfThisWeekStr = formatDate(endOfThisWeek);
    
    const startOfNextWeek = new Date(endOfThisWeek);
    startOfNextWeek.setDate(endOfThisWeek.getDate() + 1);
    startOfNextWeek.setHours(0, 0, 0, 0);
    const startOfNextWeekStr = formatDate(startOfNextWeek);
    
    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
    endOfNextWeek.setHours(23, 59, 59, 999);
    const endOfNextWeekStr = formatDate(endOfNextWeek);
    
    console.log("Week Boundaries:");
    console.log(`  Today: ${todayStr}`);
    console.log(`  This Week: ${todayStr} to ${endOfThisWeekStr}`);
    console.log(`  Next Week: ${startOfNextWeekStr} to ${endOfNextWeekStr}`);
    console.log();

    // Test 1: Superadmin - This Week
    console.log("TEST 1: Superadmin - This Week Tasks");
    console.log("-".repeat(80));
    const dateField = "COALESCE(NULLIF(t.due_date, ''), t.created_at)";
    const superadminThisWeekQuery = `
      SELECT 
        t.id,
        t.name as title,
        u.username as assignee,
        t.status,
        t.due_date,
        t.created_at,
        DATE(${dateField}) as task_date
      FROM tasks t
      JOIN users u ON u.id = t.assignee_id
      WHERE DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?)
      ORDER BY DATE(${dateField}) ASC, t.created_at DESC
    `;
    
    const [superadminThisWeek] = await pool.promise().execute(superadminThisWeekQuery, [
      todayStr, endOfThisWeekStr
    ]);
    
    console.log(`Result: ${superadminThisWeek.length} tasks`);
    if (superadminThisWeek.length > 0) {
      console.log("Sample tasks:");
      superadminThisWeek.slice(0, 5).forEach((task, idx) => {
        console.log(`  ${idx + 1}. [${task.status}] ${task.title} - ${task.assignee}`);
        console.log(`     Due: ${task.due_date || 'N/A'}, Task Date: ${task.task_date}`);
      });
    }
    console.log();

    // Test 2: Superadmin - Next Week
    console.log("TEST 2: Superadmin - Next Week Tasks");
    console.log("-".repeat(80));
    const superadminNextWeekQuery = `
      SELECT 
        t.id,
        t.name as title,
        u.username as assignee,
        t.status,
        t.due_date,
        t.created_at,
        DATE(${dateField}) as task_date
      FROM tasks t
      JOIN users u ON u.id = t.assignee_id
      WHERE DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?)
      ORDER BY DATE(${dateField}) ASC, t.created_at DESC
    `;
    
    const [superadminNextWeek] = await pool.promise().execute(superadminNextWeekQuery, [
      startOfNextWeekStr, endOfNextWeekStr
    ]);
    
    console.log(`Result: ${superadminNextWeek.length} tasks`);
    if (superadminNextWeek.length > 0) {
      console.log("Sample tasks:");
      superadminNextWeek.slice(0, 5).forEach((task, idx) => {
        console.log(`  ${idx + 1}. [${task.status}] ${task.title} - ${task.assignee}`);
        console.log(`     Due: ${task.due_date || 'N/A'}, Task Date: ${task.task_date}`);
      });
    }
    console.log();

    // Test 3: Manager - This Week
    console.log("TEST 3: Manager - This Week Tasks");
    console.log("-".repeat(80));
    const [managers] = await pool.promise().execute(`
      SELECT id, username FROM users WHERE role IN ('manager', 'team_lead') LIMIT 1
    `);
    
    if (managers.length > 0) {
      const manager = managers[0];
      const managerThisWeekQuery = `
        SELECT 
          t.id,
          t.name as title,
          u.username as assignee,
          t.status,
          t.due_date,
          t.created_at,
          DATE(${dateField}) as task_date
        FROM tasks t
        JOIN users u ON u.id = t.assignee_id
        WHERE DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?)
          AND t.project_id IN (SELECT project_id FROM project_assignments WHERE assigned_to_user_id = ?)
        ORDER BY DATE(${dateField}) ASC, t.created_at DESC
      `;
      
      const [managerThisWeek] = await pool.promise().execute(managerThisWeekQuery, [
        todayStr, endOfThisWeekStr, manager.id
      ]);
      
      console.log(`Manager: ${manager.username} (ID: ${manager.id})`);
      console.log(`Result: ${managerThisWeek.length} tasks in This Week`);
      
      const managerNextWeekQuery = `
        SELECT 
          t.id,
          t.name as title,
          u.username as assignee,
          t.status,
          t.due_date,
          t.created_at,
          DATE(${dateField}) as task_date
        FROM tasks t
        JOIN users u ON u.id = t.assignee_id
        WHERE DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?)
          AND t.project_id IN (SELECT project_id FROM project_assignments WHERE assigned_to_user_id = ?)
        ORDER BY DATE(${dateField}) ASC, t.created_at DESC
      `;
      
      const [managerNextWeek] = await pool.promise().execute(managerNextWeekQuery, [
        startOfNextWeekStr, endOfNextWeekStr, manager.id
      ]);
      
      console.log(`Result: ${managerNextWeek.length} tasks in Next Week`);
      console.log();
    }

    // Test 4: Employee - This Week
    console.log("TEST 4: Employee - This Week Tasks");
    console.log("-".repeat(80));
    const [employees] = await pool.promise().execute(`
      SELECT id, username FROM users WHERE role = 'employee' LIMIT 1
    `);
    
    if (employees.length > 0) {
      const employee = employees[0];
      const employeeThisWeekQuery = `
        SELECT 
          t.id,
          t.name as title,
          u.username as assignee,
          t.status,
          t.due_date,
          t.created_at,
          DATE(${dateField}) as task_date
        FROM tasks t
        JOIN users u ON u.id = t.assignee_id
        WHERE DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?)
          AND t.assignee_id = ?
        ORDER BY DATE(${dateField}) ASC, t.created_at DESC
      `;
      
      const [employeeThisWeek] = await pool.promise().execute(employeeThisWeekQuery, [
        todayStr, endOfThisWeekStr, employee.id
      ]);
      
      console.log(`Employee: ${employee.username} (ID: ${employee.id})`);
      console.log(`Result: ${employeeThisWeek.length} tasks in This Week`);
      
      const employeeNextWeekQuery = `
        SELECT 
          t.id,
          t.name as title,
          u.username as assignee,
          t.status,
          t.due_date,
          t.created_at,
          DATE(${dateField}) as task_date
        FROM tasks t
        JOIN users u ON u.id = t.assignee_id
        WHERE DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?)
          AND t.assignee_id = ?
        ORDER BY DATE(${dateField}) ASC, t.created_at DESC
      `;
      
      const [employeeNextWeek] = await pool.promise().execute(employeeNextWeekQuery, [
        startOfNextWeekStr, endOfNextWeekStr, employee.id
      ]);
      
      console.log(`Result: ${employeeNextWeek.length} tasks in Next Week`);
      console.log();
    }

    // Test 5: Verify no duplicate tasks between weeks
    console.log("TEST 5: Verify Task Segregation");
    console.log("-".repeat(80));
    const [allTasksInRange] = await pool.promise().execute(`
      SELECT 
        t.id,
        t.name,
        DATE(${dateField}) as task_date,
        CASE 
          WHEN DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?) THEN 'This Week'
          WHEN DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?) THEN 'Next Week'
          ELSE 'Other'
        END as period
      FROM tasks t
      WHERE DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?)
      ORDER BY task_date ASC
    `, [
      todayStr, endOfThisWeekStr, // For CASE
      startOfNextWeekStr, endOfNextWeekStr, // For CASE
      todayStr, endOfNextWeekStr // For WHERE (both weeks)
    ]);
    
    const thisWeekIds = new Set(superadminThisWeek.map(t => t.id));
    const nextWeekIds = new Set(superadminNextWeek.map(t => t.id));
    const duplicates = [...thisWeekIds].filter(id => nextWeekIds.has(id));
    
    console.log(`Total tasks in both weeks: ${allTasksInRange.length}`);
    console.log(`Tasks in This Week: ${thisWeekIds.size}`);
    console.log(`Tasks in Next Week: ${nextWeekIds.size}`);
    console.log(`Duplicate tasks (should be 0): ${duplicates.length}`);
    
    if (duplicates.length > 0) {
      console.log("⚠️  WARNING: Found duplicate tasks!");
      duplicates.forEach(id => {
        const task = allTasksInRange.find(t => t.id === id);
        console.log(`  - Task ID ${id}: ${task.name} (${task.period})`);
      });
    } else {
      console.log("✅ No duplicate tasks found - segregation is correct!");
    }
    console.log();

    // Summary
    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total tasks in database: 54`);
    console.log(`Tasks in This Week: ${superadminThisWeek.length}`);
    console.log(`Tasks in Next Week: ${superadminNextWeek.length}`);
    console.log(`Tasks visible in timeline: ${superadminThisWeek.length + superadminNextWeek.length}`);
    console.log(`Tasks not in timeline (Past/Future): ${54 - (superadminThisWeek.length + superadminNextWeek.length)}`);
    console.log();
    console.log("✅ If you want to show all 54 tasks, you need to:");
    console.log("   1. Expand the date range to include past/future tasks, OR");
    console.log("   2. Add 'Past' and 'Future' sections to the UI");
    console.log();

  } catch (error) {
    console.error("Error during testing:", error);
  } finally {
    process.exit(0);
  }
}

testQueries();

