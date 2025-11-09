# Productivity and Utilization - Detailed Explanation with Examples

## Overview

This system calculates two key metrics to track team performance and resource allocation:

1. **Productivity** - Measures task completion rate
2. **Utilization** - Measures capacity: planned hours vs available hours

---

## 1. PRODUCTIVITY Calculation

### Formula
```
Productivity % = (Completed Tasks / Total Tasks) × 100
```

### What it measures:
- **Productivity** shows the percentage of tasks that have been completed
- It's a simple ratio: out of all tasks, how many are done?

### Example 1: Simple Case

**Scenario:**
- Employee: John
- Week: 2024-W45 (Nov 4-10, 2024)
- Total Tasks: 10
- Completed Tasks: 7
- In Progress: 2
- To Do: 1

**Calculation:**
```
Productivity = (7 / 10) × 100 = 70%
```

**Meaning:** John completed 70% of his assigned tasks for that week.

---

### Example 2: Multiple Employees

**Scenario:**
- Team: 3 employees working on a project
- Week: 2024-W45

**Employee Breakdown:**
- **Sarah**: 5 tasks total, 4 completed → 4/5 = 80%
- **Mike**: 8 tasks total, 6 completed → 6/8 = 75%
- **Lisa**: 3 tasks total, 3 completed → 3/3 = 100%

**Team Productivity Calculation:**
```
Total Tasks = 5 + 8 + 3 = 16
Total Completed = 4 + 6 + 3 = 13
Team Productivity = (13 / 16) × 100 = 81.25%
```

**Meaning:** The team completed 81.25% of all assigned tasks.

---

### Example 3: Over Time (Weekly Breakdown)

**Scenario:** Tracking productivity over 4 weeks

| Week | Total Tasks | Completed Tasks | Productivity |
|------|-------------|-----------------|--------------|
| W42  | 10          | 8               | 80%          |
| W43  | 12          | 9               | 75%          |
| W44  | 15          | 12              | 80%          |
| W45  | 10          | 10              | 100%         |

**Overall Productivity:**
```
Total Tasks = 10 + 12 + 15 + 10 = 47
Total Completed = 8 + 9 + 12 + 10 = 39
Overall Productivity = (39 / 47) × 100 = 82.98% ≈ 83%
```

---

## 2. UTILIZATION Calculation

### Formula
```
Utilization % = (Planned Hours / Available Hours) × 100
```

### What it measures:
- **Utilization** shows what percentage of available working time is allocated to planned tasks
- It answers: "How much of my team's time is already committed?"
- **Available Hours** = Number of employees × 40 hours/week (or custom available hours per employee)

### Example 1: Single Employee

**Scenario:**
- Employee: John
- Available Hours per Week: 40 hours (standard full-time)
- Week: 2024-W45

**Tasks Assigned:**
- Task 1: 8 hours (due this week)
- Task 2: 12 hours (due this week)
- Task 3: 15 hours (due this week)
- Task 4: 5 hours (due this week)

**Calculation:**
```
Total Planned Hours = 8 + 12 + 15 + 5 = 40 hours
Total Available Hours = 40 hours
Utilization = (40 / 40) × 100 = 100%
```

**Meaning:** John's time is 100% utilized - all 40 hours are planned for tasks.

---

### Example 2: Underutilization

**Scenario:**
- Employee: Sarah
- Available Hours per Week: 40 hours
- Week: 2024-W45

**Tasks Assigned:**
- Task 1: 10 hours
- Task 2: 8 hours
- Task 3: 5 hours

**Calculation:**
```
Total Planned Hours = 10 + 8 + 5 = 23 hours
Total Available Hours = 40 hours
Utilization = (23 / 40) × 100 = 57.5%
```

**Meaning:** Sarah is only 57.5% utilized - she has 17 hours of free capacity this week.

---

### Example 3: Overutilization (Over 100%)

**Scenario:**
- Employee: Mike
- Available Hours per Week: 40 hours
- Week: 2024-W45

**Tasks Assigned:**
- Task 1: 15 hours
- Task 2: 20 hours
- Task 3: 12 hours

**Calculation:**
```
Total Planned Hours = 15 + 20 + 12 = 47 hours
Total Available Hours = 40 hours
Utilization = (47 / 40) × 100 = 117.5%
```

**Meaning:** Mike is overutilized by 17.5% - he has 7 more hours of work planned than he has available time. This is a **workload warning**!

---

### Example 4: Team Utilization

**Scenario:**
- Team: 3 employees
- Week: 2024-W45

**Employee Details:**
- **John**: 40 hours available, 35 hours planned → 35/40 = 87.5%
- **Sarah**: 40 hours available, 40 hours planned → 40/40 = 100%
- **Mike**: 40 hours available, 45 hours planned → 45/40 = 112.5%

**Team Utilization Calculation:**
```
Total Planned Hours = 35 + 40 + 45 = 120 hours
Total Available Hours = 40 + 40 + 40 = 120 hours
Team Utilization = (120 / 120) × 100 = 100%
```

**Note:** Even though individual utilization varies (87.5%, 100%, 112.5%), the team as a whole is at 100% utilization.

---

## 3. Real-World Combined Example

