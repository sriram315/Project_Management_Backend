const express = require("express");
const cors = require("cors");
const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const pool = require("./config/db"); // Database config from centralized location

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

// Database connection pool is imported from config/db.js

// Create password_resets table if not exists (for OTP storage)
pool.execute(
  `CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    otp VARCHAR(10) NOT NULL,
    expires_at DATETIME NOT NULL,
    used TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX(user_id),
    CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  (tableErr) => {
    if (tableErr) {
      console.error("Failed to ensure password_resets table:", tableErr.message);
    } else {
      console.log("password_resets table is ready");
    }
  }
);

// Create task_reminders table if not exists (to track sent reminders)
pool.execute(
  `CREATE TABLE IF NOT EXISTS task_reminders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    reminder_type ENUM('before_due', 'overdue') NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX(task_id),
    INDEX(reminder_type),
    CONSTRAINT fk_task_reminders_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE KEY unique_task_reminder (task_id, reminder_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  (tableErr) => {
    if (tableErr) {
      console.error("Failed to ensure task_reminders table:", tableErr.message);
    } else {
      console.log("task_reminders table is ready");
    }
  }
);

// Configure nodemailer transporter for Gmail SMTP (dummy placeholders)
const GMAIL_USER = "itsupport@ifocussystec.com";
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: "pzfx dmhd mxmn vxdj",
  },
});

// Generate a random password that meets requirements: 8-15 chars, 1 upper, 1 lower, 1 special
function generateRandomPassword() {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*()_+-=[]{}|;:'\",.<>?`~";
  
  // Ensure at least one of each required character
  let password = uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest randomly (total length 12-15)
  const allChars = uppercase + lowercase + numbers + special;
  const length = 8 + Math.floor(Math.random() * 8); // 8-15 characters
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

async function sendPasswordEmail(toEmail, username, password) {
  try {
    console.log(`Attempting to send password reset email to: ${toEmail}`);
    const info = await transporter.sendMail({
      from: `"Project Management System" <${GMAIL_USER}>`,
      to: toEmail,
      replyTo: GMAIL_USER,
      subject: "Your New Password - Project Management System",
      text: `Hello ${username},\n\nYour password has been reset. Your new password is: ${password}\n\nPlease use this password to log in. For security, we recommend changing your password after logging in.\n\nIf you did not request this, please contact support immediately.`,
      html: `<p>Hello <b>${username}</b>,</p><p>Your password has been reset. Your new password is: <b style="font-size:18px; color:#2563eb;">${password}</b></p><p>Please use this password to log in. For security, we recommend changing your password after logging in.</p><p>If you did not request this, please contact support immediately.</p>`,
    });
    console.log("Password reset email sent successfully:", info.messageId);
    console.log("Email response:", JSON.stringify(info, null, 2));
    return true;
  } catch (e) {
    console.error("Failed to send password email - Error details:", {
      message: e.message,
      code: e.code,
      response: e.response,
      stack: e.stack
    });
    return false;
  }
}

// Send task reminder email
async function sendTaskReminderEmail(toEmail, username, taskName, projectName, dueDate, isOverdue = false) {
  try {
    const subject = isOverdue 
      ? `⚠️ Task Overdue: ${taskName} - Project Management System`
      : `📋 Task Reminder: ${taskName} Due Tomorrow - Project Management System`;
    
    const dueDateStr = new Date(dueDate).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    const textContent = isOverdue
      ? `Hello ${username},\n\nThis is a reminder that your task "${taskName}" in project "${projectName}" is now OVERDUE.\n\nDue Date: ${dueDateStr}\n\nPlease complete this task as soon as possible.\n\nIf you have any questions, please contact your project manager.\n\nBest regards,\nProject Management System`
      : `Hello ${username},\n\nThis is a reminder that your task "${taskName}" in project "${projectName}" is due TOMORROW.\n\nDue Date: ${dueDateStr}\n\nPlease ensure you complete this task on time.\n\nIf you have any questions, please contact your project manager.\n\nBest regards,\nProject Management System`;
    
    const htmlContent = isOverdue
      ? `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">⚠️ Task Overdue Reminder</h2>
          <p>Hello <b>${username}</b>,</p>
          <p>This is a reminder that your task <b>"${taskName}"</b> in project <b>"${projectName}"</b> is now <span style="color: #dc2626; font-weight: bold;">OVERDUE</span>.</p>
          <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 12px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Due Date:</strong> ${dueDateStr}</p>
          </div>
          <p>Please complete this task as soon as possible.</p>
          <p>If you have any questions, please contact your project manager.</p>
          <p style="margin-top: 30px;">Best regards,<br>Project Management System</p>
        </div>`
      : `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">📋 Task Reminder</h2>
          <p>Hello <b>${username}</b>,</p>
          <p>This is a reminder that your task <b>"${taskName}"</b> in project <b>"${projectName}"</b> is due <span style="color: #2563eb; font-weight: bold;">TOMORROW</span>.</p>
          <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 12px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Due Date:</strong> ${dueDateStr}</p>
          </div>
          <p>Please ensure you complete this task on time.</p>
          <p>If you have any questions, please contact your project manager.</p>
          <p style="margin-top: 30px;">Best regards,<br>Project Management System</p>
        </div>`;
    
    const info = await transporter.sendMail({
      from: `"Project Management System" <${GMAIL_USER}>`,
      to: toEmail,
      replyTo: GMAIL_USER,
      subject: subject,
      text: textContent,
      html: htmlContent,
    });
    console.log(`Task reminder email sent successfully to ${toEmail}:`, info.messageId);
    return true;
  } catch (e) {
    console.error(`Failed to send task reminder email to ${toEmail} - Error details:`, {
      message: e.message,
      code: e.code,
      response: e.response,
    });
    return false;
  }
}

// Check and send reminders for tasks due in 1 day
async function checkAndSendBeforeDueReminders() {
  try {
    console.log("Checking for tasks due in 1 day...");
    
    // Get tasks due tomorrow (status must not be completed)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const query = `
      SELECT 
        t.id,
        t.name,
        t.due_date,
        t.status,
        t.assignee_id,
        u.username,
        u.email,
        p.name as project_name
      FROM tasks t
      INNER JOIN users u ON t.assignee_id = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE DATE(t.due_date) = ?
        AND t.status NOT IN ('completed')
        AND t.due_date IS NOT NULL
        AND u.email IS NOT NULL
        AND u.email != ''
        AND NOT EXISTS (
          SELECT 1 FROM task_reminders tr
          WHERE tr.task_id = t.id AND tr.reminder_type = 'before_due'
        )
    `;
    
    pool.execute(query, [tomorrowStr], async (err, results) => {
      if (err) {
        console.error("Error checking tasks due in 1 day:", err);
        return;
      }
      
      if (!results || results.length === 0) {
        console.log("No tasks found due in 1 day that need reminders.");
        return;
      }
      
      console.log(`Found ${results.length} task(s) due in 1 day. Sending reminders...`);
      
      for (const task of results) {
        const emailSent = await sendTaskReminderEmail(
          task.email,
          task.username,
          task.name,
          task.project_name || 'Unassigned Project',
          task.due_date,
          false
        );
        
        if (emailSent) {
          // Record the reminder in the database
          const insertQuery = `
            INSERT INTO task_reminders (task_id, reminder_type)
            VALUES (?, 'before_due')
            ON DUPLICATE KEY UPDATE sent_at = CURRENT_TIMESTAMP
          `;
          pool.execute(insertQuery, [task.id], (insertErr) => {
            if (insertErr) {
              console.error(`Failed to record reminder for task ${task.id}:`, insertErr);
            } else {
              console.log(`Reminder recorded for task ${task.id} (before_due)`);
            }
          });
        }
      }
      
      console.log(`Completed sending reminders for tasks due in 1 day.`);
    });
  } catch (error) {
    console.error("Error in checkAndSendBeforeDueReminders:", error);
  }
}

// Check and send reminders for overdue tasks
async function checkAndSendOverdueReminders() {
  try {
    console.log("Checking for overdue tasks...");
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    // Get overdue tasks (status must not be completed, due_date < today)
    const query = `
      SELECT 
        t.id,
        t.name,
        t.due_date,
        t.status,
        t.assignee_id,
        u.username,
        u.email,
        p.name as project_name
      FROM tasks t
      INNER JOIN users u ON t.assignee_id = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE DATE(t.due_date) < ?
        AND t.status NOT IN ('completed')
        AND t.due_date IS NOT NULL
        AND u.email IS NOT NULL
        AND u.email != ''
        AND NOT EXISTS (
          SELECT 1 FROM task_reminders tr
          WHERE tr.task_id = t.id AND tr.reminder_type = 'overdue'
        )
    `;
    
    pool.execute(query, [todayStr], async (err, results) => {
      if (err) {
        console.error("Error checking overdue tasks:", err);
        return;
      }
      
      if (!results || results.length === 0) {
        console.log("No overdue tasks found that need reminders.");
        return;
      }
      
      console.log(`Found ${results.length} overdue task(s). Sending reminders...`);
      
      for (const task of results) {
        const emailSent = await sendTaskReminderEmail(
          task.email,
          task.username,
          task.name,
          task.project_name || 'Unassigned Project',
          task.due_date,
          true
        );
        
        if (emailSent) {
          // Record the reminder in the database
          const insertQuery = `
            INSERT INTO task_reminders (task_id, reminder_type)
            VALUES (?, 'overdue')
            ON DUPLICATE KEY UPDATE sent_at = CURRENT_TIMESTAMP
          `;
          pool.execute(insertQuery, [task.id], (insertErr) => {
            if (insertErr) {
              console.error(`Failed to record overdue reminder for task ${task.id}:`, insertErr);
            } else {
              console.log(`Overdue reminder recorded for task ${task.id}`);
            }
          });
        }
      }
      
      console.log(`Completed sending reminders for overdue tasks.`);
    });
  } catch (error) {
    console.error("Error in checkAndSendOverdueReminders:", error);
  }
}

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
  // Unified login: match by email OR username with one query, avoid multiple DB calls
  try {
    const { email, username, password } = req.body || {};
    const identifier = email || username;
    if (!identifier || !password) {
      return res.status(400).json({ message: "Email/Username and password are required" });
    }

    const query =
      "SELECT id, username, role FROM users WHERE (email = ? OR username = ?) AND password = ? LIMIT 1";
    pool.execute(query, [identifier, identifier, password], (err, rows) => {
      if (err) {
        console.error("Login DB error:", { code: err.code, message: err.message });
        return res.status(500).json({ message: "Database error" });
      }
      if (rows && rows.length > 0) {
        return res.status(200).json({
          id: rows[0].id,
          username: rows[0].username,
          role: rows[0].role,
        });
      }
      return res.status(401).json({ message: "Invalid credentials" });
    });
  } catch (e) {
    console.error("Login unexpected error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// Password reset - generate random password, update in DB, and email it to user
app.post("/api/auth/forgot/start", (req, res) => {
  const { username, email } = req.body || {};
  const identifier = username || email;

  console.log(`Password reset requested for identifier: ${identifier}`);

  if (!identifier) {
    return res.status(400).json({ message: "Email/Username is required" });
  }

  // Find user by email or username
  const findUserQuery = "SELECT id, username, email FROM users WHERE email = ? OR username = ?";
  pool.execute(findUserQuery, [identifier, identifier], async (err, rows) => {
    if (err) {
      console.error("Forgot start - user lookup error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (!rows || rows.length === 0) {
      console.log(`User not found for identifier: ${identifier}`);
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];
    console.log(`User found: ${user.username} (ID: ${user.id}), Email: ${user.email}`);
    
    if (!user.email) {
      console.error(`User ${user.username} (ID: ${user.id}) has no email address`);
      return res.status(400).json({ message: "User email not available" });
    }

    // Generate random password
    const newPassword = generateRandomPassword();
    console.log(`Generated new password for user ${user.username}`);

    // Update password in database
    const updatePasswordQuery = "UPDATE users SET password = ? WHERE id = ?";
    pool.execute(updatePasswordQuery, [newPassword, user.id], async (updErr) => {
      if (updErr) {
        console.error("Forgot start - password update error:", updErr);
        return res.status(500).json({ message: "Failed to reset password" });
      }

      console.log(`Password updated in database for user ${user.username}`);

      // Send password via email
      const sent = await sendPasswordEmail(user.email, user.username, newPassword);
      if (!sent) {
        console.error(`Failed to send password email to ${user.email}`);
        return res.status(500).json({ message: "Failed to send password email. Please contact support." });
      }

      console.log(`Password reset completed successfully for user ${user.username}`);
      return res.json({ message: "New password sent to registered email" });
    });
  });
});

// Verify OTP validity
app.post("/api/auth/forgot/verify", (req, res) => {
  const { username, otp } = req.body || {};

  if (!username || !otp) {
    return res.status(400).json({ message: "Username and OTP are required" });
  }

  const findUserQuery = "SELECT id FROM users WHERE username = ?";
  pool.execute(findUserQuery, [username], (err, rows) => {
    if (err) {
      console.error("Forgot verify - user lookup error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const userId = rows[0].id;

    const checkOtpQuery =
      "SELECT id, expires_at, used FROM password_resets WHERE user_id = ? AND otp = ? ORDER BY created_at DESC LIMIT 1";
    pool.execute(checkOtpQuery, [userId, otp], (otpErr, otpRows) => {
      if (otpErr) {
        console.error("Forgot verify - otp lookup error:", otpErr);
        return res.status(500).json({ message: "Database error" });
      }
      if (!otpRows || otpRows.length === 0) {
        return res.status(400).json({ message: "Invalid OTP" });
      }

      const record = otpRows[0];
      const isUsed = !!record.used;
      const isExpired = new Date(record.expires_at) < new Date();
      if (isUsed || isExpired) {
        return res.status(400).json({ message: isUsed ? "OTP already used" : "OTP expired" });
      }

      return res.json({ message: "OTP verified" });
    });
  });
});

// Reset password using verified OTP
app.post("/api/auth/forgot/reset", (req, res) => {
  const { username, otp, newPassword } = req.body || {};

  if (!username || !otp || !newPassword) {
    return res
      .status(400)
      .json({ message: "Username, OTP and newPassword are required" });
  }

  // Basic password policy: 8-15 chars, at least 1 upper, 1 lower, 1 special
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-={}\[\]|;:'",.<>\/?`~]).{8,15}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({
      message:
        "Password must be 8-15 characters, include at least one uppercase, one lowercase, and one special character",
    });
  }

  const findUserQuery = "SELECT id FROM users WHERE username = ?";
  pool.execute(findUserQuery, [username], (err, rows) => {
    if (err) {
      console.error("Forgot reset - user lookup error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const userId = rows[0].id;

    const checkOtpQuery =
      "SELECT id, expires_at, used FROM password_resets WHERE user_id = ? AND otp = ? ORDER BY created_at DESC LIMIT 1";
    pool.execute(checkOtpQuery, [userId, otp], (otpErr, otpRows) => {
      if (otpErr) {
        console.error("Forgot reset - otp lookup error:", otpErr);
        return res.status(500).json({ message: "Database error" });
      }
      if (!otpRows || otpRows.length === 0) {
        return res.status(400).json({ message: "Invalid OTP" });
      }

      const record = otpRows[0];
      const isUsed = !!record.used;
      const isExpired = new Date(record.expires_at) < new Date();
      if (isUsed || isExpired) {
        return res.status(400).json({ message: isUsed ? "OTP already used" : "OTP expired" });
      }

      const updatePasswordQuery = "UPDATE users SET password = ? WHERE id = ?";
      pool.execute(updatePasswordQuery, [newPassword, userId], (updErr) => {
        if (updErr) {
          console.error("Forgot reset - update password error:", updErr);
          return res.status(500).json({ message: "Failed to update password" });
        }

        const markUsedQuery = "UPDATE password_resets SET used = 1 WHERE id = ?";
        pool.execute(markUsedQuery, [record.id], (markErr) => {
          if (markErr) {
            console.error("Forgot reset - mark used error:", markErr);
            // Not fatal
          }
          return res.json({ message: "Password updated successfully" });
        });
      });
    });
  });
});

