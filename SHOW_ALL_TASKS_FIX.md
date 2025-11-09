# Fix: Show ALL Tasks in Dashboard Timeline

## Problem
- Currently only shows tasks within "This Week" and "Next Week" date ranges
- Example: 26 total tasks, but only 20 showing in "this week", "next week" is empty
- Need to show ALL tasks assigned to manager/superadmin, regardless of date

## Solution
Fetch ALL tasks first (no date filter), then categorize them into "this week" and "next week" buckets. Tasks outside these ranges should still be visible (can be shown in "this week" or separate sections).

## Required Changes in server.js

### Location: `/api/dashboard/tasks-timeline` endpoint (around lines 4182-4331)

### Replace the entire query execution block with:

```javascript
// FIXED: Fetch ALL tasks first, then categorize by week
const dateField = "COALESCE(NULLIF(t.due_date, ''), t.created_at)";
const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

// Fetch ALL tasks (no date filter) - this ensures all tasks are visible
const allTasksQuery = `
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
  ${joinClause}
  ${whereClause}
  ORDER BY DATE(${dateField}) ASC, t.created_at DESC
`;

console.log("Fetching ALL tasks with filters:", { conditions, params });

pool.execute(allTasksQuery, params, (err, allRows) => {
  if (err) {
    console.error("Tasks timeline error:", err);
    return res.status(500).json({ error: "Database error" });
  }

  console.log(`Total tasks fetched: ${allRows.length}`);

  // Categorize tasks into this week and next week
  const thisWeekTasks = [];
  const nextWeekTasks = [];

  allRows.forEach(row => {
    let taskDate = row.task_date ? String(row.task_date) : null;
    
    // If no task_date, try to get from created_at
    if (!taskDate && row.created_at) {
      const createdDate = new Date(row.created_at);
      taskDate = formatDate(createdDate);
    }

    if (taskDate) {
      // Compare dates as strings (YYYY-MM-DD format)
      if (taskDate >= todayStr && taskDate <= endOfThisWeekStr) {
        thisWeekTasks.push(row);
      } else if (taskDate >= startOfNextWeekStr && taskDate <= endOfNextWeekStr) {
        nextWeekTasks.push(row);
      } else {
        // Tasks outside this week/next week - show in "this week" for visibility
        // This ensures ALL tasks are visible, not just those in current/next week
        thisWeekTasks.push(row);
      }
    } else {
      // No date available - show in this week
      thisWeekTasks.push(row);
    }
  });

  console.log(`Categorized: This Week: ${thisWeekTasks.length}, Next Week: ${nextWeekTasks.length}`);

  const mapRow = (row) => {
    const statusColor =
      row.status === "completed"
        ? "bg-green-500"
        : row.status === "in_progress"
        ? "bg-cyan-500"
        : row.status === "blocked"
        ? "bg-red-500"
        : "bg-gray-300";
    const statusLabel =
      row.status === "in_progress"
        ? "In Progress"
        : row.status === "todo"
        ? "To Do"
        : row.status.charAt(0).toUpperCase() + row.status.slice(1);
    return {
      id: row.id,
      title: row.title,
      assignee: row.assignee,
      status: statusLabel,
      statusColor,
      estimated: Number(row.estimated) || 0,
      logged: Number(row.logged) || 0,
    };
  };

  res.json({
    thisWeek: thisWeekTasks.map(mapRow),
    nextWeek: nextWeekTasks.map(mapRow),
  });
});
```

## What This Fix Does

1. **Removes date range filter**: Fetches ALL tasks matching the role/project/employee filters
2. **Categorizes by week**: After fetching, categorizes tasks into "this week" and "next week" based on their due dates
3. **Shows all tasks**: Tasks outside the week ranges are still shown (in "this week" section) to ensure visibility
4. **Maintains filtering**: Still respects role-based filtering (manager sees assigned projects, employee sees own tasks, etc.)

## Expected Result

- **Superadmin**: Will see all 54 tasks (or whatever total exists)
- **Manager**: Will see all tasks from their assigned projects (e.g., all 26 tasks)
- **Employee**: Will see all their assigned tasks

Tasks will be properly categorized into "this week" and "next week" based on due dates, but ALL tasks will be visible.