### Scenario: Project "E-Commerce Platform" - Week 2024-W45

**Team Members:**
1. **John (Developer)**
   - Available: 40 hours/week
   - Tasks: 5 tasks, 35 hours planned
   - Status: 4 completed, 1 in progress

2. **Sarah (Designer)**
   - Available: 40 hours/week
   - Tasks: 3 tasks, 28 hours planned
   - Status: 2 completed, 1 to do

3. **Mike (QA Engineer)**
   - Available: 40 hours/week
   - Tasks: 6 tasks, 42 hours planned
   - Status: 5 completed, 1 blocked

---

### Productivity Calculation:

**Step 1: Individual Productivity**
- John: 4/5 = 80%
- Sarah: 2/3 = 66.67%
- Mike: 5/6 = 83.33%

**Step 2: Team Productivity**
```
Total Tasks = 5 + 3 + 6 = 14
Completed Tasks = 4 + 2 + 5 = 11
Team Productivity = (11 / 14) × 100 = 78.57% ≈ 79%
```

---

### Utilization Calculation:

**Step 1: Individual Utilization**
- John: (35 / 40) × 100 = 87.5%
- Sarah: (28 / 40) × 100 = 70%
- Mike: (42 / 40) × 100 = 105% ⚠️ (Overutilized!)

**Step 2: Team Utilization**
```
Total Planned Hours = 35 + 28 + 42 = 105 hours
Total Available Hours = 40 + 40 + 40 = 120 hours
Team Utilization = (105 / 120) × 100 = 87.5%
```

---

## 4. Key Differences

| Aspect | Productivity | Utilization |
|--------|-------------|-------------|
| **What it measures** | Task completion rate | Time allocation rate |
| **Formula** | (Completed / Total) × 100 | (Planned Hours / Available Hours) × 100 |
| **Can exceed 100%?** | No (max 100%) | Yes (indicates overutilization) |
| **What it tells you** | How many tasks are done | How much time is committed |
| **Use case** | Track progress | Track capacity/workload |

---

## 5. Interpreting the Metrics

### Productivity Interpretation:

- **0-50%**: Low productivity - many tasks incomplete
- **50-75%**: Moderate productivity - room for improvement
- **75-90%**: Good productivity - most tasks completed
- **90-100%**: Excellent productivity - nearly all tasks done

### Utilization Interpretation:

- **0-70%**: Underutilized - team has free capacity
- **70-90%**: Well-utilized - good balance
- **90-100%**: Fully utilized - all time allocated
- **>100%**: Overutilized - workload exceeds capacity (⚠️ Warning!)

---

## 6. How They Work Together

**Ideal Scenario:**
- **High Productivity (80-100%)** + **Good Utilization (70-90%)** = Efficient team working at optimal capacity

**Warning Scenarios:**
- **Low Productivity (<50%)** + **High Utilization (>100%)** = Team is overloaded and struggling
- **High Productivity (90%+)** + **Low Utilization (<50%)** = Team is efficient but underutilized (could take more work)

**Example:**
- Productivity: 85% (good - most tasks completed)
- Utilization: 110% (bad - overutilized by 10%)
- **Conclusion:** Team is working efficiently but is overloaded. Consider redistributing work or adding resources.

---

## 7. How It's Calculated in the System

### Backend Process:

1. **Group by Week**: All tasks are grouped by ISO week format (YYYY-Www)
2. **For Each Week**:
   - Count total tasks and completed tasks → Calculate Productivity
   - Sum planned hours and available hours → Calculate Utilization
3. **Aggregate**: Calculate overall metrics across all weeks

### Data Sources:

- **Tasks Table**: `planned_hours`, `actual_hours`, `status`, `due_date`, `assignee_id`
- **Users Table**: `available_hours_per_week`
- **Filters Applied**: Project, Employee, Date Range

---

## 8. Practical Example Walkthrough

Let's trace through a complete example:

### Week: 2024-W45 (November 4-10, 2024)

**Employee: John (ID: 1)**
- Available Hours: 40 hours/week
- Tasks:
  1. "Fix login bug" - 8h planned, Status: completed
  2. "Add payment feature" - 15h planned, Status: completed
  3. "Update API docs" - 5h planned, Status: in_progress
  4. "Code review" - 4h planned, Status: completed
  5. "Team meeting" - 2h planned, Status: completed

**Step-by-Step Calculation:**

**Productivity:**
```
Total Tasks = 5
Completed Tasks = 4 (tasks 1, 2, 4, 5)
Productivity = (4 / 5) × 100 = 80%
```

**Utilization:**
```
Total Planned Hours = 8 + 15 + 5 + 4 + 2 = 34 hours
Available Hours = 40 hours
Utilization = (34 / 40) × 100 = 85%
```

**Result:**
- ✅ **Productivity: 80%** - Good! 4 out of 5 tasks completed
- ✅ **Utilization: 85%** - Well-utilized! 34 out of 40 hours planned, 6 hours free capacity

---

This system helps managers:
- **Track progress** (Productivity)
- **Manage workload** (Utilization)
- **Identify bottlenecks** (Low productivity + High utilization)
- **Optimize resource allocation** (Balance utilization across team)