// Change password with current password verification (user-chosen new password)
/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change password (requires current password)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, currentPassword, newPassword]
 *             properties:
 *               userId:
 *                 type: integer
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Current password incorrect
 *       500:
 *         description: Server error
 */
app.post("/api/auth/change-password", (req, res) => {
  const { userId, currentPassword, newPassword } = req.body || {};

  if (!userId || !currentPassword || !newPassword) {
    return res.status(400).json({ message: "userId, currentPassword and newPassword are required" });
  }

  // Basic password policy: 8-15 chars, at least 1 upper, 1 lower, 1 special
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-={}\[\]|;:'\",.<>\/?`~]).{8,15}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({
      message:
        "Password must be 8-15 characters, include at least one uppercase, one lowercase, and one special character",
    });
  }

  // Verify current password
  const findUserQuery = "SELECT id FROM users WHERE id = ? AND password = ? LIMIT 1";
  pool.execute(findUserQuery, [userId, currentPassword], (err, rows) => {
    if (err) {
      console.error("Change password - user lookup error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (!rows || rows.length === 0) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const updatePasswordQuery = "UPDATE users SET password = ? WHERE id = ?";
    pool.execute(updatePasswordQuery, [newPassword, userId], (updErr) => {
      if (updErr) {
        console.error("Change password - update error:", updErr);
        return res.status(500).json({ message: "Failed to update password" });
      }
      return res.json({ message: "Password changed successfully" });
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
  const { userId, userRole } = req.query;

  let query;
  let params = [];

  // If userId and userRole are provided and user is manager/team_lead, filter by project assignments
  // Only show users who are team members in projects assigned to this manager/team lead
  // If manager has no project assignments, show all users (like super admin)
  if (userId && userRole && (userRole === 'manager' || userRole === 'team_lead')) {
    // First check if manager has any project assignments
    const checkAssignmentsQuery = `
      SELECT COUNT(*) as count
      FROM project_assignments
      WHERE assigned_to_user_id = ?
    `;
    
    pool.execute(checkAssignmentsQuery, [userId], (checkErr, checkRows) => {
      if (checkErr) {
        console.error("Check assignments error:", checkErr);
        return res.status(500).json({ message: "Database error" });
      }
      
      const hasAssignments = checkRows[0]?.count > 0;
      
      if (hasAssignments) {
        // Manager has assignments - show users from assigned projects
        query = `
          SELECT DISTINCT u.*
          FROM users u
          INNER JOIN project_team_members ptm ON u.id = ptm.user_id
          INNER JOIN project_assignments pa ON ptm.project_id = pa.project_id
          WHERE pa.assigned_to_user_id = ?
          ORDER BY u.username
        `;
        params = [userId];
      } else {
        // Manager has no assignments - show empty (security: don't show other managers' data)
        return res.json([]);
      }
      
      pool.execute(query, params, (err, results) => {
        if (err) {
          console.error("Users fetch error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json(results);
      });
    });
  } else {
    // Super admin: show all users
    query = "SELECT * FROM users ORDER BY username";
    params = [];
    
    pool.execute(query, params, (err, results) => {
      if (err) {
        console.error("Users fetch error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json(results);
    });
  }
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
app.delete("/api/users/:id", (req, res) => {
  const { id } = req.params;

  const query = "DELETE FROM users WHERE id = ?";

  pool.execute(query, [id], (err, results) => {
    if (err) {
      console.error("Delete user error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json({ message: "User deleted successfully" });
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
  const { userId, userRole } = req.query;

  console.log("📋 GET /api/projects - Query params:", { userId, userRole });

  let query;
  let params = [];

  // If userId and userRole are provided and user is manager/team_lead, filter by assignments
  // Super admin and employees see all projects (or filtered by team membership)
  // If manager has no project assignments, show all projects (like super admin)
  if (userId && userRole && (userRole === 'manager' || userRole === 'team_lead')) {
    console.log(`🔍 Filtering projects for ${userRole} (userId: ${userId})`);
    
    // First check if manager has any project assignments
    const checkAssignmentsQuery = `
      SELECT COUNT(*) as count
      FROM project_assignments
      WHERE assigned_to_user_id = ?
    `;
    
    pool.execute(checkAssignmentsQuery, [userId], (checkErr, checkRows) => {
      if (checkErr) {
        console.error("Check assignments error:", checkErr);
        return res.status(500).json({ message: "Database error" });
      }
      
      const hasAssignments = checkRows[0]?.count > 0;
      
      if (hasAssignments) {
        // Manager has assignments - show assigned projects
        query = `
          SELECT DISTINCT p.*
          FROM projects p
          INNER JOIN project_assignments pa ON p.id = pa.project_id
          WHERE pa.assigned_to_user_id = ?
          ORDER BY p.name
        `;
        params = [userId];
      } else {
        // Manager has no assignments - show empty (security: don't show other managers' data)
        console.log("🔒 Manager has no assignments - returning empty projects array");
        return res.json([]);
      }
      
      pool.execute(query, params, (err, results) => {
        if (err) {
          console.error("Projects fetch error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        console.log(`✅ Projects query returned ${results?.length || 0} projects`);
        // Normalize status values for clients
        const normalized = (results || []).map((row) => {
          const raw = (row.status || '').toLowerCase();
          let status = raw;
          if (raw === 'on_hold' || raw === 'cancelled') status = 'inactive';
          if (raw === 'planning') status = 'active';
          return { ...row, status };
        });
        res.json(normalized);
      });
    });
  } else if (userId && userRole && userRole === 'employee') {
    // For employees, show only projects they are assigned to (via project_team_members)
    console.log(`👤 Filtering projects for employee (userId: ${userId})`);
    query = `
      SELECT DISTINCT p.*
      FROM projects p
      INNER JOIN project_team_members ptm ON p.id = ptm.project_id
      WHERE ptm.user_id = ?
      ORDER BY p.name
    `;
    params = [userId];
    
    pool.execute(query, params, (err, results) => {
      if (err) {
        console.error("Projects fetch error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      console.log(`✅ Projects query returned ${results?.length || 0} projects for employee`);
      // Normalize status values for clients
      const normalized = (results || []).map((row) => {
        const raw = (row.status || '').toLowerCase();
        let status = raw;
        if (raw === 'on_hold' || raw === 'cancelled') status = 'inactive';
        if (raw === 'planning') status = 'active';
        return { ...row, status };
      });
      res.json(normalized);
    });
  } else {
    console.log("👑 Showing all projects (super admin or no filter params)");
    // Super admin: show all projects
    query = "SELECT * FROM projects ORDER BY name";
    params = [];
    
    pool.execute(query, params, (err, results) => {
      if (err) {
        console.error("Projects fetch error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      console.log(`✅ Projects query returned ${results?.length || 0} projects`);
      // Normalize status values for clients
      const normalized = (results || []).map((row) => {
        const raw = (row.status || '').toLowerCase();
        let status = raw;
        if (raw === 'on_hold' || raw === 'cancelled') status = 'inactive';
        if (raw === 'planning') status = 'active';
        return { ...row, status };
      });
      res.json(normalized);
    });
  }
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
  if (!start_date) {
    return res.status(400).json({ message: "Project start date is required" });
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
  const updateData = { ...req.body };
  // Database schema supports 'inactive' directly, no conversion needed
  
  // Validate status if provided
  if (updateData.status !== undefined) {
    // Normalize status to lowercase for validation
    const statusLower = String(updateData.status).toLowerCase().trim();
    const validStatuses = ['active', 'inactive', 'completed', 'dropped'];
    if (!validStatuses.includes(statusLower)) {
      console.error(`Invalid status received: "${updateData.status}" (normalized: "${statusLower}")`);
      return res.status(400).json({ 
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }
    // Ensure status is saved in lowercase
    updateData.status = statusLower;
    console.log(`Status normalized: "${updateData.status}" -> "${statusLower}"`);
  }

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

  console.log("Update project query:", query);
  console.log("Update project values:", values);
  console.log("Update project status value:", updateData.status);
  console.log("Update project status type:", typeof updateData.status);

  pool.execute(query, values, (err, results) => {
    if (err) {
      console.error("Update project error:", err);
      console.error("Error code:", err.code);
      console.error("Error message:", err.message);
      console.error("Error sqlState:", err.sqlState);
      console.error("Query:", query);
      console.error("Values:", values);
      
      // Check if it's an ENUM value error
      if (err.code === 'WARN_DATA_TRUNCATED' || err.message.includes('ENUM') || err.message.includes('status')) {
        return res.status(400).json({ 
          message: `Invalid status value. The database may not support this status value. Error: ${err.message}` 
        });
      }
      
      return res.status(500).json({ message: "Database error" });
    }
    
    console.log("Update successful, affected rows:", results.affectedRows);
    
    // Verify the update by fetching the updated project
    pool.execute("SELECT * FROM projects WHERE id = ?", [id], (fetchErr, fetchResults) => {
      if (fetchErr) {
        console.error("Error fetching updated project:", fetchErr);
        return res.json({ message: "Project updated successfully" });
      }
      
      const updatedProject = fetchResults[0];
      console.log("Updated project status in DB (raw):", updatedProject?.status);
      console.log("Updated project status type:", typeof updatedProject?.status);
      console.log("Updated project full record:", JSON.stringify(updatedProject, null, 2));
      
      // Normalize status for response
      if (updatedProject) {
        const raw = (updatedProject.status || '').toLowerCase();
        let normalizedStatus = raw;
        if (raw === 'on_hold' || raw === 'cancelled') normalizedStatus = 'inactive';
        if (raw === 'planning') normalizedStatus = 'active';
        console.log("Normalized status for response:", normalizedStatus);
        updatedProject.status = normalizedStatus;
      }
      
      res.json({ 
        message: "Project updated successfully",
        project: updatedProject
      });
    });
  });
});

// Delete project
// app.delete("/api/projects/:id", (req, res) => {
//   const { id } = req.params;

//   const query = "DELETE FROM projects WHERE id = ?";

//   pool.execute(query, [id], (err, results) => {
//     if (err) {
//       console.error("Delete project error:", err);
//       return res.status(500).json({ message: "Database error" });
//     }
//     res.json({ message: "Project deleted successfully" });
//   });
// });

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

// ==================== PROJECT ASSIGNMENTS API ====================

// Get all project assignments (for super admin)
app.get("/api/project-assignments", (req, res) => {
  const query = `
    SELECT 
      pa.id,
      pa.project_id,
      pa.assigned_to_user_id,
      pa.assigned_by_user_id,
      pa.assigned_at,
      p.name as project_name,
      p.status as project_status,
      u_assigned.username as assigned_to_username,
      u_assigned.email as assigned_to_email,
      u_assigned.role as assigned_to_role,
      u_by.username as assigned_by_username
    FROM project_assignments pa
    JOIN projects p ON pa.project_id = p.id
    JOIN users u_assigned ON pa.assigned_to_user_id = u_assigned.id
    LEFT JOIN users u_by ON pa.assigned_by_user_id = u_by.id
    ORDER BY p.name, u_assigned.username
  `;

  pool.execute(query, (err, results) => {
    if (err) {
      console.error("Project assignments fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Get projects assigned to a specific user
app.get("/api/project-assignments/user/:userId", (req, res) => {
  const { userId } = req.params;

  const query = `
    SELECT 
      p.*,
      pa.assigned_at,
      pa.assigned_by_user_id
    FROM project_assignments pa
    JOIN projects p ON pa.project_id = p.id
    WHERE pa.assigned_to_user_id = ?
    ORDER BY p.name
  `;

  pool.execute(query, [userId], (err, results) => {
    if (err) {
      console.error("User assigned projects fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    // Normalize status values
    const normalized = (results || []).map((row) => {
      const raw = (row.status || '').toLowerCase();
      let status = raw;
      if (raw === 'on_hold' || raw === 'cancelled') status = 'inactive';
      if (raw === 'planning') status = 'active';
      return { ...row, status };
    });
    res.json(normalized);
  });
});

// Get available managers and team leads for assignment
app.get("/api/project-assignments/managers-teamleads", (req, res) => {
  const query = `
    SELECT 
      id,
      username,
      email,
      role,
      available_hours_per_week
    FROM users
    WHERE role IN ('manager', 'team_lead')
    ORDER BY role, username
  `;

  pool.execute(query, (err, results) => {
    if (err) {
      console.error("Managers/Team leads fetch error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

// Assign a project to a manager/team lead
app.post("/api/project-assignments", (req, res) => {
  const { project_id, assigned_to_user_id, assigned_by_user_id } = req.body;

  if (!project_id || !assigned_to_user_id) {
    return res.status(400).json({ message: "project_id and assigned_to_user_id are required" });
  }

  // First verify the user is a manager or team lead
  const checkUserQuery = "SELECT role FROM users WHERE id = ?";
  pool.execute(checkUserQuery, [assigned_to_user_id], (err, rows) => {
    if (err) {
      console.error("User check error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const userRole = rows[0].role;
    if (userRole !== 'manager' && userRole !== 'team_lead') {
      return res.status(400).json({ message: "Can only assign projects to managers or team leads" });
    }

    // Check if assignment already exists
    const checkAssignmentQuery = "SELECT id FROM project_assignments WHERE project_id = ? AND assigned_to_user_id = ?";
    pool.execute(checkAssignmentQuery, [project_id, assigned_to_user_id], (checkErr, checkRows) => {
      if (checkErr) {
        console.error("Assignment check error:", checkErr);
        return res.status(500).json({ message: "Database error" });
      }
      if (checkRows && checkRows.length > 0) {
        return res.status(400).json({ message: "Project is already assigned to this user" });
      }

      // Insert assignment
      const insertQuery = `
        INSERT INTO project_assignments (project_id, assigned_to_user_id, assigned_by_user_id)
        VALUES (?, ?, ?)
      `;
      pool.execute(insertQuery, [project_id, assigned_to_user_id, assigned_by_user_id || null], (insertErr, insertResult) => {
        if (insertErr) {
          console.error("Assignment insert error:", insertErr);
          return res.status(500).json({ message: "Failed to assign project" });
        }
        res.json({
          id: insertResult.insertId,
          message: "Project assigned successfully",
          project_id,
          assigned_to_user_id,
        });
      });
    });
  });
});

// Unassign a project from a manager/team lead
app.delete("/api/project-assignments/:id", (req, res) => {
  const { id } = req.params;

  const deleteQuery = "DELETE FROM project_assignments WHERE id = ?";
  pool.execute(deleteQuery, [id], (err, result) => {
    if (err) {
      console.error("Unassign error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    res.json({ message: "Project unassigned successfully" });
  });
});

// Unassign by project and user (alternative endpoint)
app.delete("/api/project-assignments/project/:projectId/user/:userId", (req, res) => {
  const { projectId, userId } = req.params;

  const deleteQuery = "DELETE FROM project_assignments WHERE project_id = ? AND assigned_to_user_id = ?";
  pool.execute(deleteQuery, [projectId, userId], (err, result) => {
    if (err) {
      console.error("Unassign error:", err);
      return res.status(500).json({ message: "Database error" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    res.json({ message: "Project unassigned successfully" });
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
  const { userId, userRole } = req.query;

  // If user is manager/team_lead, verify they have access to this project
  if (userId && userRole && (userRole === 'manager' || userRole === 'team_lead')) {
    const checkAccessQuery = `
      SELECT id FROM project_assignments 
      WHERE project_id = ? AND assigned_to_user_id = ?
    `;
    pool.execute(checkAccessQuery, [id, userId], (checkErr, checkRows) => {
      if (checkErr) {
        console.error("Access check error:", checkErr);
        return res.status(500).json({ message: "Database error" });
      }
      if (!checkRows || checkRows.length === 0) {
        return res.status(403).json({ message: "Access denied: You don't have access to this project" });
      }

      // User has access, proceed with the query
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
  } else {
    // Super admin or employee - no access check needed
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
  }
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
  const { userId, userRole } = req.query;

  // If user is manager/team_lead, verify they have access to this project
  if (userId && userRole && (userRole === 'manager' || userRole === 'team_lead')) {
    const checkAccessQuery = `
      SELECT id FROM project_assignments 
      WHERE project_id = ? AND assigned_to_user_id = ?
    `;
    pool.execute(checkAccessQuery, [id, userId], (checkErr, checkRows) => {
      if (checkErr) {
        console.error("Access check error:", checkErr);
        return res.status(500).json({ message: "Database error" });
      }
      if (!checkRows || checkRows.length === 0) {
        return res.status(403).json({ message: "Access denied: You don't have access to this project" });
      }

      // User has access, proceed with the query
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
  } else {
    // Super admin or employee - no access check needed
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
  }
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
  const { userId, userRole } = req.query;

  let query;
  let params = [];
  let joinClause = "";

  // If user is manager/team_lead, filter tasks by their assigned projects
  // If manager has no project assignments, show all tasks (like super admin)
  if (userId && userRole && (userRole === 'manager' || userRole === 'team_lead')) {
    // First check if manager has any project assignments
    const checkAssignmentsQuery = `
      SELECT COUNT(*) as count
      FROM project_assignments
      WHERE assigned_to_user_id = ?
    `;
    
    pool.execute(checkAssignmentsQuery, [userId], (checkErr, checkRows) => {
      if (checkErr) {
        console.error("Check assignments error:", checkErr);
        return res.status(500).json({ message: "Database error" });
      }
      
      const hasAssignments = checkRows[0]?.count > 0;
      
      if (hasAssignments) {
        // Manager has assignments - show tasks from assigned projects
        joinClause = "INNER JOIN project_assignments pa ON t.project_id = pa.project_id";
        params.push(userId);
      } else {
        // Manager has no assignments - show empty (security: don't show other managers' data)
        return res.json([]);
      }
      
      query = `
        SELECT 
            t.*,
            u.username as assignee_name,
            p.name as project_name
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id = u.id
        LEFT JOIN projects p ON t.project_id = p.id
        ${joinClause}
        ${params.length > 0 ? 'WHERE pa.assigned_to_user_id = ?' : ''}
        ORDER BY t.created_at DESC
      `;

      pool.execute(query, params, (err, results) => {
        if (err) {
          console.error("Tasks fetch error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        res.json(results);
      });
    });
  } else if (userId && userRole && userRole === 'employee') {
    // For employees, show only tasks assigned to them
    query = `
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
    params = [userId];

    pool.execute(query, params, (err, results) => {
      if (err) {
        console.error("Tasks fetch error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json(results);
    });
  } else {
    // Super admin: show all tasks
    query = `
      SELECT 
          t.*,
          u.username as assignee_name,
          p.name as project_name
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      ORDER BY t.created_at DESC
    `;
    params = [];

    pool.execute(query, params, (err, results) => {
      if (err) {
        console.error("Tasks fetch error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json(results);
    });
  }
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

// Get daily updates for a task (must come before /api/tasks/:id routes)
app.get("/api/tasks/:id/daily-updates", (req, res) => {
  console.log(`[Daily Updates] GET request for task ID: ${req.params.id}`);
  const { id } = req.params;
  // Get raw timestamp, convert to IST in JavaScript
  const query = `
    SELECT 
      tdu.id,
      tdu.task_id,
      tdu.user_id,
      tdu.comment,
      tdu.created_at,
      tdu.updated_at,
      u.username,
      u.email,
      u.username as user_name
    FROM task_daily_updates tdu
    LEFT JOIN users u ON tdu.user_id = u.id
    WHERE tdu.task_id = ?
    ORDER BY tdu.created_at DESC
  `;

  pool.execute(query, [id], (err, results) => {
    if (err) {
      console.error("Get daily updates error:", err);
      console.error("Error details:", err);
      return res.status(500).json({ message: "Database error", error: err.message });
    }
    
    // Convert timestamps to IST (UTC+5:30) in JavaScript
    const convertedResults = (results || []).map(update => {
      if (update.created_at) {
        const utcDate = new Date(update.created_at);
        // Add 5 hours 30 minutes for IST
        const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
        update.created_at = istDate.toISOString();
      }
      return update;
    });
    
    res.json(convertedResults);
  });
});

// Create a daily update for a task (must come before /api/tasks/:id routes)
app.post("/api/tasks/:id/daily-updates", (req, res) => {
  console.log(`[Daily Updates] POST request for task ID: ${req.params.id}`);
  const { id } = req.params;
  const { user_id, comment } = req.body;

  // Validation
  if (!user_id || !comment || !comment.trim()) {
    return res.status(400).json({ message: "User ID and comment are required" });
  }

  // Verify task exists
  const checkTaskQuery = "SELECT id FROM tasks WHERE id = ?";
  pool.execute(checkTaskQuery, [id], (taskErr, taskResults) => {
    if (taskErr) {
      console.error("Check task error:", taskErr);
      return res.status(500).json({ message: "Database error", error: taskErr.message });
    }

    if (taskResults.length === 0) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Insert daily update
    const insertQuery = `
      INSERT INTO task_daily_updates (task_id, user_id, comment, created_at)
      VALUES (?, ?, ?, NOW())
    `;

    pool.execute(insertQuery, [id, user_id, comment.trim()], (err, results) => {
      if (err) {
        console.error("Create daily update error:", err);
        return res.status(500).json({ message: "Database error", error: err.message });
      }

      // Fetch the created update with user details
      const fetchQuery = `
        SELECT 
          tdu.id,
          tdu.task_id,
          tdu.user_id,
          tdu.comment,
          tdu.created_at,
          tdu.updated_at,
          u.username,
          u.email,
          u.username as user_name
        FROM task_daily_updates tdu
        LEFT JOIN users u ON tdu.user_id = u.id
        WHERE tdu.id = ?
      `;

      pool.execute(fetchQuery, [results.insertId], (fetchErr, fetchResults) => {
        if (fetchErr) {
          console.error("Fetch daily update error:", fetchErr);
          return res.status(500).json({ message: "Database error", error: fetchErr.message });
        }
        
        // Convert timestamp to IST (UTC+5:30)
        if (fetchResults[0] && fetchResults[0].created_at) {
          const utcDate = new Date(fetchResults[0].created_at);
          const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
          fetchResults[0].created_at = istDate.toISOString();
        }
        
        res.status(201).json(fetchResults[0]);
      });
    });
  });
});

// Delete a daily update
app.delete("/api/tasks/:taskId/daily-updates/:updateId", (req, res) => {
  console.log(`[Daily Updates] DELETE request for update ID: ${req.params.updateId}`);
  const { taskId, updateId } = req.params;

  // Verify the update belongs to the task
  const checkQuery = "SELECT id FROM task_daily_updates WHERE id = ? AND task_id = ?";
  pool.execute(checkQuery, [updateId, taskId], (checkErr, checkResults) => {
    if (checkErr) {
      console.error("Check daily update error:", checkErr);
      return res.status(500).json({ message: "Database error", error: checkErr.message });
    }

    if (checkResults.length === 0) {
      return res.status(404).json({ message: "Daily update not found" });
    }

    // Delete the daily update
    const deleteQuery = "DELETE FROM task_daily_updates WHERE id = ?";
    pool.execute(deleteQuery, [updateId], (err, results) => {
      if (err) {
        console.error("Delete daily update error:", err);
        return res.status(500).json({ message: "Database error", error: err.message });
      }
      res.json({ message: "Daily update deleted successfully" });
    });
  });
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

  // If status is being changed from 'completed' to something else, clear actual_hours
  // First, get the current status
  const getCurrentStatusQuery = "SELECT status FROM tasks WHERE id = ?";
  
  pool.execute(getCurrentStatusQuery, [id], (statusErr, statusRows) => {
    if (statusErr) {
      console.error("Get current status error:", statusErr);
      return res.status(500).json({ message: "Database error" });
    }

    const currentStatus = statusRows[0]?.status;
    const newStatus = updateData.status;

    // If task was completed and is being moved to non-completed, clear actual_hours
    if (currentStatus === 'completed' && newStatus && newStatus !== 'completed' && updateData.actual_hours === undefined) {
      fields.push("actual_hours = NULL");
    }

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

// app.get("/api/dashboard/data", (req, res) => {
//   try {
//     const { projectId, employeeId, startDate, endDate } = req.query;

//     console.log("Dashboard data request:", {
//       projectId,
//       employeeId,
//       startDate,
//       endDate,
//     });

//     let whereConditions = [];
//     let queryParams = [];

//     if (projectId && projectId !== "all") {
//       whereConditions.push("t.project_id = ?");
//       queryParams.push(projectId);
//     }

//     if (employeeId && employeeId !== "all") {
//       whereConditions.push("t.assignee_id = ?");
//       queryParams.push(employeeId);
//     }

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

//     // ✅ Utilization Query
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

//     // ✅ Productivity Query
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

//     // ✅ Availability Query
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

//             // ✅ Format individual datasets
//             const utilizationData = utilizationRows.map((row) => ({
//               week: row.week,
//               utilization: parseFloat(row.utilization_percentage) || 0,
//               availableHours: parseInt(row.available_hours) || 0,
//             }));

//             const productivityData = productivityRows.map((row) => ({
//               week: row.week,
//               completed: parseInt(row.completed_tasks) || 0,
//               hours: parseFloat(row.actual_hours) || 0,
//               productivity: parseFloat(row.productivity_percentage) || 0,
//               plannedHours: parseFloat(row.planned_hours) || 0,
//             }));

//             const availabilityData = availabilityRows.map((row) => ({
//               week: row.week,
//               availableHours: parseInt(row.available_hours) || 0,
//             }));

//             // ✅ Generate all weeks in range (fill missing)
//             function generateWeekRange(start, end) {
//               const result = [];
//               const startDateObj = new Date(start);
//               const endDateObj = new Date(end);

//               const curr = new Date(startDateObj);
//               curr.setDate(curr.getDate() - curr.getDay() + 1);

//               while (curr <= endDateObj) {
//                 const year = curr.getFullYear();
//                 const week = getWeekNumber(curr);
//                 result.push(`${year}-W${week.toString().padStart(2, "0")}`);
//                 curr.setDate(curr.getDate() + 7);
//               }

//               return result;
//             }

//             function getWeekNumber(d) {
//               d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
//               const dayNum = d.getUTCDay() || 7;
//               d.setUTCDate(d.getUTCDate() + 4 - dayNum);
//               const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
//               return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
//             }

//             const allWeeks =
//               startDate && endDate
//                 ? generateWeekRange(startDate, endDate)
//                 : Array.from(
//                     new Set([
//                       ...utilizationData.map((d) => d.week),
//                       ...productivityData.map((d) => d.week),
//                       ...availabilityData.map((d) => d.week),
//                     ])
//                   );

//             // ✅ Merge all datasets ensuring full week coverage
//             const mergedData = allWeeks.map((week) => {
//               const util = utilizationData.find((d) => d.week === week) || {
//                 utilization: 0,
//                 availableHours: 0,
//               };
//               const prod = productivityData.find((d) => d.week === week) || {
//                 completed: 0,
//                 hours: 0,
//                 productivity: 0,
//                 plannedHours: 0,
//               };
//               const avail = availabilityData.find((d) => d.week === week) || {
//                 availableHours: 0,
//               };

//               return {
//                 week,
//                 utilization: util.utilization,
//                 completed: prod.completed,
//                 hours: prod.hours,
//                 productivity: prod.productivity,
//                 plannedHours: prod.plannedHours,
//                 availableHours:
//                   avail.availableHours || util.availableHours || 0,
//               };
//             });

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

// Helper functions for dashboard calculations
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

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
          whereConditions.push("t.project_id IN (SELECT project_id FROM project_assignments WHERE assigned_to_user_id = ?)");
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
      // IMPORTANT: For productivity/utilization, we should NOT filter by date range
      // because these metrics need to show ALL tasks regardless of date
      // Date filtering should only apply to timeline/calendar views, not metrics
      // However, if user explicitly wants date-filtered metrics, we'll respect that
      
      // Build base WHERE clause (without date filters for metrics)
      const baseWhereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

      // Build date-filtered WHERE clause (for timeline views if needed)
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

      const dateFilteredWhereClause = dateWhereConditions.length > 0
        ? `WHERE ${dateWhereConditions.join(" AND ")}`
        : "";

      // Use base WHERE clause (without date filter) for productivity/utilization
      // This ensures all tasks are included in calculations
      const whereClause = baseWhereClause;

      // ========== UTILIZATION QUERY ==========
      // Utilization = (Planned / Available) × 100
      // Planned = SUM(planned_hours) for all tasks
      // Available = SUM(available_hours_per_week) for relevant users
      const utilizationQuery = `
        SELECT 
          week,
          SUM(planned_hours) as planned_working_hours,
          SUM(available_hours) as total_available_hours,
          ROUND((SUM(planned_hours) / NULLIF(SUM(available_hours), 0)) * 100, 1) as utilization_percentage
        FROM (
          SELECT 
            DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u') as week,
            t.assignee_id,
            SUM(COALESCE(t.planned_hours, 0)) as planned_hours,
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
      // Productivity = (Actual / Planned) × 100
      // Actual = SUM(actual_hours)
      // Planned = SUM(planned_hours)
      const productivityQuery = `
        SELECT 
          DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u') as week,
          COUNT(*) as total_tasks,
          COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
          SUM(COALESCE(t.actual_hours, 0)) as actual_hours,
          SUM(COALESCE(t.planned_hours, 0)) as planned_hours,
          CASE 
            WHEN SUM(COALESCE(t.planned_hours, 0)) > 0 
            THEN ROUND((SUM(COALESCE(t.actual_hours, 0)) / NULLIF(SUM(COALESCE(t.planned_hours, 0)), 0)) * 100, 1)
            ELSE NULL
          END as productivity
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
          WHERE ptm.project_id IN (
            SELECT project_id FROM project_assignments WHERE assigned_to_user_id = ?
          )
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

      // Debug: First check if tasks exist with the filters (without date filter for metrics)
      const debugQuery = `
        SELECT 
          t.id,
          t.name,
          t.status,
          t.actual_hours,
          t.planned_hours,
          t.due_date,
          t.created_at,
          DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u') as week,
          u.username,
          u.available_hours_per_week,
          COUNT(CASE WHEN t.status = 'completed' THEN 1 END) OVER() as total_completed,
          COUNT(*) OVER() as total_tasks
        FROM tasks t
        JOIN users u ON t.assignee_id = u.id
        ${joinClause}
        ${whereClause}
        ORDER BY t.id
        LIMIT 20
      `;
      
      pool.execute(debugQuery, queryParams, (debugErr, debugRows) => {
        if (!debugErr && debugRows.length > 0) {
          const totalActualHours = debugRows.reduce((sum, r) => sum + (parseFloat(r.actual_hours) || 0), 0);
          const totalPlannedHours = debugRows.reduce((sum, r) => sum + (parseFloat(r.planned_hours) || 0), 0);
          const productivity = totalPlannedHours > 0 ? ((totalActualHours / totalPlannedHours) * 100).toFixed(1) : 0;
          
          console.log("=== DEBUG: Tasks found with filters (NO DATE FILTER) ===");
          console.log("Query:", debugQuery);
          console.log("Params:", queryParams);
          console.log(`Found ${debugRows.length} tasks (showing first 20)`);
          console.log(`Total Actual Hours: ${totalActualHours.toFixed(1)}, Total Planned Hours: ${totalPlannedHours.toFixed(1)}, Productivity: ${productivity}%`);
          console.log("Sample tasks:");
          debugRows.slice(0, 5).forEach((row, idx) => {
            console.log(`  ${idx + 1}. [${row.status}] ${row.name} - ${row.username} (${row.planned_hours}h planned, ${row.actual_hours || 0}h actual)`);
          });
        } else if (debugErr) {
          console.error("Debug query error:", debugErr);
        } else {
          console.log("⚠️  No tasks found with current filters!");
        }
      });

      // Execute queries - use base query params (without date filter) for metrics
      pool.execute(utilizationQuery, queryParams, (err, utilizationRows) => {
        if (err) {
          console.error("Utilization query error:", err);
          return res.status(500).json({ error: "Database error", details: err.message });
        }

        pool.execute(productivityQuery, queryParams, (err, productivityRows) => {
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
            const availabilityParams = [totalAvailableHours, ...queryParams];

            pool.execute(availabilityQuery, availabilityParams, (err, availabilityRows) => {
              if (err) {
                console.error("Availability query error:", err);
                return res.status(500).json({ error: "Database error", details: err.message });
              }

              // Debug logging
              console.log("=== DASHBOARD DATA DEBUG ===");
              console.log("Utilization rows:", JSON.stringify(utilizationRows, null, 2));
              console.log("Productivity rows:", JSON.stringify(productivityRows, null, 2));
              console.log("Where clause:", whereClause);
              console.log("Date query params:", dateQueryParams);
              console.log("Join clause:", joinClause);
              console.log("Filters - projectId:", projectId, "employeeId:", employeeId, "startDate:", startDate, "endDate:", endDate);

              // Format data
              const utilizationData = utilizationRows.map((row) => {
                const utilPercent = row.utilization_percentage !== null && row.utilization_percentage !== undefined 
                  ? parseFloat(row.utilization_percentage) 
                  : null;
                return {
                  week: row.week,
                  utilization: (utilPercent !== null && !isNaN(utilPercent)) ? utilPercent : null,
                  actualHours: parseFloat(row.planned_working_hours) || 0, // This is actually planned hours for utilization
                  availableHours: parseFloat(row.total_available_hours) || 0,
                };
              });

              const productivityData = productivityRows.map((row) => {
                // Productivity = (Actual / Planned) × 100
                // Use hours-based productivity: (actual_hours / planned_hours) × 100
                const productivity = row.productivity !== null && row.productivity !== undefined 
                  ? parseFloat(row.productivity) 
                  : null;
                
                return {
                  week: row.week,
                  completed: parseInt(row.completed_tasks) || 0,
                  total: parseInt(row.total_tasks) || 0,
                  hours: parseFloat(row.actual_hours) || 0,
                  plannedHours: parseFloat(row.planned_hours) || 0,
                  productivity: (productivity !== null && !isNaN(productivity) && productivity >= 0) ? productivity : null,
                };
              });

              const availabilityData = availabilityRows.map((row) => ({
                week: row.week,
                availableHours: parseFloat(row.available_hours) || 0,
              }));

              // Generate all weeks - use data from queries, not date range
              // This ensures we show all weeks where tasks exist
              const allWeeks = Array.from(new Set([
                ...utilizationData.map((d) => d.week),
                ...productivityData.map((d) => d.week),
                ...availabilityData.map((d) => d.week),
              ]));

              if (allWeeks.length === 0) {
                // If no data, show current week
                const now = new Date();
                const year = now.getFullYear();
                const week = getWeekNumber(now);
                allWeeks.push(`${year}-W${week.toString().padStart(2, "0")}`);
              }

              // Calculate total available hours from utilization data (for fallback and overall calculation)
              // Use the totalAvailableHours from the database query (line 3688) as the default per-week value
              // If no utilization data, use the total from the query divided by number of weeks, or 0
              const calculatedTotalAvailableHours = utilizationData.reduce((sum, d) => sum + (d.availableHours || 0), 0);
              const defaultAvailableHoursPerWeek = allWeeks.length > 0 && calculatedTotalAvailableHours === 0 
                ? (totalAvailableHours / allWeeks.length) 
                : (calculatedTotalAvailableHours / Math.max(allWeeks.length, 1));

              // Merge all datasets
              const mergedData = allWeeks.map((week) => {
                const util = utilizationData.find((d) => d.week === week);
                const prod = productivityData.find((d) => d.week === week);
                const avail = availabilityData.find((d) => d.week === week);

                // Log for debugging
                if (prod && (prod.completed > 0 || prod.total > 0)) {
                  console.log(`Week ${week} productivity data:`, {
                    completed: prod.completed,
                    total: prod.total,
                    productivity: prod.productivity,
                    hours: prod.hours,
                    plannedHours: prod.plannedHours
                  });
                }

                return {
                  week,
                  utilization: util ? util.utilization : null,
                  completed: prod ? prod.completed : 0,
                  hours: prod ? prod.hours : 0,
                  productivity: prod ? prod.productivity : null,
                  plannedHours: prod ? prod.plannedHours : 0,
                  availableHours: avail ? avail.availableHours : (util ? util.availableHours : defaultAvailableHoursPerWeek),
                };
              });

              // Calculate overall productivity and utilization (aggregated across all weeks)
              // Productivity = (Actual / Planned) × 100
              const totalActualHours = productivityData.reduce((sum, d) => sum + (d.hours || 0), 0);
              const totalPlannedHours = productivityData.reduce((sum, d) => sum + (d.plannedHours || 0), 0);
              const overallProductivity = totalPlannedHours > 0 ? (totalActualHours / totalPlannedHours) * 100 : 0;
              
              // Utilization = (Planned / Available) × 100
              // Use calculatedTotalAvailableHours if available, otherwise use totalAvailableHours from query
              const totalAvailableHoursForUtilization = calculatedTotalAvailableHours > 0 
                ? calculatedTotalAvailableHours 
                : totalAvailableHours;
              const overallUtilization = totalAvailableHoursForUtilization > 0 
                ? (totalPlannedHours / totalAvailableHoursForUtilization) * 100 
                : 0;

              console.log("=== FINAL MERGED DATA ===");
              console.log(`Overall Productivity: ${overallProductivity.toFixed(1)}% (${totalActualHours.toFixed(1)}h actual / ${totalPlannedHours.toFixed(1)}h planned)`);
              console.log(`Overall Utilization: ${overallUtilization.toFixed(1)}% (${totalPlannedHours.toFixed(1)}h planned / ${totalAvailableHoursForUtilization.toFixed(1)}h available)`);
              console.log(`Total Weeks: ${mergedData.length}`);
              if (mergedData.length > 0) {
                console.log("Sample merged data (first week):", JSON.stringify(mergedData[0], null, 2));
              }

              res.json({
                utilizationData: mergedData,
                productivityData: mergedData,
                availabilityData: mergedData,
                // Add overall metrics for easier frontend calculation
                overallMetrics: {
                  productivity: overallProductivity,
                  utilization: overallUtilization,
                  totalActualHours: totalActualHours,
                  totalPlannedHours: totalPlannedHours,
                  totalAvailableHours: totalAvailableHoursForUtilization
                }
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

// Get projects for filter dropdown
app.get("/api/dashboard/projects", (req, res) => {
  const { userId, userRole } = req.query;

  // Super admin: show all projects
  if (!userId || !userRole || userRole === 'super_admin') {
    const query = "SELECT id, name, status FROM projects ORDER BY name";
    pool.execute(query, [], (err, results) => {
      if (err) {
        console.error("Projects filter error:", err);
        return res.status(500).json({ error: "Failed to fetch projects" });
      }
      res.json(results);
    });
    return;
  }

  // Manager/Team Lead: show projects assigned to them
  if (userRole === 'manager' || userRole === 'team_lead') {
    // Get projects assigned to manager via project_assignments
    const query = `
      SELECT DISTINCT p.id, p.name, p.status
      FROM projects p
      INNER JOIN project_assignments pa ON p.id = pa.project_id
      WHERE pa.assigned_to_user_id = ?
      ORDER BY p.name
    `;
    
    pool.execute(query, [userId], (err, results) => {
      if (err) {
        console.error("Projects filter error:", err);
        return res.status(500).json({ error: "Failed to fetch projects" });
      }
      res.json(results || []);
    });
    return;
  }

  // Employee: show only projects they are assigned to (via project_team_members)
  if (userRole === 'employee') {
    const query = `
      SELECT DISTINCT p.id, p.name, p.status
      FROM projects p
      INNER JOIN project_team_members ptm ON p.id = ptm.project_id
      WHERE ptm.user_id = ?
      ORDER BY p.name
    `;
    
    pool.execute(query, [userId], (err, results) => {
      if (err) {
        console.error("Projects filter error:", err);
        return res.status(500).json({ error: "Failed to fetch projects" });
      }
      res.json(results || []);
    });
    return;
  }

  // Default: return empty array
  res.json([]);
});

// Get employees for filter dropdown (optionally filtered by project)
app.get("/api/dashboard/employees", (req, res) => {
  const { projectId, userId, userRole } = req.query;

  let query;
  let params = [];

  // Handle multiple projectIds (comma-separated string)
  if (projectId && projectId !== "all" && projectId !== undefined) {
    const projectIds = String(projectId).split(',').map(id => id.trim()).filter(id => id);
    
    if (projectIds.length > 0) {
      // If projectId(s) provided, only return employees assigned to those projects
      // Also check if user has access to these projects (for managers/team leads)
      if (userId && userRole && (userRole === 'manager' || userRole === 'team_lead')) {
        // First check if manager has any project assignments at all
        const checkAssignmentsQuery = `
          SELECT COUNT(*) as count
          FROM project_assignments
          WHERE assigned_to_user_id = ?
        `;
        
        pool.execute(checkAssignmentsQuery, [userId], (checkAssignErr, checkAssignRows) => {
          if (checkAssignErr) {
            console.error("Check assignments error:", checkAssignErr);
            return res.status(500).json({ error: "Database error" });
          }
          
          const hasAnyAssignments = checkAssignRows[0]?.count > 0;
          
          if (hasAnyAssignments) {
            // Manager has assignments - verify user has access to requested projects
            const placeholders = projectIds.map(() => '?').join(',');
            const checkAccessQuery = `
              SELECT DISTINCT project_id FROM project_assignments 
              WHERE project_id IN (${placeholders}) AND assigned_to_user_id = ?
            `;
            pool.execute(checkAccessQuery, [...projectIds, userId], (checkErr, checkRows) => {
              if (checkErr) {
                console.error("Access check error:", checkErr);
                return res.status(500).json({ error: "Database error" });
              }
              if (!checkRows || checkRows.length === 0) {
                return res.json([]); // No access to these specific projects, return empty
              }

              // User has access, return employees for these projects
              const employeePlaceholders = projectIds.map(() => '?').join(',');
              query = `
                SELECT DISTINCT 
                  u.id, 
                  u.username, 
                  u.email, 
                  u.role, 
                  u.available_hours_per_week 
                FROM users u
                INNER JOIN project_team_members ptm ON u.id = ptm.user_id
                WHERE ptm.project_id IN (${employeePlaceholders})
                ORDER BY u.username
              `;
              params = projectIds;
              pool.execute(query, params, (err, results) => {
                if (err) {
                  console.error("Employees filter error:", err);
                  return res.status(500).json({ error: "Failed to fetch employees" });
                }
                res.json(results);
              });
            });
          } else {
            // Manager has no assignments at all - show employees for requested projects
            const employeePlaceholders = projectIds.map(() => '?').join(',');
            query = `
              SELECT DISTINCT 
                u.id, 
                u.username, 
                u.email, 
                u.role, 
                u.available_hours_per_week 
              FROM users u
              INNER JOIN project_team_members ptm ON u.id = ptm.user_id
              WHERE ptm.project_id IN (${employeePlaceholders})
              ORDER BY u.username
            `;
            params = projectIds;
            pool.execute(query, params, (err, results) => {
              if (err) {
                console.error("Employees filter error:", err);
                return res.status(500).json({ error: "Failed to fetch employees" });
              }
              res.json(results);
            });
          }
        });
        return;
      } else {
        // Super admin or employee - no access check
        if (projectIds.length === 1) {
          query = `
            SELECT DISTINCT 
              u.id, 
              u.username, 
              u.email, 
              u.role, 
              u.available_hours_per_week 
            FROM users u
            INNER JOIN project_team_members ptm ON u.id = ptm.user_id
            WHERE ptm.project_id = ?
            ORDER BY u.username
          `;
          params = [projectIds[0]];
        } else {
          const placeholders = projectIds.map(() => '?').join(',');
          query = `
            SELECT DISTINCT 
              u.id, 
              u.username, 
              u.email, 
              u.role, 
              u.available_hours_per_week 
            FROM users u
            INNER JOIN project_team_members ptm ON u.id = ptm.user_id
            WHERE ptm.project_id IN (${placeholders})
            ORDER BY u.username
          `;
          params = projectIds;
        }
      }
    }
  } else {
    // No project filter - return employees based on user role
    if (userId && userRole && (userRole === 'manager' || userRole === 'team_lead')) {
      // First check if manager has any project assignments
      const checkAssignmentsQuery = `
        SELECT COUNT(*) as count
        FROM project_assignments
        WHERE assigned_to_user_id = ?
      `;
      
      pool.execute(checkAssignmentsQuery, [userId], (checkErr, checkRows) => {
        if (checkErr) {
          console.error("Check assignments error:", checkErr);
          return res.status(500).json({ error: "Database error" });
        }
        
        const hasAssignments = checkRows[0]?.count > 0;
        
        if (hasAssignments) {
          // Manager has assignments - show employees from assigned projects
          query = `
            SELECT DISTINCT 
              u.id, 
              u.username, 
              u.email, 
              u.role, 
              u.available_hours_per_week 
            FROM users u
            INNER JOIN project_team_members ptm ON u.id = ptm.user_id
            INNER JOIN project_assignments pa ON ptm.project_id = pa.project_id
            WHERE pa.assigned_to_user_id = ?
            ORDER BY u.username
          `;
          params = [userId];
        } else {
          // Manager has no assignments - show empty (security: don't show other managers' data)
          return res.json([]);
        }
        
        pool.execute(query, params, (err, results) => {
          if (err) {
            console.error("Employees filter error:", err);
            return res.status(500).json({ error: "Failed to fetch employees" });
          }
          res.json(results);
        });
      });
      return;
    } else if (userId && userRole && userRole === 'employee') {
      // Employee: show only themselves
      query = "SELECT id, username, email, role, available_hours_per_week FROM users WHERE id = ? ORDER BY username";
      params = [userId];
    } else {
      // Super admin - return all employees
      query = "SELECT id, username, email, role, available_hours_per_week FROM users ORDER BY username";
      params = [];
    }
  }

  pool.execute(query, params, (err, results) => {
    if (err) {
      console.error("Employees filter error:", err);
      return res.status(500).json({ error: "Failed to fetch employees" });
    }
    res.json(results);
  });
});

// Get task status distribution for pie chart
app.get("/api/dashboard/task-status", (req, res) => {
  const { projectId, employeeId, startDate, endDate, userId, userRole } = req.query;

  console.log("Task status request with filters:", { projectId, employeeId, startDate, endDate, userId, userRole });

  // Build dynamic query based on filters - using due_date for consistency
  let whereConditions = [];
  let queryParams = [];
  let joinClause = "";

  // Helper function to build and execute the query
  function buildAndExecuteTaskStatusQuery() {
    // Handle multiple projectIds (comma-separated string)
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

    // For employees: if no employeeId provided, default to their own userId
    // This ensures employees always see their own task status
    if (userRole === 'employee' && (!employeeId || employeeId === "all") && userId) {
      whereConditions.push("t.assignee_id = ?");
      queryParams.push(userId);
    }
    // Handle multiple employeeIds (comma-separated string)
    else if (employeeId && employeeId !== "all") {
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
    }

    // Filter by date using COALESCE(due_date, created_at) to include tasks without due_date
    if (startDate) {
      whereConditions.push("DATE(COALESCE(t.due_date, t.created_at)) >= ?");
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push("DATE(COALESCE(t.due_date, t.created_at)) <= ?");
      queryParams.push(endDate);
    }

    const whereClause =
      whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const query = `
      SELECT 
        t.status,
        COUNT(*) as count
      FROM tasks t
      ${joinClause}
      ${whereClause}
      GROUP BY t.status
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
          statusData[row.status] = parseInt(row.count) || 0;
        }
      });

      // Calculate totals
      const totalTasks = statusData.todo + statusData.in_progress + statusData.completed + statusData.blocked;
      const completedTasks = statusData.completed;
      const pendingTasks = statusData.todo + statusData.in_progress + statusData.blocked;
      
      console.log("Task status response:", { ...statusData, totalTasks, completedTasks, pendingTasks });

      res.json({
        ...statusData,
        totalTasks,
        completed: completedTasks,
        pending: pendingTasks
      });
    });
  }

  // If user is manager/team_lead, filter tasks by their assigned projects
  if (userId && userRole && (userRole === 'manager' || userRole === 'team_lead')) {
    // First check if manager has any project assignments
    const checkAssignmentsQuery = `
      SELECT COUNT(*) as count
      FROM project_assignments
      WHERE assigned_to_user_id = ?
    `;
    
    pool.execute(checkAssignmentsQuery, [userId], (checkErr, checkRows) => {
      if (checkErr) {
        console.error("Check assignments error:", checkErr);
        return res.status(500).json({ error: "Database error" });
      }
      
      const hasAssignments = checkRows[0]?.count > 0;
      
      if (hasAssignments) {
        // Manager has assignments - filter by assigned projects
        whereConditions.push("t.project_id IN (SELECT project_id FROM project_assignments WHERE assigned_to_user_id = ?)");
        queryParams.push(userId);
      } else {
        // Manager has no assignments - return empty task status
        return res.json({
          todo: 0,
          in_progress: 0,
          completed: 0,
          blocked: 0,
          totalTasks: 0
        });
      }
      
      // Continue with the rest of the query building
      buildAndExecuteTaskStatusQuery();
    });
  } else {
    // Super admin or employee - build and execute query directly
    buildAndExecuteTaskStatusQuery();
  }
});

// Role-aware tasks timeline for dashboard (this week and next week)
app.get("/api/dashboard/tasks-timeline", (req, res) => {
  try {
    const { role, userId, projectId, employeeId } = req.query;

    // Base conditions
    const conditions = [];
    const params = [];
    let joinClause = "";

    // If manager/team_lead, always filter by their assigned projects
    if (userId && role && (role === 'manager' || role === 'team_lead')) {
      conditions.push("t.project_id IN (SELECT project_id FROM project_assignments WHERE assigned_to_user_id = ?)");
      params.push(userId);
    }

    // Role restriction: employees only see own tasks unless employeeId provided
    if (employeeId && employeeId !== "all") {
      const employeeIds = String(employeeId).split(',').map(id => id.trim()).filter(id => id);
      if (employeeIds.length > 0) {
        if (employeeIds.length === 1) {
          conditions.push("t.assignee_id = ?");
          params.push(employeeIds[0]);
        } else {
          const placeholders = employeeIds.map(() => '?').join(',');
          conditions.push(`t.assignee_id IN (${placeholders})`);
          params.push(...employeeIds);
        }
      }
    } else if (role === "employee") {
      conditions.push("t.assignee_id = ?");
      params.push(userId);
    }

    // Handle multiple projectIds
    if (projectId && projectId !== "all") {
      const projectIds = String(projectId).split(',').map(id => id.trim()).filter(id => id);
      if (projectIds.length > 0) {
        if (projectIds.length === 1) {
          conditions.push("t.project_id = ?");
          params.push(projectIds[0]);
        } else {
          const placeholders = projectIds.map(() => '?').join(',');
          conditions.push(`t.project_id IN (${placeholders})`);
          params.push(...projectIds);
        }
      }
    }

    // Format date as YYYY-MM-DD in local timezone
    function formatDate(d) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Calculate week boundaries based on current date
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Reset to start of day
    
    // This Week: From today up to and including next Saturday
    const todayStr = formatDate(now);
    
    // Calculate next Saturday from today
    const daysUntilSaturday = (6 - now.getDay() + 7) % 7; // Saturday is day 6
    const endOfThisWeek = new Date(now);
    if (daysUntilSaturday === 0) {
      // If today is Saturday, end of this week is today
      endOfThisWeek.setDate(now.getDate());
    } else {
      // Otherwise, end of this week is next Saturday
      endOfThisWeek.setDate(now.getDate() + daysUntilSaturday);
    }
    endOfThisWeek.setHours(23, 59, 59, 999);
    const endOfThisWeekStr = formatDate(endOfThisWeek);
    
    // Next Week: From Sunday after this week's Saturday onwards (7 days)
    const startOfNextWeek = new Date(endOfThisWeek);
    startOfNextWeek.setDate(endOfThisWeek.getDate() + 1); // Sunday
    startOfNextWeek.setHours(0, 0, 0, 0);
    const startOfNextWeekStr = formatDate(startOfNextWeek);
    
    // Next week ends on Saturday (7 days from start)
    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setDate(startOfNextWeek.getDate() + 6); // +6 days = Saturday
    endOfNextWeek.setHours(23, 59, 59, 999);
    const endOfNextWeekStr = formatDate(endOfNextWeek);

    // Debug logging
    console.log("Week boundaries calculated:", {
      today: todayStr,
      thisWeek: { start: todayStr, end: endOfThisWeekStr },
      nextWeek: { start: startOfNextWeekStr, end: endOfNextWeekStr },
      currentDayOfWeek: now.getDay(), // 0=Sunday, 6=Saturday
    });

    // FIXED: Fetch ALL tasks first (no date filter), then categorize by week
    // This ensures all tasks are visible, not just those in current/next week
    const dateField = "COALESCE(NULLIF(t.due_date, ''), t.created_at)";
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Fetch ALL tasks matching the filters (no date range restriction)
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

      // Categorize tasks into this week and next week based on their due dates
      const thisWeekTasks = [];
      const nextWeekTasks = [];

      allRows.forEach(row => {
        // Prioritize due_date over created_at for categorization
        let taskDate = null;
        
        // First, try to use due_date if it exists and is not empty
        if (row.due_date && row.due_date !== '' && row.due_date !== null) {
          // due_date might be a Date object or a string
          if (row.due_date instanceof Date) {
            taskDate = formatDate(row.due_date);
          } else {
            // If it's a string, try to parse it
            const dueDateObj = new Date(row.due_date);
            if (!isNaN(dueDateObj.getTime())) {
              taskDate = formatDate(dueDateObj);
            }
          }
        }
        
        // If no valid due_date, use task_date from query (which uses COALESCE)
        if (!taskDate && row.task_date) {
          if (row.task_date instanceof Date) {
            taskDate = formatDate(row.task_date);
          } else {
            // Extract date part if it includes time
            const dateStr = String(row.task_date).split(' ')[0];
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
              taskDate = dateStr;
            } else {
              const dateObj = new Date(row.task_date);
              if (!isNaN(dateObj.getTime())) {
                taskDate = formatDate(dateObj);
              }
            }
          }
        }
        
        // Last resort: use created_at
        if (!taskDate && row.created_at) {
          const createdDate = new Date(row.created_at);
          if (!isNaN(createdDate.getTime())) {
            taskDate = formatDate(createdDate);
          }
        }

        // Debug logging for tasks with due dates
        if (row.due_date && row.due_date !== '' && row.due_date !== null) {
          console.log(`Task "${row.title}" - due_date: ${row.due_date}, taskDate: ${taskDate}, today: ${todayStr}, thisWeekEnd: ${endOfThisWeekStr}, nextWeekStart: ${startOfNextWeekStr}, nextWeekEnd: ${endOfNextWeekStr}`);
        }

        if (taskDate) {
          // Compare dates as strings (YYYY-MM-DD format)
          // This week: from today to end of this week (Saturday)
          if (taskDate >= todayStr && taskDate <= endOfThisWeekStr) {
            thisWeekTasks.push(row);
          } 
          // Next week: from start of next week (Sunday) to end of next week (Saturday)
          else if (taskDate >= startOfNextWeekStr && taskDate <= endOfNextWeekStr) {
            nextWeekTasks.push(row);
          } 
          // Past tasks: show in this week for visibility
          else if (taskDate < todayStr) {
            thisWeekTasks.push(row);
          }
          // Future tasks beyond next week: show in next week for visibility
          else {
            nextWeekTasks.push(row);
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

      const availableHoursPerWeek = parseFloat(userRows[0].available_hours_per_week) || 40;

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

          const currentWorkload = parseFloat(workloadRows[0].total_planned_hours) || 0;
          const currentTaskCount = parseInt(workloadRows[0].task_count) || 0;

          // Calculate total workload including new task
          const totalWorkload = currentWorkload + parseFloat(planned_hours);

          // Calculate available capacity for the week
          // Total capacity per week
          const totalCapacityPerWeek = availableHoursPerWeek;
          
          // Remaining available hours (like dashboard calculation)
          const remainingAvailableHours = Math.max(0, availableHoursPerWeek - currentWorkload);
          
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
  
  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";
  
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
      return res.status(500).json({ error: "Database error", details: err.message });
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
    const [userRows] = await pool.promise().execute(
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
    res
      .status(500)
      .json({
        error: "Failed to debug workload validation",
        details: error.message,
      });
  }
});

// ==================== DASHBOARD DIAGNOSTIC ENDPOINT ====================
// Diagnostic endpoint to check dashboard data for a specific user (like hemanth)
app.get("/api/dashboard/diagnostic", (req, res) => {
  const { userId, username } = req.query;
  
  if (!userId && !username) {
    return res.status(400).json({ error: "userId or username is required" });
  }

  let userQuery = "SELECT id, username, role FROM users WHERE ";
  let userParams = [];
  
  if (userId) {
    userQuery += "id = ?";
    userParams = [userId];
  } else {
    userQuery += "username LIKE ?";
    userParams = [`%${username}%`];
  }

  pool.execute(userQuery, userParams, (err, users) => {
    if (err) {
      console.error("Error finding user:", err);
      return res.status(500).json({ error: "Database error", details: err.message });
    }

    if (!users || users.length === 0) {
      return res.json({ 
        error: "User not found",
        message: `No user found with ${userId ? `id ${userId}` : `username like ${username}`}`
      });
    }

    const user = users[0];
    const diagnostic = {
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      },
      projectAssignments: [],
      taskStatistics: null,
      teamMembers: null,
      sampleTasks: [],
      recommendations: []
    };

    // Check project assignments
    pool.execute(
      `SELECT pa.*, p.name as project_name 
       FROM project_assignments pa 
       INNER JOIN projects p ON pa.project_id = p.id 
       WHERE pa.assigned_to_user_id = ?`,
      [user.id],
      (err, assignments) => {
        if (err) {
          console.error("Error checking assignments:", err);
          return res.status(500).json({ error: "Database error", details: err.message });
        }

        diagnostic.projectAssignments = assignments || [];
        
        if (diagnostic.projectAssignments.length === 0 && (user.role === 'manager' || user.role === 'team_lead')) {
          diagnostic.recommendations.push("⚠️ User has NO project assignments! Assign projects via Project Assignments feature.");
        }

        // Check tasks in assigned projects
        if (diagnostic.projectAssignments.length > 0) {
          const projectIds = diagnostic.projectAssignments.map(a => a.project_id);
          const placeholders = projectIds.map(() => '?').join(',');

          pool.execute(
            `SELECT 
              COUNT(*) as task_count, 
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
              SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo_count,
              SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
              SUM(COALESCE(planned_hours, 0)) as total_planned,
              SUM(COALESCE(actual_hours, 0)) as total_actual
             FROM tasks 
             WHERE project_id IN (${placeholders})`,
            projectIds,
            (err, taskStats) => {
              if (err) {
                console.error("Error checking tasks:", err);
                return res.status(500).json({ error: "Database error", details: err.message });
              }

              const stats = taskStats[0];
              diagnostic.taskStatistics = {
                totalTasks: parseInt(stats.task_count) || 0,
                completed: parseInt(stats.completed_count) || 0,
                todo: parseInt(stats.todo_count) || 0,
                inProgress: parseInt(stats.in_progress_count) || 0,
                totalPlannedHours: parseFloat(stats.total_planned) || 0,
                totalActualHours: parseFloat(stats.total_actual) || 0,
                productivity: stats.task_count > 0 
                  ? ((stats.completed_count / stats.task_count) * 100).toFixed(1) + '%'
                  : '0%'
              };

              if (diagnostic.taskStatistics.totalTasks === 0) {
                diagnostic.recommendations.push("⚠️ No tasks found in assigned projects! Create tasks in the assigned projects.");
              }

              // Get sample tasks
              pool.execute(
                `SELECT 
                  t.id,
                  t.name,
                  t.status,
                  t.due_date,
                  t.created_at,
                  DATE(COALESCE(t.due_date, t.created_at)) as task_date,
                  t.planned_hours,
                  t.actual_hours,
                  u.username as assignee
                 FROM tasks t
                 LEFT JOIN users u ON t.assignee_id = u.id
                 WHERE t.project_id IN (${placeholders})
                 ORDER BY DATE(COALESCE(t.due_date, t.created_at)) DESC
                 LIMIT 10`,
                projectIds,
                (err, sampleTasks) => {
                  if (!err) {
                    diagnostic.sampleTasks = sampleTasks || [];
                  }

                  // Check team members
                  pool.execute(
                    `SELECT COUNT(DISTINCT ptm.user_id) as member_count,
                     SUM(COALESCE(u.available_hours_per_week, 40)) as total_available_hours
                     FROM project_team_members ptm
                     INNER JOIN users u ON ptm.user_id = u.id
                     WHERE ptm.project_id IN (${placeholders})`,
                    projectIds,
                    (err, memberStats) => {
                      if (!err && memberStats.length > 0) {
                        diagnostic.teamMembers = {
                          totalMembers: parseInt(memberStats[0].member_count) || 0,
                          totalAvailableHours: parseFloat(memberStats[0].total_available_hours) || 0
                        };
                        
                        if (diagnostic.teamMembers.totalMembers === 0) {
                          diagnostic.recommendations.push("⚠️ No team members found in assigned projects! Add team members to the projects.");
                        }
                      }

                      res.json(diagnostic);
                    }
                  );
                }
              );
            }
          );
        } else {
          res.json(diagnostic);
        }
      }
    );
  });
});

// ==================== TASK REMINDER SCHEDULER ====================

// Schedule task reminders to run daily at 9:00 AM
// Cron format: minute hour day month dayOfWeek
// '0 9 * * *' means: at 9:00 AM every day
cron.schedule('0 9 * * *', async () => {
  console.log('=== Running scheduled task reminders ===');
  console.log(`Scheduled job started at: ${new Date().toISOString()}`);
  
  // Check and send reminders for tasks due in 1 day
  await checkAndSendBeforeDueReminders();
  
  // Check and send reminders for overdue tasks
  await checkAndSendOverdueReminders();
  
  console.log('=== Scheduled task reminders completed ===');
});

// Manual trigger endpoint for testing (can be removed in production or secured)
app.post("/api/tasks/trigger-reminders", (req, res) => {
  console.log('Manual trigger for task reminders requested');
  checkAndSendBeforeDueReminders();
  checkAndSendOverdueReminders();
  res.json({ 
    message: "Task reminder checks triggered manually",
    timestamp: new Date().toISOString()
  });
});

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, "../frontend/build")));

// Create task_daily_updates table if it doesn't exist
pool.execute(`
  CREATE TABLE IF NOT EXISTS task_daily_updates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT NOT NULL,
    user_id INT NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_task_id (task_id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
  )
`, (err) => {
  if (err) {
    console.error('Error creating task_daily_updates table:', err.message);
  } else {
    console.log('✅ task_daily_updates table ready');
  }
});

const PORT = process.env.PORT || 5005;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Task reminder scheduler is active. Reminders will be sent daily at 9:00 AM.');
});