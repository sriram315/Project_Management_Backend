const pool = require("./config/db");

/**
 * This script demonstrates the fix needed to show ALL tasks in the dashboard
 * instead of only tasks within "this week" and "next week" date ranges.
 * 
 * The fix involves:
 * 1. Removing date range filters from the WHERE clause
 * 2. Fetching ALL tasks first
 * 3. Then categorizing them into "this week" and "next week" based on their due dates
 */

console.log("=".repeat(80));
console.log("FIX: Show ALL Tasks in Dashboard Timeline");
console.log("=".repeat(80));
console.log();

async function demonstrateFix() {
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

    // Test 1: Current implementation (with date filter) - Superadmin
    console.log("CURRENT IMPLEMENTATION (with date filter):");
    console.log("-".repeat(80));
    const dateField = "COALESCE(NULLIF(t.due_date, ''), t.created_at)";
    
    const currentThisWeekQuery = `
      SELECT 
        t.id,
        t.name as title,
        u.username as assignee,
        t.status,
        DATE(${dateField}) as task_date
      FROM tasks t
      JOIN users u ON u.id = t.assignee_id
      WHERE DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?)
      ORDER BY DATE(${dateField}) ASC
    `;
    
    const [currentThisWeek] = await pool.promise().execute(currentThisWeekQuery, [
      todayStr, endOfThisWeekStr
    ]);
    
    const [currentNextWeek] = await pool.promise().execute(`
      SELECT 
        t.id,
        t.name as title,
        u.username as assignee,
        t.status,
        DATE(${dateField}) as task_date
      FROM tasks t
      JOIN users u ON u.id = t.assignee_id
      WHERE DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?)
      ORDER BY DATE(${dateField}) ASC
    `, [startOfNextWeekStr, endOfNextWeekStr]);
    
    console.log(`  This Week: ${currentThisWeek.length} tasks`);
    console.log(`  Next Week: ${currentNextWeek.length} tasks`);
    console.log(`  Total visible: ${currentThisWeek.length + currentNextWeek.length} tasks`);
    console.log();

    // Test 2: FIXED implementation (NO date filter, fetch ALL tasks, then categorize)
    console.log("FIXED IMPLEMENTATION (fetch ALL tasks, then categorize):");
    console.log("-".repeat(80));
    
    // Fetch ALL tasks (no date filter)
    const allTasksQuery = `
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
      ORDER BY DATE(${dateField}) ASC, t.created_at DESC
    `;
    
    const [allTasks] = await pool.promise().execute(allTasksQuery, []);
    
    console.log(`  Total tasks fetched: ${allTasks.length}`);
    
    // Categorize tasks into this week, next week, and other
    const thisWeekTasks = [];
    const nextWeekTasks = [];
    const otherTasks = [];
    
    allTasks.forEach(task => {
      const taskDate = task.task_date ? new Date(task.task_date) : null;
      if (!taskDate) {
        // If no date, use created_at
        const createdDate = task.created_at ? new Date(task.created_at) : null;
        if (createdDate) {
          const createdDateStr = formatDate(createdDate);
          if (createdDateStr >= todayStr && createdDateStr <= endOfThisWeekStr) {
            thisWeekTasks.push(task);
          } else if (createdDateStr >= startOfNextWeekStr && createdDateStr <= endOfNextWeekStr) {
            nextWeekTasks.push(task);
          } else {
            otherTasks.push(task);
          }
        } else {
          otherTasks.push(task);
        }
      } else {
        const taskDateStr = formatDate(taskDate);
        if (taskDateStr >= todayStr && taskDateStr <= endOfThisWeekStr) {
          thisWeekTasks.push(task);
        } else if (taskDateStr >= startOfNextWeekStr && taskDateStr <= endOfNextWeekStr) {
          nextWeekTasks.push(task);
        } else {
          otherTasks.push(task);
        }
      }
    });
    
    console.log(`  This Week: ${thisWeekTasks.length} tasks`);
    console.log(`  Next Week: ${nextWeekTasks.length} tasks`);
    console.log(`  Other (Past/Future): ${otherTasks.length} tasks`);
    console.log(`  Total: ${thisWeekTasks.length + nextWeekTasks.length + otherTasks.length} tasks`);
    console.log();

    // Test 3: For manager with 26 tasks
    console.log("TEST 3: Manager with multiple tasks");
    console.log("-".repeat(80));
    const [managers] = await pool.promise().execute(`
      SELECT id, username FROM users 
      WHERE role IN ('manager', 'team_lead') 
      LIMIT 1
    `);
    
    if (managers.length > 0) {
      const manager = managers[0];
      
      // Current implementation (with date filter)
      const [managerCurrentThisWeek] = await pool.promise().execute(`
        SELECT COUNT(*) as count
        FROM tasks t
        WHERE DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?)
          AND t.project_id IN (SELECT project_id FROM project_assignments WHERE assigned_to_user_id = ?)
      `, [todayStr, endOfThisWeekStr, manager.id]);
      
      const [managerCurrentNextWeek] = await pool.promise().execute(`
        SELECT COUNT(*) as count
        FROM tasks t
        WHERE DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?)
          AND t.project_id IN (SELECT project_id FROM project_assignments WHERE assigned_to_user_id = ?)
      `, [startOfNextWeekStr, endOfNextWeekStr, manager.id]);
      
      // Fixed implementation (fetch ALL, then categorize)
      const [managerAllTasks] = await pool.promise().execute(`
        SELECT 
          t.id,
          t.name,
          DATE(${dateField}) as task_date
        FROM tasks t
        WHERE t.project_id IN (SELECT project_id FROM project_assignments WHERE assigned_to_user_id = ?)
        ORDER BY DATE(${dateField}) ASC
      `, [manager.id]);
      
      const managerThisWeek = [];
      const managerNextWeek = [];
      const managerOther = [];
      
      managerAllTasks.forEach(task => {
        const taskDate = task.task_date ? new Date(task.task_date) : null;
        if (taskDate) {
          const taskDateStr = formatDate(taskDate);
          if (taskDateStr >= todayStr && taskDateStr <= endOfThisWeekStr) {
            managerThisWeek.push(task);
          } else if (taskDateStr >= startOfNextWeekStr && taskDateStr <= endOfNextWeekStr) {
            managerNextWeek.push(task);
          } else {
            managerOther.push(task);
          }
        } else {
          managerOther.push(task);
        }
      });
      
      console.log(`Manager: ${manager.username} (ID: ${manager.id})`);
      console.log(`  Current implementation:`);
      console.log(`    This Week: ${managerCurrentThisWeek[0].count} tasks`);
      console.log(`    Next Week: ${managerCurrentNextWeek[0].count} tasks`);
      console.log(`    Total visible: ${parseInt(managerCurrentThisWeek[0].count) + parseInt(managerCurrentNextWeek[0].count)} tasks`);
      console.log(`  Fixed implementation:`);
      console.log(`    This Week: ${managerThisWeek.length} tasks`);
      console.log(`    Next Week: ${managerNextWeek.length} tasks`);
      console.log(`    Other: ${managerOther.length} tasks`);
      console.log(`    Total: ${managerAllTasks.length} tasks`);
      console.log();
    }

    // Generate the fix code
    console.log("=".repeat(80));
    console.log("REQUIRED FIX FOR server.js");
    console.log("=".repeat(80));
    console.log();
    console.log("Replace the buildQuery function and query execution logic");
    console.log("(around lines 4183-4331) with the following:");
    console.log();
    console.log("```javascript");
    console.log("// FIXED: Fetch ALL tasks first, then categorize by week");
    console.log("const dateField = \"COALESCE(NULLIF(t.due_date, ''), t.created_at)\";");
    console.log("const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';");
    console.log();
    console.log("// Fetch ALL tasks (no date filter)");
    console.log("const allTasksQuery = `");
    console.log("  SELECT");
    console.log("    t.id,");
    console.log("    t.name as title,");
    console.log("    u.username as assignee,");
    console.log("    t.status,");
    console.log("    COALESCE(t.planned_hours, 0) AS estimated,");
    console.log("    COALESCE(t.actual_hours, 0) AS logged,");
    console.log("    t.due_date,");
    console.log("    t.created_at,");
    console.log("    DATE(${dateField}) as task_date");
    console.log("  FROM tasks t");
    console.log("  JOIN users u ON u.id = t.assignee_id");
    console.log("  ${joinClause}");
    console.log("  ${whereClause}");
    console.log("  ORDER BY DATE(${dateField}) ASC, t.created_at DESC");
    console.log("`;");
    console.log();
    console.log("pool.execute(allTasksQuery, params, (err, allRows) => {");
    console.log("  if (err) {");
    console.log("    console.error(\"Tasks timeline error:\", err);");
    console.log("    return res.status(500).json({ error: \"Database error\" });");
    console.log("  }");
    console.log();
    console.log("  // Categorize tasks into this week and next week");
    console.log("  const thisWeekTasks = [];");
    console.log("  const nextWeekTasks = [];");
    console.log();
    console.log("  allRows.forEach(row => {");
    console.log("    const taskDate = row.task_date ? String(row.task_date) : null;");
    console.log("    if (!taskDate && row.created_at) {");
    console.log("      // Use created_at if no due_date");
    console.log("      const createdDate = new Date(row.created_at);");
    console.log("      taskDate = formatDate(createdDate);");
    console.log("    }");
    console.log();
    console.log("    if (taskDate) {");
    console.log("      if (taskDate >= todayStr && taskDate <= endOfThisWeekStr) {");
    console.log("        thisWeekTasks.push(row);");
    console.log("      } else if (taskDate >= startOfNextWeekStr && taskDate <= endOfNextWeekStr) {");
    console.log("        nextWeekTasks.push(row);");
    console.log("      } else {");
    console.log("        // Tasks outside this week/next week - put in this week for visibility");
    console.log("        // OR create separate sections for Past/Future");
    console.log("        thisWeekTasks.push(row); // Show in this week for now");
    console.log("      }");
    console.log("    } else {");
    console.log("      // No date - show in this week");
    console.log("      thisWeekTasks.push(row);");
    console.log("    }");
    console.log("  });");
    console.log();
    console.log("  const mapRow = (row) => {");
    console.log("    // ... existing mapRow function ...");
    console.log("  };");
    console.log();
    console.log("  res.json({");
    console.log("    thisWeek: thisWeekTasks.map(mapRow),");
    console.log("    nextWeek: nextWeekTasks.map(mapRow),");
    console.log("  });");
    console.log("});");
    console.log("```");
    console.log();

  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

demonstrateFix();

