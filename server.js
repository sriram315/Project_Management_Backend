const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Project Management API",
      version: "1.0.0",
      description: "API documentation for Project Management System",
      contact: {
        name: "API Support",
        email: "support@example.com",
      },
    },
    servers: [
      {
        url: "http://72.60.101.240/:5005",
        description: "Development server",
      },
    ],
    components: {
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "integer" },
            username: { type: "string" },
            password: { type: "string" },
            role: {
              type: "string",
              enum: ["admin", "manager", "team_lead", "employee"],
            },
            email: { type: "string", format: "email" },
            available_hours_per_week: { type: "integer", default: 40 },
          },
        },
        Project: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            description: { type: "string" },
            budget: { type: "number" },
            estimated_hours: { type: "integer" },
            start_date: { type: "string", format: "date" },
            end_date: { type: "string", format: "date" },
            status: {
              type: "string",
              enum: ["active", "completed", "on_hold", "cancelled"],
            },
            progress: { type: "integer", minimum: 0, maximum: 100 },
          },
        },
        Task: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            description: { type: "string" },
            assignee_id: { type: "integer" },
            project_id: { type: "integer" },
            planned_hours: { type: "number" },
            actual_hours: { type: "number" },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "urgent"],
            },
            task_type: { type: "string" },
            due_date: { type: "string", format: "date" },
            status: {
              type: "string",
              enum: ["todo", "in_progress", "completed", "blocked"],
            },
            attachments: { type: "string" },
          },
        },
        TeamMember: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            role: { type: "string" },
            email: { type: "string", format: "email" },
            available_hours_per_week: { type: "integer" },
            status: { type: "string", enum: ["online", "offline", "busy"] },
            projects: { type: "string" },
            allocated_hours: { type: "integer" },
          },
        },
        Error: {
          type: "object",
          properties: {
            message: { type: "string" },
            error: { type: "string" },
          },
        },
      },
    },
  },
  apis: ["./server.js"], // Path to the API files
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Swagger UI setup
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Project Management API Documentation",
  })
);

// Database connection pool
const pool = mysql.createPool({
  host: "217.21.90.204",
  user: "u635298195_pmp",
  password: ">1BC/=Nf1",
  database: "u635298195_pmp",
  port: 3306,
  charset: "utf8mb4", // Support for all Unicode characters including emojis
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
});

// Test connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error("Database connection failed:", err.message);
    console.log("Using mock data fallback...");
  } else {
    console.log("Successfully connected to MySQL database!");
    connection.release();
  }
});

// Test route
/**
 * @swagger
 * /api/test:
 *   get:
 *     summary: Test API endpoint
 *     description: Simple test endpoint to verify the API is working
 *     tags: [Test]
 *     responses:
 *       200:
 *         description: API is working
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Backend is working!"
 */
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend is working!" });
});

// User Routes
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user with username and password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: "john_doe"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 username:
 *                   type: string
 *                 role:
 *                   type: string
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Database error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;

  const query = "SELECT * FROM users WHERE username = ? AND password = ?";

  pool.execute(query, [username, password], (err, results) => {
    if (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({
      id: results[0].id,
      username: results[0].username,
      role: results[0].role,
    });
  });
});

