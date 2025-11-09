const pool = require("./config/db");

/**
 * This script identifies and documents the issues with tasks-timeline endpoint
 * Issues found:
 * 1. Week boundary calculation might have timezone issues
 * 2. Date comparison in WHERE clause might not be working correctly
 * 3. Fallback logic might be incorrectly categorizing tasks
 * 4. Superadmin might have a limit somewhere (but diagnostic shows all 54 tasks are accessible)
 */

console.log("=".repeat(80));
console.log("TASKS TIMELINE ISSUE ANALYSIS AND FIX RECOMMENDATIONS");
console.log("=".repeat(80));
console.log();

async function analyzeAndFix() {
  try {
    // 1. Check the actual date format in database
    console.log("1. Checking date formats in database:");
    const [dateSamples] = await pool.promise().execute(`
      SELECT 
        id,
        name,
        due_date,
        created_at,
        DATE(due_date) as due_date_only,
        DATE(created_at) as created_date_only,
        DATE(COALESCE(NULLIF(due_date, ''), created_at)) as calculated_date
      FROM tasks
      WHERE due_date IS NOT NULL
      LIMIT 10
    `);
    
    console.log("   Sample dates from database:");
    dateSamples.forEach((task, idx) => {
      console.log(`   ${idx + 1}. Task: ${task.name}`);
      console.log(`      due_date (raw): ${task.due_date}`);
      console.log(`      due_date (DATE()): ${task.due_date_only}`);
      console.log(`      calculated_date: ${task.calculated_date}`);
      console.log();
    });

    // 2. Test the week boundary calculation
    console.log("2. Testing week boundary calculation:");
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    function formatDate(d) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
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
    
    console.log(`   Today: ${todayStr}`);
    console.log(`   This Week: ${todayStr} to ${endOfThisWeekStr}`);
    console.log(`   Next Week: ${startOfNextWeekStr} to ${endOfNextWeekStr}`);
    console.log();

    // 3. Test the actual query with proper date handling
    console.log("3. Testing queries with proper date handling:");
    
    const dateField = "COALESCE(NULLIF(t.due_date, ''), t.created_at)";
    
    // Test for superadmin (no filters)
    const superadminThisWeekQuery = `
      SELECT 
        t.id,
        t.name,
        t.due_date,
        t.created_at,
        DATE(${dateField}) as task_date,
        CASE 
          WHEN DATE(${dateField}) >= ? AND DATE(${dateField}) <= ? THEN 'This Week'
          WHEN DATE(${dateField}) >= ? AND DATE(${dateField}) <= ? THEN 'Next Week'
          ELSE 'Other'
        END as period
      FROM tasks t
      WHERE DATE(${dateField}) >= ? AND DATE(${dateField}) <= ?
      ORDER BY DATE(${dateField}) ASC
    `;
    
    const [superadminThisWeek] = await pool.promise().execute(superadminThisWeekQuery, [
      todayStr, endOfThisWeekStr, // For CASE
      startOfNextWeekStr, endOfNextWeekStr, // For CASE
      todayStr, endOfThisWeekStr // For WHERE
    ]);
    
    console.log(`   Superadmin - This Week: ${superadminThisWeek.length} tasks`);
    if (superadminThisWeek.length > 0) {
      console.log(`   Sample (first 3):`);
      superadminThisWeek.slice(0, 3).forEach((task, idx) => {
        console.log(`     ${idx + 1}. ${task.name} - task_date: ${task.task_date}, period: ${task.period}`);
      });
    }
    
    const superadminNextWeekQuery = `
      SELECT 
        t.id,
        t.name,
        t.due_date,
        t.created_at,
        DATE(${dateField}) as task_date
      FROM tasks t
      WHERE DATE(${dateField}) >= ? AND DATE(${dateField}) <= ?
      ORDER BY DATE(${dateField}) ASC
    `;
    
    const [superadminNextWeek] = await pool.promise().execute(superadminNextWeekQuery, [
      startOfNextWeekStr, endOfNextWeekStr
    ]);
    
    console.log(`   Superadmin - Next Week: ${superadminNextWeek.length} tasks`);
    console.log();

    // 4. Check for tasks that should be in next week but are showing in this week
    console.log("4. Checking for mis-categorized tasks:");
    const [misCategorized] = await pool.promise().execute(`
      SELECT 
        t.id,
        t.name,
        DATE(${dateField}) as task_date,
        CASE 
          WHEN DATE(${dateField}) >= ? AND DATE(${dateField}) <= ? THEN 'Should be This Week'
          WHEN DATE(${dateField}) >= ? AND DATE(${dateField}) <= ? THEN 'Should be Next Week'
          WHEN DATE(${dateField}) < ? THEN 'Should be Past'
          ELSE 'Should be Future'
        END as expected_period
      FROM tasks t
      WHERE DATE(${dateField}) IS NOT NULL
      ORDER BY DATE(${dateField}) ASC
    `, [
      todayStr, endOfThisWeekStr,
      startOfNextWeekStr, endOfNextWeekStr,
      todayStr
    ]);
    
    console.log(`   Total tasks analyzed: ${misCategorized.length}`);
    const thisWeekCount = misCategorized.filter(t => t.expected_period === 'Should be This Week').length;
    const nextWeekCount = misCategorized.filter(t => t.expected_period === 'Should be Next Week').length;
    const pastCount = misCategorized.filter(t => t.expected_period === 'Should be Past').length;
    const futureCount = misCategorized.filter(t => t.expected_period === 'Should be Future').length;
    
    console.log(`   Expected distribution:`);
    console.log(`     This Week: ${thisWeekCount}`);
    console.log(`     Next Week: ${nextWeekCount}`);
    console.log(`     Past: ${pastCount}`);
    console.log(`     Future: ${futureCount}`);
    console.log();

    // 5. Check if there's a LIMIT clause issue
    console.log("5. Checking for LIMIT clauses or pagination:");
    const [allTasks] = await pool.promise().execute(`
      SELECT COUNT(*) as total FROM tasks
    `);
    console.log(`   Total tasks in database: ${allTasks[0].total}`);
    console.log(`   Tasks in This Week query: ${superadminThisWeek.length}`);
    console.log(`   Tasks in Next Week query: ${superadminNextWeek.length}`);
    console.log(`   Total visible: ${superadminThisWeek.length + superadminNextWeek.length}`);
    console.log(`   Missing: ${allTasks[0].total - (superadminThisWeek.length + superadminNextWeek.length)} (these are Past/Future tasks)`);
    console.log();

    // 6. Generate fix recommendations
    console.log("=".repeat(80));
    console.log("FIX RECOMMENDATIONS");
    console.log("=".repeat(80));
    console.log();
    console.log("ISSUE 1: Tasks showing in wrong week for employees/managers");
    console.log("  ROOT CAUSE: The fallback logic (lines 4276-4325) might be incorrectly");
    console.log("             categorizing tasks when both weeks appear empty.");
    console.log("  FIX: Ensure date comparisons use DATE() function consistently and");
    console.log("       handle timezone issues properly.");
    console.log();
    console.log("ISSUE 2: Superadmin seeing only 24 tasks instead of 54");
    console.log("  ROOT CAUSE: The queries only return tasks within 'This Week' and 'Next Week'");
    console.log("             ranges. Past and Future tasks are excluded.");
    console.log("  FIX: If you want to show all tasks, you need to either:");
    console.log("       a) Remove the date range filter for superadmin, OR");
    console.log("       b) Add a 'Past' and 'Future' section, OR");
    console.log("       c) Expand the date range to include all tasks");
    console.log();
    console.log("ISSUE 3: Date comparison might have timezone issues");
    console.log("  ROOT CAUSE: JavaScript Date objects and MySQL DATE() might handle");
    console.log("             timezones differently.");
    console.log("  FIX: Use UTC dates consistently or ensure MySQL DATE() function");
    console.log("       handles timezone correctly.");
    console.log();
    console.log("RECOMMENDED CODE CHANGES (for server.js):");
    console.log();
    console.log("1. Fix the date comparison to handle timezone properly:");
    console.log("   Instead of: DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at))");
    console.log("   Use: DATE(CONVERT_TZ(COALESCE(NULLIF(t.due_date, ''), t.created_at), '+00:00', @@session.time_zone))");
    console.log();
    console.log("2. Fix the fallback logic to properly categorize tasks:");
    console.log("   The current fallback (line 4308) uses string comparison which might fail.");
    console.log("   Use DATE() comparison instead.");
    console.log();
    console.log("3. For superadmin, consider showing all tasks or expanding date range:");
    console.log("   Add a check: if (role === 'super_admin') { expand date range }");
    console.log();

    // 7. Create a test query that should work correctly
    console.log("=".repeat(80));
    console.log("TEST QUERY (Copy this to test in MySQL directly)");
    console.log("=".repeat(80));
    console.log();
    console.log(`-- This Week Query:`);
    console.log(`SELECT`);
    console.log(`  t.id,`);
    console.log(`  t.name,`);
    console.log(`  DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at)) as task_date`);
    console.log(`FROM tasks t`);
    console.log(`WHERE DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at)) >= '${todayStr}'`);
    console.log(`  AND DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at)) <= '${endOfThisWeekStr}'`);
    console.log(`ORDER BY task_date ASC;`);
    console.log();
    console.log(`-- Next Week Query:`);
    console.log(`SELECT`);
    console.log(`  t.id,`);
    console.log(`  t.name,`);
    console.log(`  DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at)) as task_date`);
    console.log(`FROM tasks t`);
    console.log(`WHERE DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at)) >= '${startOfNextWeekStr}'`);
    console.log(`  AND DATE(COALESCE(NULLIF(t.due_date, ''), t.created_at)) <= '${endOfNextWeekStr}'`);
    console.log(`ORDER BY task_date ASC;`);
    console.log();

  } catch (error) {
    console.error("Error during analysis:", error);
  } finally {
    process.exit(0);
  }
}

analyzeAndFix();

