# Tasks Timeline Fix Guide

## Issues Identified

### Issue 1: Tasks showing in wrong week for employees/managers
**Problem**: All tasks are appearing in "this week" table instead of being properly segregated.

**Root Cause**: 
- The fallback logic (lines 4276-4325) uses string comparison which may fail
- Date comparison might have timezone issues
- The week boundary calculation might not match between queries

### Issue 2: Superadmin seeing only 24 tasks instead of 54
**Problem**: Superadmin has 54 tasks but only sees ~24 tasks.

**Root Cause**: 
- The queries only return tasks within "This Week" (20 tasks) and "Next Week" (3 tasks) = 23 tasks
- The remaining 31 tasks are in "Past" (27) and "Future" (4), which are excluded by the date range filter
- This is actually correct behavior for a "this week/next week" view, but if you want to show all tasks, you need to expand the date range

## Diagnostic Results

- **Total tasks in database**: 54
- **Tasks in This Week**: 20
- **Tasks in Next Week**: 3
- **Tasks in Past**: 27
- **Tasks in Future**: 4
- **Total visible in timeline**: 23 (20 + 3)
- **Missing**: 31 (these are Past/Future tasks)

## Required Fixes in server.js

### Fix 1: Improve Date Comparison (Line ~4185)

**Current Code:**
```javascript
const dateField = "COALESCE(NULLIF(t.due_date, ''), t.created_at)";
let whereClause = `DATE(${dateField}) >= ? AND DATE(${dateField}) <= ?`;
```

**Recommended Fix:**
```javascript
// Use DATE() function consistently and handle empty strings properly
const dateField = "COALESCE(NULLIF(t.due_date, ''), t.created_at)";
// Ensure we're comparing dates correctly - MySQL DATE() function handles this
let whereClause = `DATE(${dateField}) >= DATE(?) AND DATE(${dateField}) <= DATE(?)`;
```

### Fix 2: Fix Fallback Logic Date Comparison (Line ~4308)

**Current Code:**
```javascript
fallbackRows.forEach(row => {
  const mapped = mapRow(row);
  const taskDate = row.task_date ? String(row.task_date) : null;
  
  if (taskDate && taskDate <= endOfThisWeekStr) {
    finalThisWeek.push(mapped);
  } else {
    finalNextWeek.push(mapped);
  }
});
```

**Recommended Fix:**
```javascript
fallbackRows.forEach(row => {
  const mapped = mapRow(row);
  const taskDate = row.task_date ? String(row.task_date) : null;
  
  if (taskDate) {
    // Use proper date comparison instead of string comparison
    const taskDateObj = new Date(taskDate);
    const endOfThisWeekObj = new Date(endOfThisWeekStr + 'T23:59:59');
    const startOfNextWeekObj = new Date(startOfNextWeekStr);
    const endOfNextWeekObj = new Date(endOfNextWeekStr + 'T23:59:59');
    
    if (taskDateObj >= new Date(todayStr) && taskDateObj <= endOfThisWeekObj) {
      finalThisWeek.push(mapped);
    } else if (taskDateObj >= startOfNextWeekObj && taskDateObj <= endOfNextWeekObj) {
      finalNextWeek.push(mapped);
    }
    // Tasks outside this week/next week are not added (they're in past/future)
  }
});
```

### Fix 3: Expand Date Range for Superadmin (Optional - Line ~4216)

If you want superadmin to see all tasks, add this before building queries:

**Add after line ~4132:**
```javascript
// For superadmin, expand date range to show more tasks (past 30 days to future 30 days)
let dateRangeStart = todayStr;
let dateRangeEnd = endOfNextWeekStr;

if (role === 'super_admin' || (!role && !userId)) {
  // Expand range: past 30 days to future 30 days
  const expandedStart = new Date(now);
  expandedStart.setDate(now.getDate() - 30);
  const expandedEnd = new Date(now);
  expandedEnd.setDate(now.getDate() + 30);
  
  dateRangeStart = formatDate(expandedStart);
  dateRangeEnd = formatDate(expandedEnd);
  
  console.log(`Superadmin: Using expanded date range: ${dateRangeStart} to ${dateRangeEnd}`);
}
```

Then modify the buildQuery function to use these expanded dates for superadmin.

### Fix 4: Ensure Proper Date Parameter Format (Line ~4184)

**Current Code:**
```javascript
const buildQuery = (weekStart, weekEnd, weekLabel) => {
  const allParams = [...params, weekStart, weekEnd];
```

**Recommended Fix:**
```javascript
const buildQuery = (weekStart, weekEnd, weekLabel) => {
  // Ensure dates are in YYYY-MM-DD format
  const formattedStart = weekStart instanceof Date ? formatDate(weekStart) : weekStart;
  const formattedEnd = weekEnd instanceof Date ? formatDate(weekEnd) : weekEnd;
  const allParams = [...params, formattedStart, formattedEnd];
```

### Fix 5: Remove or Fix Fallback Logic (Line ~4276)

The fallback logic might be causing issues. Consider removing it or fixing it:

**Option A: Remove fallback entirely** (if you want strict week-based filtering):
```javascript
// Remove the entire fallback block (lines 4276-4325)
// Just return the results directly:
res.json({
  thisWeek: finalThisWeek,
  nextWeek: finalNextWeek,
});
```

**Option B: Fix fallback to properly categorize** (if you want to show tasks even when weeks are empty):
Use the improved date comparison from Fix 2 above.

## Testing

After applying fixes, test with:

1. **Superadmin**: Should see tasks correctly segregated by week
2. **Manager**: Should see tasks from assigned projects, correctly segregated
3. **Employee**: Should see their own tasks, correctly segregated

## Expected Behavior After Fix

- **This Week**: Tasks with due_date (or created_at if no due_date) between today and end of this week (Saturday)
- **Next Week**: Tasks with due_date (or created_at if no due_date) between start of next week (Sunday) and end of next week (Saturday)
- **Past/Future tasks**: Excluded from timeline (unless you implement Fix 3 for superadmin)

## Notes

- The current behavior of showing only "This Week" and "Next Week" tasks is actually correct for a timeline view
- If you want to show all 54 tasks for superadmin, you need to either:
  - Expand the date range (Fix 3)
  - Add "Past" and "Future" sections to the UI
  - Remove date filtering entirely for superadmin