// Get all users
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     description: Retrieve a list of all users in the system
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       500:
 *         description: Database error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get("/api/users", (req, res) => {
  const query = "SELECT * FROM users ORDER BY username";

  pool.execute(query, (err, results) => {
    if (err) {
      console.error("Users fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Add new user
/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create a new user
 *     description: Add a new user to the system
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *               - role
 *               - email
 *             properties:
 *               username:
 *                 type: string
 *                 example: "john_doe"
 *               password:
 *                 type: string
 *                 example: "password123"
 *               role:
 *                 type: string
 *                 enum: [admin, manager, team_lead, employee]
 *                 example: "employee"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john@example.com"
 *               available_hours_per_week:
 *                 type: integer
 *                 default: 40
 *                 example: 40
 *     responses:
 *       200:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Database error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post("/api/users", (req, res) => {
  const { username, password, role, email, available_hours_per_week } =
    req.body;

  // First, check if username or email already exists
  const checkQuery =
    "SELECT id, username, email FROM users WHERE username = ? OR email = ?";

  pool.execute(checkQuery, [username, email], (checkErr, checkResults) => {
    if (checkErr) {
      console.error("Duplicate check error:", checkErr);
      return res
        .status(500)
        .json({ message: "Database error while checking duplicates" });
    }

    // Check for duplicate username
    const duplicateUsername = checkResults.find(
      (user) => user.username === username
    );
    if (duplicateUsername) {
      return res.status(400).json({
        message: `Username "${username}" already exists. Please use a different username.`,
        field: "username",
        type: "duplicate_username",
      });
    }

    // Check for duplicate email
    const duplicateEmail = checkResults.find((user) => user.email === email);
    if (duplicateEmail) {
      return res.status(400).json({
        message: `Email "${email}" already exists. Please use a different email address.`,
        field: "email",
        type: "duplicate_email",
      });
    }

    // If no duplicates, proceed with insert
    const insertQuery =
      "INSERT INTO users (username, password, role, email, available_hours_per_week) VALUES (?, ?, ?, ?, ?)";

    pool.execute(
      insertQuery,
      [username, password, role, email, available_hours_per_week || 40],
      (err, results) => {
        if (err) {
          console.error("Add user error:", err);

          // Handle duplicate key errors as fallback
          if (err.code === "ER_DUP_ENTRY") {
            if (err.sqlMessage.includes("username")) {
              return res.status(400).json({
                message: `Username "${username}" already exists. Please use a different username.`,
                field: "username",
                type: "duplicate_username",
              });
            } else if (err.sqlMessage.includes("email")) {
              return res.status(400).json({
                message: `Email "${email}" already exists. Please use a different email address.`,
                field: "email",
                type: "duplicate_email",
              });
            }
          }

          return res.status(500).json({
            message: "Failed to create user. Please try again.",
            error: err.message,
          });
        }

        res.json({
          id: results.insertId,
          message: "User created successfully",
          username: username,
        });
      }
    );
  });
});

// Update user
/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user
 *     description: Update an existing user's information
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: "john_doe_updated"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.updated@example.com"
 *               role:
 *                 type: string
 *                 enum: [admin, manager, team_lead, employee]
 *                 example: "team_lead"
 *               available_hours_per_week:
 *                 type: integer
 *                 example: 35
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       500:
 *         description: Database error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.put("/api/users/:id", (req, res) => {
  const { id } = req.params;
  const { username, email, role, available_hours_per_week } = req.body;

  // First, check if email already exists for a different user
  const checkEmailQuery = "SELECT id FROM users WHERE email = ? AND id != ?";

  pool.execute(checkEmailQuery, [email, id], (checkErr, checkResults) => {
    if (checkErr) {
      console.error("Email check error:", checkErr);
      return res.status(500).json({ message: "Database error" });
    }

    if (checkResults.length > 0) {
      return res.status(400).json({
        message: "Email already exists. Please use a different email address.",
        field: "email",
      });
    }

    // If email is unique or unchanged, proceed with update
    const updateQuery =
      "UPDATE users SET username = ?, email = ?, role = ?, available_hours_per_week = ? WHERE id = ?";

    pool.execute(
      updateQuery,
      [username, email, role, available_hours_per_week || 40, id],
      (err, results) => {
        if (err) {
          console.error("Update user error:", err);
          // Check if it's a duplicate key error for email
          if (err.code === "ER_DUP_ENTRY" && err.sqlMessage.includes("email")) {
            return res.status(400).json({
              message:
                "Email already exists. Please use a different email address.",
              field: "email",
            });
          }
          return res.status(500).json({ message: "Database error" });
        }
        res.json({ message: "User updated successfully" });
      }
    );
  });
});

// Delete user
/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete user
 *     description: Delete a user from the system
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       500:
 *         description: Database error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// app.delete("/api/users/:id", (req, res) => {
//   const { id } = req.params;

//   const query = "DELETE FROM users WHERE id = ?";

//   pool.execute(query, [id], (err, results) => {
//     if (err) {
//       console.error("Delete user error:", err);
//       return res.status(500).json({ message: "Database error" });
//     }
//     res.json({ message: "User deleted successfully" });
//   });
// });

// Delete project (with related cleanup)
app.delete("/api/projects/:id", (req, res) => {
  const { id } = req.params;

  // Queries for cleanup
  const deleteTasksQuery = "DELETE FROM tasks WHERE project_id = ?";
  const deleteTeamMembersQuery =
    "DELETE FROM project_team_members WHERE project_id = ?";
  const deleteProjectQuery = "DELETE FROM projects WHERE id = ?";

  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Connection error:", err);
      return res.status(500).json({ message: "Database connection error" });
    }

    // Start a transaction to keep consistency
    connection.beginTransaction((err) => {
      if (err) {
        connection.release();
        console.error("Transaction error:", err);
        return res.status(500).json({ message: "Transaction error" });
      }

      // Step 1: Delete related tasks
      connection.query(deleteTasksQuery, [id], (err) => {
        if (err) {
          return connection.rollback(() => {
            connection.release();
            console.error("Delete tasks error:", err);
            res.status(500).json({ message: "Failed to delete project tasks" });
          });
        }

        // Step 2: Delete team members
        connection.query(deleteTeamMembersQuery, [id], (err) => {
          if (err) {
            return connection.rollback(() => {
              connection.release();
              console.error("Delete team members error:", err);
              res
                .status(500)
                .json({ message: "Failed to delete project team members" });
            });
          }

          // Step 3: Delete the project itself
          connection.query(deleteProjectQuery, [id], (err) => {
            if (err) {
              return connection.rollback(() => {
                connection.release();
                console.error("Delete project error:", err);
                res.status(500).json({ message: "Failed to delete project" });
              });
            }

            // Commit all deletions
            connection.commit((err) => {
              if (err) {
                return connection.rollback(() => {
                  connection.release();
                  console.error("Commit error:", err);
                  res
                    .status(500)
                    .json({ message: "Failed to finalize deletion" });
                });
              }

              connection.release();
              res.json({
                message: "Project and all related data deleted successfully",
              });
            });
          });
        });
      });
    });
  });
});

// Team Routes - Get all team members (now using users table directly)
/**
 * @swagger
 * /api/team:
 *   get:
 *     summary: Get all team members
 *     description: Retrieve a list of all team members with their project assignments and workload information
 *     tags: [Team]
 *     responses:
 *       200:
 *         description: List of team members retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TeamMember'
 *       500:
 *         description: Database error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get("/api/team", (req, res) => {
  const query = `
        SELECT 
            u.id,
            u.username as name,
            u.role,
            u.email,
            u.available_hours_per_week,
            'online' as status,
            GROUP_CONCAT(DISTINCT p.name) as projects,
            COALESCE(SUM(ptm.allocated_hours_per_week), 0) as allocated_hours
        FROM users u
        LEFT JOIN project_team_members ptm ON u.id = ptm.user_id
        LEFT JOIN projects p ON ptm.project_id = p.id
        WHERE u.role IN ('employee', 'team_lead', 'manager')
        GROUP BY u.id
        ORDER BY u.username
    `;

  pool.execute(query, (err, results) => {
    if (err) {
      console.error("Team fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Add new team member (now creates user directly)
app.post("/api/team", (req, res) => {
  const { username, password, role, email, available_hours_per_week } =
    req.body;

  const query =
    "INSERT INTO users (username, password, role, email, available_hours_per_week) VALUES (?, ?, ?, ?, ?)";

  pool.execute(
    query,
    [username, password, role, email, available_hours_per_week || 40],
    (err, results) => {
      if (err) {
        console.error("Add team member error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json({
        id: results.insertId,
        message: "Team member added successfully",
      });
    }
  );
});

// Project Routes - Get all projects
/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects
 *     description: Retrieve a list of all projects in the system
 *     tags: [Projects]
 *     responses:
 *       200:
 *         description: List of projects retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Project'
 *       500:
 *         description: Database error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get("/api/projects", (req, res) => {
  const query = "SELECT * FROM projects ORDER BY name";

  pool.execute(query, (err, results) => {
    if (err) {
      console.error("Projects fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Add new project
/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     description: Add a new project to the system
 *     tags: [Projects]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Website Redesign"
 *               description:
 *                 type: string
 *                 example: "Complete redesign of company website"
 *               budget:
 *                 type: number
 *                 example: 50000
 *               estimated_hours:
 *                 type: integer
 *                 example: 200
 *               start_date:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-01"
 *               end_date:
 *                 type: string
 *                 format: date
 *                 example: "2024-06-30"
 *               status:
 *                 type: string
 *                 enum: [active, completed, on_hold, cancelled]
 *                 default: active
 *                 example: "active"
 *     responses:
 *       200:
 *         description: Project created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Database error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post("/api/projects", (req, res) => {
  const {
    name,
    description,
    budget,
    estimated_hours,
    start_date,
    end_date,
    status,
  } = req.body;

  // Validate required fields
  if (!name) {
    return res.status(400).json({ message: "Project name is required" });
  }

  const query =
    "INSERT INTO projects (name, description, budget, estimated_hours, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)";

  pool.execute(
    query,
    [
      name,
      description,
      budget,
      estimated_hours,
      start_date,
      end_date,
      status || "active",
    ],
    (err, results) => {
      if (err) {
        console.error("Add project error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json({ id: results.insertId, message: "Project added successfully" });
    }
  );
});

// Update project
app.put("/api/projects/:id", (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  // Build dynamic query based on provided fields
  const fields = [];
  const values = [];

  const allowedFields = [
    "name",
    "description",
    "budget",
    "estimated_hours",
    "start_date",
    "end_date",
    "status",
    "team_lead_id",
    "progress",
  ];

  for (const [key, value] of Object.entries(updateData)) {
    if (allowedFields.includes(key) && value !== undefined) {
      fields.push(`${key} = ?`);
      // Handle empty date strings - convert to NULL for database
      if ((key === "start_date" || key === "end_date") && value === "") {
        values.push(null);
      } else {
        values.push(value);
      }
    }
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: "No valid fields to update" });
  }

  values.push(id); // Add ID for WHERE clause

  const query = `UPDATE projects SET ${fields.join(", ")} WHERE id = ?`;

  console.log("Update query:", query);
  console.log("Update values:", values);

  pool.execute(query, values, (err, results) => {
    if (err) {
      console.error("Update project error:", err);
      console.error("Query:", query);
      console.error("Values:", values);
      return res.status(500).json({ message: "Database error" });
    }
    res.json({ message: "Project updated successfully" });
  });
});

// Delete project
app.delete("/api/projects/:id", (req, res) => {
  const { id } = req.params;

  const query = "DELETE FROM projects WHERE id = ?";

  pool.execute(query, [id], (err, results) => {
    if (err) {
      console.error("Delete project error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json({ message: "Project deleted successfully" });
  });
});

// Get projects assigned to a specific user
app.get("/api/users/:userId/projects", (req, res) => {
  const { userId } = req.params;

  const query = `
        SELECT DISTINCT
            p.*,
            ptm.allocated_hours_per_week,
            u.username as team_member_name,
            u.role as team_member_role
        FROM projects p
        JOIN project_team_members ptm ON p.id = ptm.project_id
        JOIN users u ON ptm.user_id = u.id
        WHERE u.id = ?
        ORDER BY p.name
    `;

  pool.execute(query, [userId], (err, results) => {
    if (err) {
      console.error("User projects fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Get project details for a specific user (including available hours and tasks)
app.get("/api/users/:userId/projects/:projectId", (req, res) => {
  const { userId, projectId } = req.params;

  const query = `
        SELECT 
            p.*,
            ptm.allocated_hours_per_week,
            u.username as team_member_name,
            u.role as team_member_role,
            u.available_hours_per_week as available_hours,
            (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.assignee_id = u.id) as task_count,
            (SELECT SUM(t.planned_hours) FROM tasks t WHERE t.project_id = p.id AND t.assignee_id = u.id) as total_planned_hours,
            (SELECT SUM(t.actual_hours) FROM tasks t WHERE t.project_id = p.id AND t.assignee_id = u.id) as total_actual_hours
        FROM projects p
        JOIN project_team_members ptm ON p.id = ptm.project_id
        JOIN users u ON ptm.user_id = u.id
        WHERE u.id = ? AND p.id = ?
    `;

  pool.execute(query, [userId, projectId], (err, results) => {
    if (err) {
      console.error("User project details fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (results.length === 0) {
      return res
        .status(404)
        .json({ message: "Project not found or not assigned to user" });
    }
    res.json(results[0]);
  });
});

// Get tasks assigned to a specific user
app.get("/api/users/:userId/tasks", (req, res) => {
  const { userId } = req.params;

  const query = `
        SELECT 
            t.*,
            u.username as assignee_name,
            p.name as project_name
        FROM tasks t
        JOIN users u ON t.assignee_id = u.id
        JOIN projects p ON t.project_id = p.id
        WHERE u.id = ?
        ORDER BY t.created_at DESC
    `;

  pool.execute(query, [userId], (err, results) => {
    if (err) {
      console.error("User tasks fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Get tasks for a specific project assigned to a specific user
app.get("/api/users/:userId/projects/:projectId/tasks", (req, res) => {
  const { userId, projectId } = req.params;

  const query = `
        SELECT 
            t.*,
            u.username as assignee_name,
            p.name as project_name
        FROM tasks t
        JOIN users u ON t.assignee_id = u.id
        JOIN projects p ON t.project_id = p.id
        WHERE u.id = ? AND t.project_id = ?
        ORDER BY t.created_at DESC
    `;

  pool.execute(query, [userId, projectId], (err, results) => {
    if (err) {
      console.error("User project tasks fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Project Team Member Routes
// Get team members for a specific project
app.get("/api/projects/:id/team", (req, res) => {
  const { id } = req.params;

  const query = `
        SELECT 
            ptm.*,
            u.username as team_member_name,
            u.role as team_member_role,
            u.username,
            u.email
        FROM project_team_members ptm
        JOIN users u ON ptm.user_id = u.id
        WHERE ptm.project_id = ?
        ORDER BY u.username
    `;

  pool.execute(query, [id], (err, results) => {
    if (err) {
      console.error("Project team fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Add team member to project
app.post("/api/projects/:id/team", (req, res) => {
  const { id } = req.params;
  const { user_id, allocated_hours_per_week } = req.body;

  if (!user_id || !allocated_hours_per_week) {
    return res
      .status(400)
      .json({ message: "User ID and allocated hours are required" });
  }

  // Check if user exists
  const checkUserQuery = "SELECT id FROM users WHERE id = ?";

  pool.execute(checkUserQuery, [user_id], (err, results) => {
    if (err) {
      console.error("Check user error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length === 0) {
      return res.status(400).json({ message: "User not found" });
    }

    // Check if user is already assigned to this project
    const checkExistingQuery =
      "SELECT id FROM project_team_members WHERE project_id = ? AND user_id = ?";

    pool.execute(checkExistingQuery, [id, user_id], (err, existingResults) => {
      if (err) {
        console.error("Check existing assignment error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (existingResults.length > 0) {
        return res
          .status(400)
          .json({ message: "User is already assigned to this project" });
      }

      // Add user to project
      const addToProjectQuery =
        "INSERT INTO project_team_members (project_id, user_id, allocated_hours_per_week) VALUES (?, ?, ?)";

      pool.execute(
        addToProjectQuery,
        [id, user_id, allocated_hours_per_week],
        (err, projectResults) => {
          if (err) {
            console.error("Add user to project error:", err);
            return res.status(500).json({ message: "Database error" });
          }
          res.json({
            id: projectResults.insertId,
            message: "User added to project successfully",
          });
        }
      );
    });
  });
});

// Remove team member from project
app.delete("/api/projects/:projectId/team/:userId", (req, res) => {
  const { projectId, userId } = req.params;

  const query =
    "DELETE FROM project_team_members WHERE project_id = ? AND user_id = ?";

  pool.execute(query, [projectId, userId], (err, results) => {
    if (err) {
      console.error("Remove team member from project error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json({ message: "Team member removed from project successfully" });
  });
});

// Update team member hours
app.put("/api/projects/:projectId/team/:userId", (req, res) => {
  const { projectId, userId } = req.params;
  const { allocated_hours_per_week } = req.body;

  if (!allocated_hours_per_week) {
    return res
      .status(400)
      .json({ message: "Allocated hours per week is required" });
  }

  const query =
    "UPDATE project_team_members SET allocated_hours_per_week = ? WHERE project_id = ? AND user_id = ?";

  pool.execute(
    query,
    [allocated_hours_per_week, projectId, userId],
    (err, results) => {
      if (err) {
        console.error("Update team member hours error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (results.affectedRows === 0) {
        return res
          .status(404)
          .json({ message: "Team member not found in project" });
      }

      res.json({ message: "Team member hours updated successfully" });
    }
  );
});

// Get available users (not assigned to this project as team members)
app.get("/api/projects/:id/available-team", (req, res) => {
  const { id } = req.params;

  const query = `
        SELECT 
            u.id as user_id,
            u.username,
            u.email,
            u.role,
            u.available_hours_per_week
        FROM users u
        WHERE u.id NOT IN (
            SELECT user_id 
            FROM project_team_members ptm
            WHERE ptm.project_id = ?
        )
        ORDER BY u.username
    `;

  pool.execute(query, [id], (err, results) => {
    if (err) {
      console.error("Available team fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Task Routes - Get all tasks
/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Get all tasks
 *     description: Retrieve a list of all tasks in the system
 *     tags: [Tasks]
 *     responses:
 *       200:
 *         description: List of tasks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 *       500:
 *         description: Database error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get("/api/tasks", (req, res) => {
  const query = `
        SELECT 
            t.*,
            u.username as assignee_name,
            p.name as project_name
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id = u.id
        LEFT JOIN projects p ON t.project_id = p.id
        ORDER BY t.created_at DESC
    `;

  pool.execute(query, (err, results) => {
    if (err) {
      console.error("Tasks fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Get tasks by project
app.get("/api/tasks/project/:projectId", (req, res) => {
  const { projectId } = req.params;
  const query = `
        SELECT 
            t.*,
            u.username as assignee_name,
            p.name as project_name
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id = u.id
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.project_id = ?
        ORDER BY t.created_at DESC
    `;

  pool.execute(query, [projectId], (err, results) => {
    if (err) {
      console.error("Project tasks fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Get tasks by assignee
app.get("/api/tasks/assignee/:assigneeId", (req, res) => {
  const { assigneeId } = req.params;
  const query = `
        SELECT 
            t.*,
            u.username as assignee_name,
            p.name as project_name
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id = u.id
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.assignee_id = ?
        ORDER BY t.created_at DESC
    `;

  pool.execute(query, [assigneeId], (err, results) => {
    if (err) {
      console.error("Assignee tasks fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Add new task
/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create a new task
 *     description: Add a new task to the system
 *     tags: [Tasks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - assignee_id
 *               - project_id
 *               - planned_hours
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Design homepage layout"
 *               description:
 *                 type: string
 *                 example: "Create wireframes and mockups for homepage"
 *               assignee_id:
 *                 type: integer
 *                 example: 1
 *               project_id:
 *                 type: integer
 *                 example: 1
 *               planned_hours:
 *                 type: number
 *                 example: 8
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, urgent]
 *                 default: medium
 *                 example: "high"
 *               task_type:
 *                 type: string
 *                 example: "design"
 *               due_date:
 *                 type: string
 *                 format: date
 *                 example: "2024-02-15"
 *               attachments:
 *                 type: string
 *                 example: "design_brief.pdf"
 *               status:
 *                 type: string
 *                 enum: [todo, in_progress, completed, blocked]
 *                 default: todo
 *                 example: "todo"
 *     responses:
 *       200:
 *         description: Task created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 message:
 *                   type: string
 *       500:
 *         description: Database error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post("/api/tasks", (req, res) => {
  const {
    name,
    description,
    assignee_id,
    project_id,
    planned_hours,
    priority,
    task_type,
    due_date,
    attachments,
    status = "todo",
    // Workload tracking fields
    workload_warning_level = "none",
    workload_warnings = null,
    utilization_percentage = 0,
    allocation_utilization = 0,
    weeks_until_due = 0,
    current_task_count = 0,
    total_workload_hours = 0,
    available_hours = 0,
    allocated_hours = 0,
  } = req.body;

  // Ensure all undefined values are converted to null
  const safeDescription = description || null;
  const safePriority = priority || "medium";
  const safeTaskType = task_type || "development";
  const safeDueDate = due_date || null;
  const safeAttachments = attachments || null;
  const safeWorkloadWarnings = workload_warnings || null;

  const query = `
        INSERT INTO tasks (
            name, description, assignee_id, project_id, planned_hours, 
            priority, task_type, due_date, attachments, status,
            workload_warning_level, workload_warnings, utilization_percentage,
            allocation_utilization, weeks_until_due, current_task_count,
            total_workload_hours, available_hours, allocated_hours
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

  pool.execute(
    query,
    [
      name,
      safeDescription,
      assignee_id,
      project_id,
      planned_hours,
      safePriority,
      safeTaskType,
      safeDueDate,
      safeAttachments,
      status,
      workload_warning_level,
      safeWorkloadWarnings,
      utilization_percentage,
      allocation_utilization,
      weeks_until_due,
      current_task_count,
      total_workload_hours,
      available_hours,
      allocated_hours,
    ],
    (err, results) => {
      if (err) {
        console.error("Add task error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json({ id: results.insertId, message: "Task added successfully" });
    }
  );
});

// Update task
app.put("/api/tasks/:id", (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  // Build dynamic query based on provided fields
  const fields = [];
  const values = [];

  const allowedFields = [
    "name",
    "description",
    "status",
    "priority",
    "assignee_id",
    "project_id",
    "planned_hours",
    "actual_hours",
    "task_type",
    "due_date",
    "attachments",
    "work_description",
    "productivity_rating",
  ];

  for (const [key, value] of Object.entries(updateData)) {
    if (allowedFields.includes(key) && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) {
    return res.status(400).json({ message: "No valid fields to update" });
  }

  values.push(id); // Add ID for WHERE clause

  const query = `UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`;

  pool.execute(query, values, (err, results) => {
    if (err) {
      console.error("Update task error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json({ message: "Task updated successfully" });
  });
});

// Delete task
app.delete("/api/tasks/:id", (req, res) => {
  const { id } = req.params;
  const query = "DELETE FROM tasks WHERE id = ?";

  pool.execute(query, [id], (err, results) => {
    if (err) {
      console.error("Delete task error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json({ message: "Task deleted successfully" });
  });
});

// Metrics Route - Simple metrics for now
/**
 * @swagger
 * /api/metrics:
 *   get:
 *     summary: Get system metrics
 *     description: Retrieve basic system metrics including productivity and utilization
 *     tags: [Metrics]
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_available_hours:
 *                   type: integer
 *                   example: 400
 *                 total_planned_hours:
 *                   type: integer
 *                   example: 180
 *                 productivity:
 *                   type: integer
 *                   example: 87
 *                 utilization:
 *                   type: integer
 *                   example: 75
 */
app.get("/api/metrics", (req, res) => {
  const metrics = {
    total_available_hours: 400, // Will calculate dynamically later
    total_planned_hours: 180,
    productivity: 87,
    utilization: 75,
  };
  res.json(metrics);
});

// Dashboard API endpoints
/**
 * @swagger
 * /api/dashboard/data:
 *   get:
 *     summary: Get dashboard data
 *     description: Retrieve dashboard data including utilization, productivity, and availability charts
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project ID (use 'all' for all projects)
 *       - in: query
 *         name: employeeId
 *         schema:
 *           type: string
 *         description: Filter by employee ID (use 'all' for all employees)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 utilizationData:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       week:
 *                         type: string
 *                       utilization:
 *                         type: number
 *                       completed:
 *                         type: integer
 *                       hours:
 *                         type: number
 *                       availableHours:
 *                         type: number
 *                 productivityData:
 *                   type: array
 *                   items:
 *                     type: object
 *                 availabilityData:
 *                   type: array
 *                   items:
 *                     type: object
 */
// app.get("/api/dashboard/data", (req, res) => {
//   try {
//     const { projectId, employeeId, startDate, endDate } = req.query;

//     console.log("Dashboard data request:", {
//       projectId,
//       employeeId,
//       startDate,
//       endDate,
//     });

//     // Build dynamic query based on filters - apply ALL filters
//     let whereConditions = [];
//     let queryParams = [];

//     // Filter by project
//     if (projectId && projectId !== "all") {
//       whereConditions.push("t.project_id = ?");
//       queryParams.push(projectId);
//     }

//     // Filter by employee
//     if (employeeId && employeeId !== "all") {
//       whereConditions.push("t.assignee_id = ?");
//       queryParams.push(employeeId);
//     }

//     // Filter by date range - use due_date for proper week grouping
//     if (startDate) {
//       whereConditions.push("DATE(t.due_date) >= ?");
//       queryParams.push(startDate);
//     }

//     if (endDate) {
//       whereConditions.push("DATE(t.due_date) <= ?");
//       queryParams.push(endDate);
//     }

//     const whereClause =
//       whereConditions.length > 0
//         ? `WHERE ${whereConditions.join(" AND ")}`
//         : "";

//     // Get utilization data: (planned hours / available hours per week) * 100
//     // For each employee per week: sum planned hours, get their available_hours_per_week
//     // Then calculate utilization percentage per employee and sum across all employees
//     const utilizationQuery = `
//       SELECT
//         week,
//         SUM(planned_hours) as planned_hours,
//         SUM(user_available_hours) as available_hours,
//         ROUND((SUM(planned_hours) / NULLIF(SUM(user_available_hours), 0)) * 100, 1) as utilization_percentage
//       FROM (
//         SELECT
//           DATE_FORMAT(t.due_date, '%Y-W%u') as week,
//           t.assignee_id,
//           SUM(t.planned_hours) as planned_hours,
//           MAX(u.available_hours_per_week) as user_available_hours
//         FROM tasks t
//         JOIN users u ON t.assignee_id = u.id
//         ${whereClause}
//         GROUP BY DATE_FORMAT(t.due_date, '%Y-W%u'), t.assignee_id
//       ) as employee_utilization
//       GROUP BY week
//       ORDER BY week ASC
//     `;

//     // Get productivity data: completed tasks, actual hours, and productivity percentage
//     // Productivity % = (actual_hours / planned_hours) * 100
//     // Group by week within the date range
//     const productivityQuery = `
//       SELECT
//         DATE_FORMAT(t.due_date, '%Y-W%u') as week,
//         COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
//         SUM(t.actual_hours) as actual_hours,
//         SUM(t.planned_hours) as planned_hours,
//         ROUND((SUM(t.actual_hours) / NULLIF(SUM(t.planned_hours), 0)) * 100, 1) as productivity_percentage
//       FROM tasks t
//       JOIN users u ON t.assignee_id = u.id
//       ${whereClause}
//       GROUP BY DATE_FORMAT(t.due_date, '%Y-W%u')
//       ORDER BY week ASC
//     `;

//     // Get availability data: For each employee per week
//     // available_hours_per_week from users table - sum of all planned_hours for that week
//     const availabilityQuery = `
//       SELECT
//         week,
//         SUM(user_available_hours - total_planned_hours) as available_hours
//       FROM (
//         SELECT
//           DATE_FORMAT(t.due_date, '%Y-W%u') as week,
//           t.assignee_id,
//           MAX(u.available_hours_per_week) as user_available_hours,
//           SUM(t.planned_hours) as total_planned_hours
//         FROM tasks t
//         JOIN users u ON t.assignee_id = u.id
//         ${whereClause}
//         GROUP BY DATE_FORMAT(t.due_date, '%Y-W%u'), t.assignee_id
//       ) as employee_weekly_hours
//       GROUP BY week
//       ORDER BY week ASC
//     `;

//     // Execute all queries
//     pool.execute(utilizationQuery, queryParams, (err, utilizationRows) => {
//       if (err) {
//         console.error("Utilization query error:", err);
//         return res
//           .status(500)
//           .json({ error: "Database error", details: err.message });
//       }

//       pool.execute(productivityQuery, queryParams, (err, productivityRows) => {
//         if (err) {
//           console.error("Productivity query error:", err);
//           return res
//             .status(500)
//             .json({ error: "Database error", details: err.message });
//         }

//         pool.execute(
//           availabilityQuery,
//           queryParams,
//           (err, availabilityRows) => {
//             if (err) {
//               console.error("Availability query error:", err);
//               return res
//                 .status(500)
//                 .json({ error: "Database error", details: err.message });
//             }

//             console.log("Utilization rows:", utilizationRows.length);
//             console.log("Productivity rows:", productivityRows.length);
//             console.log("Availability rows:", availabilityRows.length);

//             // Format data for charts
//             const utilizationData = utilizationRows.map((row) => ({
//               week: row.week,
//               utilization: parseFloat(row.utilization_percentage) || 0,
//               completed: 0, // Will be filled from productivity data
//               hours: 0, // Will be filled from productivity data
//               availableHours: parseInt(row.available_hours) || 0,
//             }));

//             const productivityData = productivityRows.map((row) => ({
//               week: row.week,
//               utilization: 0, // Will be filled from utilization data
//               completed: parseInt(row.completed_tasks) || 0,
//               hours: parseFloat(row.actual_hours) || 0,
//               productivity: parseFloat(row.productivity_percentage) || 0,
//               plannedHours: parseFloat(row.planned_hours) || 0,
//               availableHours: 0, // Will be filled from availability data
//             }));

//             const availabilityData = availabilityRows.map((row) => ({
//               week: row.week,
//               utilization: 0, // Will be filled from utilization data
//               completed: 0, // Will be filled from productivity data
//               hours: 0, // Will be filled from productivity data
//               availableHours: parseInt(row.available_hours) || 0,
//             }));

//             // Merge data to ensure all charts have complete data
//             const allWeeks = new Set([
//               ...utilizationData.map((d) => d.week),
//               ...productivityData.map((d) => d.week),
//               ...availabilityData.map((d) => d.week),
//             ]);

//             const mergedData = Array.from(allWeeks)
//               .map((week) => {
//                 const util = utilizationData.find((d) => d.week === week) || {
//                   utilization: 0,
//                   availableHours: 0,
//                 };
//                 const prod = productivityData.find((d) => d.week === week) || {
//                   completed: 0,
//                   hours: 0,
//                   productivity: 0,
//                   plannedHours: 0,
//                 };
//                 const avail = availabilityData.find((d) => d.week === week) || {
//                   availableHours: 0,
//                 };

//                 return {
//                   week,
//                   utilization: util.utilization,
//                   completed: prod.completed,
//                   hours: prod.hours,
//                   productivity: prod.productivity,
//                   plannedHours: prod.plannedHours,
//                   availableHours: avail.availableHours, // Use only the correct availability calculation
//                 };
//               })
//               .sort((a, b) => a.week.localeCompare(b.week));

//             console.log(
//               "Merged data weeks:",
//               mergedData.map((d) => d.week)
//             );

//             res.json({
//               utilizationData: mergedData,
//               productivityData: mergedData,
//               availabilityData: mergedData,
//             });
//           }
//         );
//       });
//     });
//   } catch (error) {
//     console.error("Dashboard data error:", error);
//     res.json({
//       utilizationData: [],
//       productivityData: [],
//       availabilityData: [],
//     });
//   }
// });

app.get("/api/dashboard/data", (req, res) => {
  try {
    const { projectId, employeeId, startDate, endDate } = req.query;

    console.log("Dashboard data request:", {
      projectId,
      employeeId,
      startDate,
      endDate,
    });

    let whereConditions = [];
    let queryParams = [];

    if (projectId && projectId !== "all") {
      whereConditions.push("t.project_id = ?");
      queryParams.push(projectId);
    }

    if (employeeId && employeeId !== "all") {
      whereConditions.push("t.assignee_id = ?");
      queryParams.push(employeeId);
    }

    if (startDate) {
      whereConditions.push("DATE(t.due_date) >= ?");
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push("DATE(t.due_date) <= ?");
      queryParams.push(endDate);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // ✅ Utilization Query
    const utilizationQuery = `
      SELECT 
        week,
        SUM(planned_hours) as planned_hours,
        SUM(user_available_hours) as available_hours,
        ROUND((SUM(planned_hours) / NULLIF(SUM(user_available_hours), 0)) * 100, 1) as utilization_percentage
      FROM (
        SELECT 
          DATE_FORMAT(t.due_date, '%Y-W%u') as week,
          t.assignee_id,
          SUM(t.planned_hours) as planned_hours,
          MAX(u.available_hours_per_week) as user_available_hours
        FROM tasks t
        JOIN users u ON t.assignee_id = u.id
        ${whereClause}
        GROUP BY DATE_FORMAT(t.due_date, '%Y-W%u'), t.assignee_id
      ) as employee_utilization
      GROUP BY week
      ORDER BY week ASC
    `;

    // ✅ Productivity Query
    const productivityQuery = `
      SELECT 
        DATE_FORMAT(t.due_date, '%Y-W%u') as week,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
        SUM(t.actual_hours) as actual_hours,
        SUM(t.planned_hours) as planned_hours,
        ROUND((SUM(t.actual_hours) / NULLIF(SUM(t.planned_hours), 0)) * 100, 1) as productivity_percentage
      FROM tasks t
      JOIN users u ON t.assignee_id = u.id
      ${whereClause}
      GROUP BY DATE_FORMAT(t.due_date, '%Y-W%u')
      ORDER BY week ASC
    `;

    // ✅ Availability Query
    const availabilityQuery = `
      SELECT 
        week,
        SUM(GREATEST(user_available_hours - total_planned_hours, 0)) as available_hours
      FROM (
        SELECT 
          DATE_FORMAT(t.due_date, '%Y-W%u') as week,
          t.assignee_id,
          MAX(u.available_hours_per_week) as user_available_hours,
          SUM(t.planned_hours) as total_planned_hours
        FROM tasks t
        JOIN users u ON t.assignee_id = u.id
        ${whereClause}
        GROUP BY DATE_FORMAT(t.due_date, '%Y-W%u'), t.assignee_id
      ) as employee_weekly_hours
      GROUP BY week
      ORDER BY week ASC
    `;

    // Execute all queries
    pool.execute(utilizationQuery, queryParams, (err, utilizationRows) => {
      if (err) {
        console.error("Utilization query error:", err);
        return res
          .status(500)
          .json({ error: "Database error", details: err.message });
      }

      pool.execute(productivityQuery, queryParams, (err, productivityRows) => {
        if (err) {
          console.error("Productivity query error:", err);
          return res
            .status(500)
            .json({ error: "Database error", details: err.message });
        }

        pool.execute(
          availabilityQuery,
          queryParams,
          (err, availabilityRows) => {
            if (err) {
              console.error("Availability query error:", err);
              return res
                .status(500)
                .json({ error: "Database error", details: err.message });
            }

            console.log("Utilization rows:", utilizationRows.length);
            console.log("Productivity rows:", productivityRows.length);
            console.log("Availability rows:", availabilityRows.length);

            // ✅ Format individual datasets
            const utilizationData = utilizationRows.map((row) => ({
              week: row.week,
              utilization: parseFloat(row.utilization_percentage) || 0,
              availableHours: parseInt(row.available_hours) || 0,
            }));

            const productivityData = productivityRows.map((row) => ({
              week: row.week,
              completed: parseInt(row.completed_tasks) || 0,
              hours: parseFloat(row.actual_hours) || 0,
              productivity: parseFloat(row.productivity_percentage) || 0,
              plannedHours: parseFloat(row.planned_hours) || 0,
            }));

            const availabilityData = availabilityRows.map((row) => ({
              week: row.week,
              availableHours: parseInt(row.available_hours) || 0,
            }));

            // ✅ Generate all weeks in range (fill missing)
            function generateWeekRange(start, end) {
              const result = [];
              const startDateObj = new Date(start);
              const endDateObj = new Date(end);

              const curr = new Date(startDateObj);
              curr.setDate(curr.getDate() - curr.getDay() + 1);

              while (curr <= endDateObj) {
                const year = curr.getFullYear();
                const week = getWeekNumber(curr);
                result.push(`${year}-W${week.toString().padStart(2, "0")}`);
                curr.setDate(curr.getDate() + 7);
              }

              return result;
            }

            function getWeekNumber(d) {
              d = new Date(
                Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
              );
              const dayNum = d.getUTCDay() || 7;
              d.setUTCDate(d.getUTCDate() + 4 - dayNum);
              const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
              return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
            }

            const allWeeks =
              startDate && endDate
                ? generateWeekRange(startDate, endDate)
                : Array.from(
                    new Set([
                      ...utilizationData.map((d) => d.week),
                      ...productivityData.map((d) => d.week),
                      ...availabilityData.map((d) => d.week),
                    ])
                  );

            // ✅ Merge all datasets ensuring full week coverage
            const mergedData = allWeeks.map((week) => {
              const util = utilizationData.find((d) => d.week === week) || {
                utilization: 0,
                availableHours: 0,
              };
              const prod = productivityData.find((d) => d.week === week) || {
                completed: 0,
                hours: 0,
                productivity: 0,
                plannedHours: 0,
              };
              const avail = availabilityData.find((d) => d.week === week) || {
                availableHours: 0,
              };

              return {
                week,
                utilization: util.utilization,
                completed: prod.completed,
                hours: prod.hours,
                productivity: prod.productivity,
                plannedHours: prod.plannedHours,
                availableHours:
                  avail.availableHours || util.availableHours || 0,
              };
            });

            console.log(
              "Merged data weeks:",
              mergedData.map((d) => d.week)
            );

            res.json({
              utilizationData: mergedData,
              productivityData: mergedData,
              availabilityData: mergedData,
            });
          }
        );
      });
    });
  } catch (error) {
    console.error("Dashboard data error:", error);
    res.json({
      utilizationData: [],
      productivityData: [],
      availabilityData: [],
    });
  }
});

// Get projects for filter dropdown
app.get("/api/dashboard/projects", (req, res) => {
  const query = "SELECT id, name, status FROM projects ORDER BY name";

  pool.execute(query, (err, results) => {
    if (err) {
      console.error("Projects filter error:", err);
      return res.status(500).json({ error: "Failed to fetch projects" });
    }
    res.json(results);
  });
});

// Get employees for filter dropdown
app.get("/api/dashboard/employees", (req, res) => {
  const query =
    "SELECT id, username, email, role, available_hours_per_week FROM users ORDER BY username";

  pool.execute(query, (err, results) => {
    if (err) {
      console.error("Employees filter error:", err);
      return res.status(500).json({ error: "Failed to fetch employees" });
    }
    res.json(results);
  });
});

// Get task status distribution for pie chart
app.get("/api/dashboard/task-status", (req, res) => {
  const { projectId, employeeId, startDate, endDate } = req.query;

  console.log("Task status request with filters:", {
    projectId,
    employeeId,
    startDate,
    endDate,
  });

  // Build dynamic query based on filters - using due_date for consistency
  let whereConditions = [];
  let queryParams = [];

  if (projectId && projectId !== "all") {
    whereConditions.push("project_id = ?");
    queryParams.push(projectId);
  }

  if (employeeId && employeeId !== "all") {
    whereConditions.push("assignee_id = ?");
    queryParams.push(employeeId);
  }

  // Use due_date for consistency with other dashboard queries
  if (startDate) {
    whereConditions.push("DATE(due_date) >= ?");
    queryParams.push(startDate);
  }

  if (endDate) {
    whereConditions.push("DATE(due_date) <= ?");
    queryParams.push(endDate);
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const query = `
    SELECT 
      status,
      COUNT(*) as count
    FROM tasks 
    ${whereClause}
    GROUP BY status
  `;

  console.log("Executing task status query:", query);
  console.log("Query params:", queryParams);

  pool.execute(query, queryParams, (err, results) => {
    if (err) {
      console.error("Task status error:", err);
      return res
        .status(500)
        .json({ error: "Failed to fetch task status data" });
    }

    console.log("Task status raw results:", results);

    // Convert array to object format
    const statusData = {
      todo: 0,
      in_progress: 0,
      completed: 0,
      blocked: 0,
    };

    results.forEach((row) => {
      if (statusData.hasOwnProperty(row.status)) {
        statusData[row.status] = row.count;
      }
    });

    // Calculate totals for logging
    const totalTasks =
      statusData.todo +
      statusData.in_progress +
      statusData.completed +
      statusData.blocked;
    console.log("Task status response:", { ...statusData, totalTasks });

    res.json(statusData);
  });
});

// Role-aware tasks timeline for dashboard (this week and next week)
/**
 * @swagger
 * /api/dashboard/tasks-timeline:
 *   get:
 *     summary: Get tasks grouped for this week and next week
 *     description: Returns simplified task cards for dashboard based on user role and filters
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, manager, team_lead, employee]
 *         description: Role of current user
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *         description: Current user id (required for employee/team_lead)
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Optional project filter
 *       - in: query
 *         name: employeeId
 *         schema:
 *           type: string
 *         description: Optional employee filter (overrides role restriction if provided)
 *     responses:
 *       200:
 *         description: Tasks grouped by week
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 thisWeek:
 *                   type: array
 *                   items:
 *                     type: object
 *                 nextWeek:
 *                   type: array
 *                   items:
 *                     type: object
 */
app.get("/api/dashboard/tasks-timeline", (req, res) => {
  try {
    const { role, userId, projectId, employeeId } = req.query;

    // Base conditions
    const conditions = [];
    const params = [];

    // Role restriction: employees and team_leads only see own tasks unless employeeId provided
    if (employeeId && employeeId !== "all") {
      conditions.push("t.assignee_id = ?");
      params.push(employeeId);
    } else if (role === "employee" || role === "team_lead") {
      conditions.push("t.assignee_id = ?");
      params.push(userId);
    }

    if (projectId && projectId !== "all") {
      conditions.push("t.project_id = ?");
      params.push(projectId);
    }

    const baseWhere = conditions.length
      ? `AND ${conditions.join(" AND ")}`
      : "";

    // Helper to build query for a given week offset (0 = this week, 1 = next week)
    const buildQuery = (weekOffset) => `
      SELECT 
        t.id,
        t.name as title,
        u.username as assignee,
        t.status,
        COALESCE(t.planned_hours, 0) AS estimated,
        COALESCE(t.actual_hours, 0) AS logged
      FROM tasks t
      JOIN users u ON u.id = t.assignee_id
      WHERE YEARWEEK(t.due_date, 1) = YEARWEEK(DATE_ADD(CURDATE(), INTERVAL ${weekOffset} WEEK), 1)
      ${baseWhere}
      ORDER BY t.due_date ASC, t.created_at DESC
    `;

    pool.execute(buildQuery(0), params, (err, thisRows) => {
      if (err) {
        console.error("Tasks timeline (this week) error:", err);
        return res.status(500).json({ error: "Database error" });
      }
      pool.execute(buildQuery(1), params, (err2, nextRows) => {
        if (err2) {
          console.error("Tasks timeline (next week) error:", err2);
          return res.status(500).json({ error: "Database error" });
        }

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
          thisWeek: thisRows.map(mapRow),
          nextWeek: nextRows.map(mapRow),
        });
      });
    });
  } catch (e) {
    console.error("Tasks timeline error:", e);
    res.status(500).json({ error: "Failed to fetch tasks timeline" });
  }
});

// Check workload validation for task assignment
/**
 * @swagger
 * /api/tasks/validate-workload:
 *   post:
 *     summary: Validate task workload
 *     description: Check if assigning a task would overload an employee based on their current workload and availability
 *     tags: [Tasks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assignee_id
 *               - project_id
 *               - planned_hours
 *               - due_date
 *             properties:
 *               assignee_id:
 *                 type: integer
 *                 example: 1
 *               project_id:
 *                 type: integer
 *                 example: 1
 *               planned_hours:
 *                 type: number
 *                 example: 8
 *               due_date:
 *                 type: string
 *                 format: date
 *                 example: "2024-02-15"
 *     responses:
 *       200:
 *         description: Workload validation completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isValid:
 *                   type: boolean
 *                 warningLevel:
 *                   type: string
 *                   enum: [none, high, critical]
 *                 warnings:
 *                   type: array
 *                   items:
 *                     type: string
 *                 workload:
 *                   type: object
 *                   properties:
 *                     currentHours:
 *                       type: number
 *                     newTaskHours:
 *                       type: number
 *                     totalHours:
 *                       type: number
 *                     availableHours:
 *                       type: number
 *                     utilizationPercentage:
 *                       type: number
 *                     weeksUntilDue:
 *                       type: integer
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Employee not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Database error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post("/api/tasks/validate-workload", (req, res) => {
  const { assignee_id, project_id, planned_hours, due_date } = req.body;

  if (!assignee_id || !project_id || !planned_hours || !due_date) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Get employee's available hours per week
  pool.execute(
    `
    SELECT available_hours_per_week FROM users WHERE id = ?
  `,
    [assignee_id],
    (err, userRows) => {
      if (err) {
        console.error("User query error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (userRows.length === 0) {
        return res.status(404).json({ error: "Employee not found" });
      }

      const availableHoursPerWeek =
        parseFloat(userRows[0].available_hours_per_week) || 40;

      // Calculate weeks between now and due date
      const dueDate = new Date(due_date);
      const today = new Date();
      const weeksUntilDue = Math.ceil(
        (dueDate - today) / (7 * 24 * 60 * 60 * 1000)
      );

      // Get current workload for this employee in the SAME WEEK as the new task
      // Calculate the week of the new task using MySQL DATE_FORMAT
      pool.execute(
        `
      SELECT 
        SUM(planned_hours) as total_planned_hours,
        COUNT(*) as task_count
      FROM tasks 
      WHERE assignee_id = ? 
        AND status IN ('todo', 'in_progress')
        AND DATE_FORMAT(due_date, '%Y-W%u') = DATE_FORMAT(?, '%Y-W%u')
    `,
        [assignee_id, due_date],
        (err, workloadRows) => {
          if (err) {
            console.error("Workload query error:", err);
            return res.status(500).json({ error: "Database error" });
          }

          const currentWorkload =
            parseFloat(workloadRows[0].total_planned_hours) || 0;
          const currentTaskCount = parseInt(workloadRows[0].task_count) || 0;

          // Calculate total workload including new task
          const totalWorkload = currentWorkload + parseFloat(planned_hours);

          // Calculate available capacity for the week
          // Total capacity per week
          const totalCapacityPerWeek = availableHoursPerWeek;

          // Remaining available hours (like dashboard calculation)
          const remainingAvailableHours = Math.max(
            0,
            availableHoursPerWeek - currentWorkload
          );

          const utilizationPercentage =
            (totalWorkload / totalCapacityPerWeek) * 100;

          // Get project allocation for this employee
          pool.execute(
            `
        SELECT allocated_hours_per_week 
        FROM project_team_members 
        WHERE project_id = ? AND user_id = ?
      `,
            [project_id, assignee_id],
            (err, allocationRows) => {
              if (err) {
                console.error("Allocation query error:", err);
                return res.status(500).json({ error: "Database error" });
              }

              const allocatedHoursPerWeek =
                allocationRows.length > 0
                  ? parseFloat(allocationRows[0].allocated_hours_per_week) || 0
                  : 0;
              const totalAllocatedHours = allocatedHoursPerWeek * weeksUntilDue;
              const allocationUtilization =
                totalAllocatedHours > 0
                  ? (totalWorkload / totalAllocatedHours) * 100
                  : 0;

              // Determine warning level
              let warningLevel = "none";
              let warnings = [];

              if (utilizationPercentage > 100) {
                warningLevel = "critical";
                warnings.push(
                  `Employee will be overloaded by ${Math.round(
                    utilizationPercentage - 100
                  )}%`
                );
              } else if (utilizationPercentage > 80) {
                warningLevel = "high";
                warnings.push(
                  `Employee utilization will be ${Math.round(
                    utilizationPercentage
                  )}%`
                );
              }

              if (allocationUtilization > 100) {
                warningLevel = "critical";
                warnings.push(
                  `Project allocation exceeded by ${Math.round(
                    allocationUtilization - 100
                  )}%`
                );
              } else if (allocationUtilization > 80) {
                if (warningLevel === "none") warningLevel = "high";
                warnings.push(
                  `Project allocation utilization: ${Math.round(
                    allocationUtilization
                  )}%`
                );
              }

              if (weeksUntilDue < 1) {
                warningLevel = "critical";
                // warnings.push("Due date is in the past or today");
              } //else if (weeksUntilDue < 2) {
              //   if (warningLevel === "none") warningLevel = "high";
              //   warnings.push("Due date is very soon");
              // }

              res.json({
                isValid: true,
                warningLevel,
                warnings,
                workload: {
                  currentHours: currentWorkload,
                  newTaskHours: planned_hours,
                  totalHours: totalWorkload,
                  availableHours: remainingAvailableHours,
                  utilizationPercentage: Math.round(utilizationPercentage),
                  allocatedHours: totalAllocatedHours,
                  allocationUtilization: Math.round(allocationUtilization),
                  weeksUntilDue,
                  currentTaskCount,
                },
              });
            }
          );
        }
      );
    }
  );
});

// Debug endpoint for availability calculation
app.get("/api/debug/availability", (req, res) => {
  const { projectId, employeeId } = req.query;

  let whereConditions = [];
  let queryParams = [];

  if (projectId && projectId !== "all") {
    whereConditions.push("t.project_id = ?");
    queryParams.push(projectId);
  }

  if (employeeId && employeeId !== "all") {
    whereConditions.push("t.assignee_id = ?");
    queryParams.push(employeeId);
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const debugQuery = `
    SELECT 
      DATE_FORMAT(t.due_date, '%Y-W%u') as week,
      t.assignee_id,
      u.username,
      MAX(u.available_hours_per_week) as user_available_hours,
      SUM(t.planned_hours) as total_planned_hours,
      GREATEST(MAX(u.available_hours_per_week) - SUM(t.planned_hours), 0) as available_hours
    FROM tasks t
    JOIN users u ON t.assignee_id = u.id
    ${whereClause}
    GROUP BY DATE_FORMAT(t.due_date, '%Y-W%u'), t.assignee_id
    ORDER BY week ASC, u.username ASC
  `;

  pool.execute(debugQuery, queryParams, (err, results) => {
    if (err) {
      console.error("Debug query error:", err);
      return res
        .status(500)
        .json({ error: "Database error", details: err.message });
    }
    res.json(results);
  });
});

// Debug endpoint for workload validation
app.post("/api/tasks/debug-workload", async (req, res) => {
  try {
    console.log("Debug workload validation called");
    const { assignee_id, project_id, planned_hours, due_date } = req.body;
    console.log("Request body:", {
      assignee_id,
      project_id,
      planned_hours,
      due_date,
    });

    if (!assignee_id || !project_id || !planned_hours || !due_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get employee's available hours per week
    const [userRows] = await pool.execute(
      `
      SELECT available_hours_per_week FROM users WHERE id = ?
    `,
      [assignee_id]
    );

    console.log("User rows:", userRows);

    if (userRows.length === 0) {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.json({ message: "Debug successful", userRows });
  } catch (error) {
    console.error("Debug workload validation error:", error);
    res.status(500).json({
      error: "Failed to debug workload validation",
      details: error.message,
    });
  }
});

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, "../frontend/build")));

const PORT = process.env.PORT || 5005;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
