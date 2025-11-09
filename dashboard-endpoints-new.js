// New Dashboard Endpoints with Proper Calculations
// This file contains the corrected dashboard endpoints

// Helper function to get week number
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Helper function to generate week range
function generateWeekRange(start, end) {
  const result = [];
  const startDateObj = new Date(start);
  const endDateObj = new Date(end);

  const curr = new Date(startDateObj);
  curr.setDate(curr.getDate() - curr.getDay() + 1); // Start of week (Monday)

  while (curr <= endDateObj) {
    const year = curr.getFullYear();
    const week = getWeekNumber(curr);
    result.push(`${year}-W${week.toString().padStart(2, "0")}`);
    curr.setDate(curr.getDate() + 7);
  }

  return result;
}

// Main Dashboard Data Endpoint
// Productivity Formula: (Actual Output / Input Used) × 100
//   - Actual Output = completed tasks count or actual hours
//   - Input Used = planned tasks or planned hours
// Utilization Formula: (Actual Working Time / Available Time) × 100
//   - Actual Working Time = actual hours worked
//   - Available Time = available hours per week
app.get("/api/dashboard/data", (req, res) => {
  try {
    const { projectId, employeeId, startDate, endDate, userId, userRole } = req.query;

    console.log("Dashboard data request:", {
      projectId,
      employeeId,
      startDate,
      endDate,
      userId,
      userRole,
    });

    let whereConditions = [];
    let queryParams = [];
    let joinClause = "";

    // Build base filters (project, employee, role-based)
    // Handle multiple projectIds
    if (projectId && projectId !== "all") {
      const projectIds = String(projectId).split(',').map(id => id.trim()).filter(id => id);
      if (projectIds.length > 0) {
        if (projectIds.length === 1) {
          whereConditions.push("t.project_id = ?");
          queryParams.push(projectIds[0]);
        } else {
          const placeholders = projectIds.map(() => '?').join(',');
          whereConditions.push(`t.project_id IN (${placeholders})`);
          queryParams.push(...projectIds);
        }
      }
    }

    // Handle multiple employeeIds
    if (employeeId && employeeId !== "all") {
      const employeeIds = String(employeeId).split(',').map(id => id.trim()).filter(id => id);
      if (employeeIds.length > 0) {
        if (employeeIds.length === 1) {
          whereConditions.push("t.assignee_id = ?");
          queryParams.push(employeeIds[0]);
        } else {
          const placeholders = employeeIds.map(() => '?').join(',');
          whereConditions.push(`t.assignee_id IN (${placeholders})`);
          queryParams.push(...employeeIds);
        }
      }
    } else if (userRole === 'employee' && userId) {
      // Employees see only their own tasks by default
      whereConditions.push("t.assignee_id = ?");
      queryParams.push(userId);
    }

    // Role-based filtering for managers
    if (userId && userRole && (userRole === 'manager' || userRole === 'team_lead')) {
      // Check if manager has project assignments
      const checkAssignmentsQuery = `
        SELECT COUNT(*) as count
        FROM project_assignments
        WHERE assigned_to_user_id = ?
      `;
      
      pool.execute(checkAssignmentsQuery, [userId], (checkErr, checkRows) => {
        if (checkErr) {
          console.error("Check assignments error:", checkErr);
          return res.json({
            utilizationData: [],
            productivityData: [],
            availabilityData: [],
          });
        }
        
        const hasAssignments = checkRows[0]?.count > 0;
        
        if (hasAssignments) {
          // Manager has assignments - filter by assigned projects
          joinClause = "INNER JOIN project_assignments pa ON t.project_id = pa.project_id";
          whereConditions.push("pa.assigned_to_user_id = ?");
          queryParams.push(userId);
        } else {
          // Manager has no assignments - return empty
          return res.json({
            utilizationData: [],
            productivityData: [],
            availabilityData: [],
          });
        }
        
        executeDashboardQueries();
      });
      return;
    }

    // For super admin or employees, execute directly
    executeDashboardQueries();

    function executeDashboardQueries() {
      // Add date filters
      const dateWhereConditions = [...whereConditions];
      const dateQueryParams = [...queryParams];
      
      if (startDate) {
        dateWhereConditions.push("DATE(COALESCE(t.due_date, t.created_at)) >= ?");
        dateQueryParams.push(startDate);
      }

      if (endDate) {
        dateWhereConditions.push("DATE(COALESCE(t.due_date, t.created_at)) <= ?");
        dateQueryParams.push(endDate);
      }

      const whereClause = dateWhereConditions.length > 0
        ? `WHERE ${dateWhereConditions.join(" AND ")}`
        : "";

      // ========== UTILIZATION QUERY ==========
      // Utilization = (Actual Working Time / Available Time) × 100
      // Actual Working Time = SUM(actual_hours) for all tasks
      // Available Time = SUM(available_hours_per_week) for relevant users
      const utilizationQuery = `
        SELECT 
          week,
          SUM(actual_hours) as actual_working_hours,
          SUM(available_hours) as total_available_hours,
          ROUND((SUM(actual_hours) / NULLIF(SUM(available_hours), 0)) * 100, 1) as utilization_percentage
        FROM (
          SELECT 
            DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u') as week,
            t.assignee_id,
            SUM(COALESCE(t.actual_hours, 0)) as actual_hours,
            MAX(COALESCE(u.available_hours_per_week, 40)) as available_hours
          FROM tasks t
          JOIN users u ON t.assignee_id = u.id
          ${joinClause}
          ${whereClause}
          GROUP BY DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u'), t.assignee_id
        ) as weekly_utilization
        GROUP BY week
        ORDER BY week ASC
      `;

      // ========== PRODUCTIVITY QUERY ==========
      // Productivity = (Actual Output / Input Used) × 100
      // Actual Output = completed tasks count or SUM(actual_hours) for completed tasks
      // Input Used = total tasks or SUM(planned_hours) for all tasks
      // We'll use: (completed tasks / total tasks) × 100 OR (actual_hours / planned_hours) × 100
      const productivityQuery = `
        SELECT 
          DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u') as week,
          COUNT(*) as total_tasks,
          COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
          SUM(COALESCE(t.actual_hours, 0)) as actual_hours,
          SUM(COALESCE(t.planned_hours, 0)) as planned_hours,
          ROUND((COUNT(CASE WHEN t.status = 'completed' THEN 1 END) / NULLIF(COUNT(*), 0)) * 100, 1) as productivity_by_tasks,
          ROUND((SUM(COALESCE(t.actual_hours, 0)) / NULLIF(SUM(COALESCE(t.planned_hours, 0)), 0)) * 100, 1) as productivity_by_hours
        FROM tasks t
        JOIN users u ON t.assignee_id = u.id
        ${joinClause}
        ${whereClause}
        GROUP BY DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u')
        ORDER BY week ASC
      `;

      // ========== AVAILABILITY QUERY ==========
      // Team Availability = Available Hours - Planned Hours per week
      // Positive = available hours, Negative = overutilized
      let totalAvailableQuery = "";
      let totalAvailableParams = [];

      // Get total available hours from relevant users
      if (employeeId && employeeId !== "all") {
        const employeeIds = String(employeeId).split(',').map(id => id.trim()).filter(id => id);
        if (employeeIds.length === 1) {
          totalAvailableQuery = "SELECT COALESCE(SUM(available_hours_per_week), 0) as total FROM users WHERE id = ?";
          totalAvailableParams = [employeeIds[0]];
        } else {
          const placeholders = employeeIds.map(() => '?').join(',');
          totalAvailableQuery = `SELECT COALESCE(SUM(available_hours_per_week), 0) as total FROM users WHERE id IN (${placeholders})`;
          totalAvailableParams = employeeIds;
        }
      } else if (userRole === 'employee' && userId) {
        totalAvailableQuery = "SELECT COALESCE(SUM(available_hours_per_week), 0) as total FROM users WHERE id = ?";
        totalAvailableParams = [userId];
      } else if (projectId && projectId !== "all") {
        const projectIds = String(projectId).split(',').map(id => id.trim()).filter(id => id);
        if (projectIds.length === 1) {
          totalAvailableQuery = `
            SELECT COALESCE(SUM(COALESCE(u.available_hours_per_week, 40)), 0) as total
            FROM users u
            INNER JOIN project_team_members ptm ON u.id = ptm.user_id
            WHERE ptm.project_id = ?
          `;
          totalAvailableParams = [projectIds[0]];
        } else {
          const placeholders = projectIds.map(() => '?').join(',');
          totalAvailableQuery = `
            SELECT COALESCE(SUM(COALESCE(u.available_hours_per_week, 40)), 0) as total
            FROM users u
            INNER JOIN project_team_members ptm ON u.id = ptm.user_id
            WHERE ptm.project_id IN (${placeholders})
          `;
          totalAvailableParams = projectIds;
        }
      } else if (userId && userRole && (userRole === 'manager' || userRole === 'team_lead')) {
        totalAvailableQuery = `
          SELECT COALESCE(SUM(COALESCE(u.available_hours_per_week, 40)), 0) as total
          FROM users u
          INNER JOIN project_team_members ptm ON u.id = ptm.user_id
          INNER JOIN project_assignments pa ON ptm.project_id = pa.project_id
          WHERE pa.assigned_to_user_id = ?
        `;
        totalAvailableParams = [userId];
      } else {
        totalAvailableQuery = "SELECT COALESCE(SUM(COALESCE(available_hours_per_week, 40)), 0) as total FROM users";
        totalAvailableParams = [];
      }

      const availabilityQuery = `
        SELECT 
          week,
          COALESCE(?, 0) - COALESCE(SUM(total_planned_hours), 0) as available_hours
        FROM (
          SELECT 
            DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u') as week,
            SUM(COALESCE(t.planned_hours, 0)) as total_planned_hours
          FROM tasks t
          ${joinClause}
          ${whereClause}
          GROUP BY DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u')
        ) as availability_calc
        GROUP BY week
        ORDER BY week ASC
      `;

      // Execute queries
      pool.execute(utilizationQuery, dateQueryParams, (err, utilizationRows) => {
        if (err) {
          console.error("Utilization query error:", err);
          return res.status(500).json({ error: "Database error", details: err.message });
        }

        pool.execute(productivityQuery, dateQueryParams, (err, productivityRows) => {
          if (err) {
            console.error("Productivity query error:", err);
            return res.status(500).json({ error: "Database error", details: err.message });
          }

          pool.execute(totalAvailableQuery, totalAvailableParams, (err, totalAvailableRows) => {
            if (err) {
              console.error("Total available hours query error:", err);
              return res.status(500).json({ error: "Database error", details: err.message });
            }

            const totalAvailableHours = parseFloat(totalAvailableRows[0]?.total) || 0;
            const availabilityParams = [totalAvailableHours, ...dateQueryParams];

            pool.execute(availabilityQuery, availabilityParams, (err, availabilityRows) => {
              if (err) {
                console.error("Availability query error:", err);
                return res.status(500).json({ error: "Database error", details: err.message });
              }

              // Format data
              const utilizationData = utilizationRows.map((row) => ({
                week: row.week,
                utilization: parseFloat(row.utilization_percentage) || 0,
                actualHours: parseFloat(row.actual_working_hours) || 0,
                availableHours: parseFloat(row.total_available_hours) || 0,
              }));

              const productivityData = productivityRows.map((row) => ({
                week: row.week,
                completed: parseInt(row.completed_tasks) || 0,
                total: parseInt(row.total_tasks) || 0,
                hours: parseFloat(row.actual_hours) || 0,
                plannedHours: parseFloat(row.planned_hours) || 0,
                // Use productivity_by_hours if available, otherwise use productivity_by_tasks
                productivity: parseFloat(row.productivity_by_hours) || parseFloat(row.productivity_by_tasks) || 0,
              }));

              const availabilityData = availabilityRows.map((row) => ({
                week: row.week,
                availableHours: parseFloat(row.available_hours) || 0,
              }));

              // Generate all weeks in range
              const allWeeks = (startDate && endDate)
                ? generateWeekRange(startDate, endDate)
                : Array.from(new Set([
                    ...utilizationData.map((d) => d.week),
                    ...productivityData.map((d) => d.week),
                    ...availabilityData.map((d) => d.week),
                  ]));

              if (allWeeks.length === 0) {
                const now = new Date();
                const year = now.getFullYear();
                const week = getWeekNumber(now);
                allWeeks.push(`${year}-W${week.toString().padStart(2, "0")}`);
              }

              // Merge all datasets
              const mergedData = allWeeks.map((week) => {
                const util = utilizationData.find((d) => d.week === week);
                const prod = productivityData.find((d) => d.week === week);
                const avail = availabilityData.find((d) => d.week === week);

                return {
                  week,
                  utilization: util ? util.utilization : null,
                  completed: prod ? prod.completed : 0,
                  hours: prod ? prod.hours : 0,
                  productivity: prod ? prod.productivity : null,
                  plannedHours: prod ? prod.plannedHours : 0,
                  availableHours: avail ? avail.availableHours : totalAvailableHours,
                };
              });

              res.json({
                utilizationData: mergedData,
                productivityData: mergedData,
                availabilityData: mergedData,
              });
            });
          });
        });
      });
    }
  } catch (error) {
    console.error("Dashboard data error:", error);
    res.json({
      utilizationData: [],
      productivityData: [],
      availabilityData: [],
    });
  }
});

