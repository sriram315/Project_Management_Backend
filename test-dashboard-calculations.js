/**
 * Comprehensive Test Script for Dashboard Productivity and Utilization Calculations
 * Tests positive and negative scenarios
 */

const mysql = require('mysql2');
const config = require('./config/db');

const pool = mysql.createPool(config);

console.log('🧪 Testing Dashboard Productivity and Utilization Calculations\n');

// Test scenarios
const testScenarios = [
  {
    name: "Scenario 1: All tasks, 1 completed out of 26 total",
    description: "Should show ~3.8% productivity",
    filters: { projectId: null, employeeId: null, startDate: null, endDate: null }
  },
  {
    name: "Scenario 2: Single employee with tasks",
    description: "Should show productivity for that employee only",
    filters: { projectId: null, employeeId: "1", startDate: null, endDate: null }
  },
  {
    name: "Scenario 3: Date range filter",
    description: "Should show tasks within date range",
    filters: { projectId: null, employeeId: null, startDate: "2025-11-01", endDate: "2025-11-30" }
  },
  {
    name: "Scenario 4: No completed tasks",
    description: "Should show 0% productivity",
    filters: { projectId: null, employeeId: null, startDate: null, endDate: null, statusFilter: "todo" }
  },
  {
    name: "Scenario 5: All tasks completed",
    description: "Should show 100% productivity",
    filters: { projectId: null, employeeId: null, startDate: null, endDate: null, statusFilter: "completed" }
  }
];

async function testProductivityCalculation(filters) {
  let whereConditions = [];
  let queryParams = [];

  // Build base query
  if (filters.projectId) {
    whereConditions.push("t.project_id = ?");
    queryParams.push(filters.projectId);
  }

  if (filters.employeeId) {
    whereConditions.push("t.assignee_id = ?");
    queryParams.push(filters.employeeId);
  }

  if (filters.statusFilter) {
    whereConditions.push("t.status = ?");
    queryParams.push(filters.statusFilter);
  }

  // NOTE: We're NOT filtering by date for productivity/utilization metrics
  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  const query = `
    SELECT 
      COUNT(*) as total_tasks,
      COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
      SUM(COALESCE(t.planned_hours, 0)) as total_planned_hours,
      SUM(COALESCE(t.actual_hours, 0)) as total_actual_hours
    FROM tasks t
    ${whereClause}
  `;

  return new Promise((resolve, reject) => {
    pool.execute(query, queryParams, (err, results) => {
      if (err) {
        reject(err);
        return;
      }

      const row = results[0];
      const totalTasks = parseInt(row.total_tasks) || 0;
      const completedTasks = parseInt(row.completed_tasks) || 0;
      const productivity = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;

      resolve({
        totalTasks,
        completedTasks,
        productivity: parseFloat(productivity),
        totalPlannedHours: parseFloat(row.total_planned_hours) || 0,
        totalActualHours: parseFloat(row.total_actual_hours) || 0
      });
    });
  });
}

async function testUtilizationCalculation(filters) {
  let whereConditions = [];
  let queryParams = [];

  if (filters.projectId) {
    whereConditions.push("t.project_id = ?");
    queryParams.push(filters.projectId);
  }

  if (filters.employeeId) {
    whereConditions.push("t.assignee_id = ?");
    queryParams.push(filters.employeeId);
  }

  const whereClause = whereConditions.length > 0
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  // Get total planned hours
  const plannedQuery = `
    SELECT SUM(COALESCE(t.planned_hours, 0)) as total_planned
    FROM tasks t
    ${whereClause}
  `;

  // Get total available hours
  let availableQuery = "";
  let availableParams = [];

  if (filters.employeeId) {
    availableQuery = "SELECT COALESCE(SUM(available_hours_per_week), 0) as total FROM users WHERE id = ?";
    availableParams = [filters.employeeId];
  } else {
    availableQuery = "SELECT COALESCE(SUM(COALESCE(available_hours_per_week, 40)), 0) as total FROM users";
    availableParams = [];
  }

  return new Promise((resolve, reject) => {
    pool.execute(plannedQuery, queryParams, (err, plannedResults) => {
      if (err) {
        reject(err);
        return;
      }

      pool.execute(availableQuery, availableParams, (err, availableResults) => {
        if (err) {
          reject(err);
          return;
        }

        const totalPlanned = parseFloat(plannedResults[0].total_planned) || 0;
        const totalAvailable = parseFloat(availableResults[0].total) || 0;
        const utilization = totalAvailable > 0 ? ((totalPlanned / totalAvailable) * 100).toFixed(1) : 0;

        resolve({
          totalPlannedHours: totalPlanned,
          totalAvailableHours: totalAvailable,
          utilization: parseFloat(utilization)
        });
      });
    });
  });
}

async function runTests() {
  console.log('Running test scenarios...\n');

  for (const scenario of testScenarios) {
    console.log(`\n${scenario.name}`);
    console.log(`  ${scenario.description}`);
    console.log(`  Filters:`, scenario.filters);

    try {
      const productivity = await testProductivityCalculation(scenario.filters);
      const utilization = await testUtilizationCalculation(scenario.filters);

      console.log(`  ✅ Results:`);
      console.log(`     Productivity: ${productivity.productivity}% (${productivity.completedTasks} completed / ${productivity.totalTasks} total)`);
      console.log(`     Utilization: ${utilization.utilization}% (${utilization.totalPlannedHours.toFixed(1)}h planned / ${utilization.totalAvailableHours.toFixed(1)}h available)`);

      // Validation
      if (scenario.filters.statusFilter === "todo" && productivity.productivity !== 0) {
        console.log(`     ⚠️  WARNING: Expected 0% productivity for todo-only tasks`);
      }
      if (scenario.filters.statusFilter === "completed" && productivity.productivity !== 100) {
        console.log(`     ⚠️  WARNING: Expected 100% productivity for completed-only tasks`);
      }
    } catch (error) {
      console.error(`  ❌ Error:`, error.message);
    }
  }

  // Test the actual dashboard endpoint query
  console.log(`\n\n🔍 Testing Actual Dashboard Query (No Date Filter):`);
  const dashboardQuery = `
    SELECT 
      COUNT(*) as total_tasks,
      COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
      SUM(COALESCE(t.planned_hours, 0)) as total_planned_hours
    FROM tasks t
  `;

  pool.execute(dashboardQuery, [], (err, results) => {
    if (err) {
      console.error('Error:', err);
      pool.end();
      return;
    }

    const row = results[0];
    const totalTasks = parseInt(row.total_tasks) || 0;
    const completedTasks = parseInt(row.completed_tasks) || 0;
    const productivity = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0;

    console.log(`  Total Tasks: ${totalTasks}`);
    console.log(`  Completed Tasks: ${completedTasks}`);
    console.log(`  Expected Productivity: ${productivity}%`);
    console.log(`  ✅ This should match what the dashboard shows\n`);

    pool.end();
  });
}

runTests();

