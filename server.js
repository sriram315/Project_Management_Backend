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
  // Accept friendly 'inactive' and convert to DB-compatible value
  if (updateData.status === 'inactive') {
    // Prefer on_hold; if schema doesn't support it, treat at least consistently on read via normalization
    updateData.status = 'on_hold';
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

    // Helper function to build and execute dashboard data queries
    function continueDashboardDataQuery(hasAssignments = false) {
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
      // This ensures employees always see their own data
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

      if (startDate) {
        whereConditions.push("DATE(COALESCE(t.due_date, t.created_at)) >= ?");
        queryParams.push(startDate);
      }

      if (endDate) {
        whereConditions.push("DATE(COALESCE(t.due_date, t.created_at)) <= ?");
        queryParams.push(endDate);
      }

      const whereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.join(" AND ")}`
          : "";

      // For productivity, only consider completed tasks
      const productivityWhereClause =
        whereClause && whereClause.trim().length > 0
          ? `${whereClause} AND t.status = 'completed'`
          : "WHERE t.status = 'completed'";

      // ✅ Utilization Query: (planned_hours / available_hours) * 100
      // Use COALESCE(due_date, created_at) to avoid dropping tasks without due_date
      // Join directly with users since tasks.assignee_id references users.id (not team_members.id)
      const utilizationQuery = `
      SELECT 
        week,
        SUM(planned_hours) as planned_hours,
        SUM(available_hours) as available_hours,
        ROUND((SUM(planned_hours) / NULLIF(SUM(available_hours), 0)) * 100, 1) as utilization_percentage
      FROM (
        SELECT 
          DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u') as week,
          t.assignee_id,
          SUM(t.planned_hours) as planned_hours,
          MAX(COALESCE(u.available_hours_per_week, 40)) as available_hours
        FROM tasks t
        JOIN users u ON t.assignee_id = u.id
        ${joinClause}
        ${whereClause}
        GROUP BY DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u'), t.assignee_id
      ) as employee_utilization
      GROUP BY week
      ORDER BY week ASC
    `;

      // ✅ Productivity Query: Calculate total actual vs planned hours percentage
      // For all projects/employees: SUM(actual_hours) / SUM(planned_hours) * 100
      // If productivity_rating exists for tasks, use weighted average: SUM(rating * planned_hours) / SUM(planned_hours)
      // Otherwise calculate: SUM(actual_hours) / SUM(planned_hours) * 100
      const productivityQuery = `
      SELECT 
        DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u') as week,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
        SUM(t.actual_hours) as actual_hours,
        SUM(t.planned_hours) as planned_hours,
        CASE 
          WHEN SUM(CASE WHEN t.productivity_rating IS NOT NULL THEN t.planned_hours ELSE 0 END) > 0 THEN
            ROUND(
              SUM(CASE WHEN t.productivity_rating IS NOT NULL THEN t.productivity_rating * t.planned_hours ELSE 0 END) / 
              NULLIF(SUM(CASE WHEN t.productivity_rating IS NOT NULL THEN t.planned_hours ELSE 0 END), 0),
              1
            )
          ELSE
            ROUND((SUM(t.actual_hours) / NULLIF(SUM(t.planned_hours), 0)) * 100, 1)
        END as productivity_percentage
      FROM tasks t
      JOIN users u ON t.assignee_id = u.id
      ${joinClause}
      ${productivityWhereClause}
      GROUP BY DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u')
      ORDER BY week ASC
    `;

      // ✅ Team Availability Query: Total Available Hours - Planned Hours per week
      // Formula: SUM(users.available_hours_per_week) - SUM(tasks.planned_hours WHERE due_date in that week)
      // Positive values = available hours, Negative values = overutilized hours (shown as red bars in chart)
      
      // Build user filter based on project and employee filters
      let userFilterConditions = [];
      let availabilityUserParams = [];
      
      // Handle multiple employeeIds (comma-separated string)
      if (employeeId && employeeId !== "all") {
        const employeeIds = String(employeeId).split(',').map(id => id.trim()).filter(id => id);
        if (employeeIds.length > 0) {
          if (employeeIds.length === 1) {
            userFilterConditions.push("u.id = ?");
            availabilityUserParams.push(employeeIds[0]);
          } else {
            const placeholders = employeeIds.map(() => '?').join(',');
            userFilterConditions.push(`u.id IN (${placeholders})`);
            availabilityUserParams.push(...employeeIds);
          }
        }
      } 
      // Handle multiple projectIds (comma-separated string) - only if no employee filter
      else if (projectId && projectId !== "all") {
        const projectIds = String(projectId).split(',').map(id => id.trim()).filter(id => id);
        if (projectIds.length > 0) {
          if (projectIds.length === 1) {
            userFilterConditions.push("u.id IN (SELECT user_id FROM project_team_members WHERE project_id = ?)");
            availabilityUserParams.push(projectIds[0]);
          } else {
            const placeholders = projectIds.map(() => '?').join(',');
            userFilterConditions.push(`u.id IN (SELECT user_id FROM project_team_members WHERE project_id IN (${placeholders}))`);
            availabilityUserParams.push(...projectIds);
          }
        }
      }
      // If no filters, include all users
      
      const userFilterClause = userFilterConditions.length > 0 
        ? `WHERE ${userFilterConditions.join(" AND ")}`
        : "";
      
      // Get total available hours per week (sum of all relevant users' available_hours_per_week)
      // Include ALL tasks for that week (even completed ones) - no status filter
      // Formula: SUM(users.available_hours_per_week) - SUM(tasks.planned_hours)
      
      // First, calculate total available hours from relevant users (run this as separate query first)
      let totalAvailableQuery = "";
      let totalAvailableParams = [];
      
      // Handle multiple employeeIds
      if (employeeId && employeeId !== "all") {
        const employeeIds = String(employeeId).split(',').map(id => id.trim()).filter(id => id);
        if (employeeIds.length === 1) {
          // Single employee
          totalAvailableQuery = "SELECT COALESCE(SUM(available_hours_per_week), 0) as total FROM users WHERE id = ?";
          totalAvailableParams = [employeeIds[0]];
        } else {
          // Multiple employees
          const placeholders = employeeIds.map(() => '?').join(',');
          totalAvailableQuery = `SELECT COALESCE(SUM(available_hours_per_week), 0) as total FROM users WHERE id IN (${placeholders})`;
          totalAvailableParams = employeeIds;
        }
      } 
      // Handle multiple projectIds - get users from project_team_members
      else if (projectId && projectId !== "all") {
        const projectIds = String(projectId).split(',').map(id => id.trim()).filter(id => id);
        if (projectIds.length === 1) {
          // Single project - get users from project_team_members
          totalAvailableQuery = `
            SELECT COALESCE(SUM(COALESCE(u.available_hours_per_week, 40)), 0) as total
            FROM users u
            INNER JOIN project_team_members ptm ON u.id = ptm.user_id
            WHERE ptm.project_id = ?
          `;
          totalAvailableParams = [projectIds[0]];
        } else {
          // Multiple projects
          const placeholders = projectIds.map(() => '?').join(',');
          totalAvailableQuery = `
            SELECT COALESCE(SUM(COALESCE(u.available_hours_per_week, 40)), 0) as total
            FROM users u
            INNER JOIN project_team_members ptm ON u.id = ptm.user_id
            WHERE ptm.project_id IN (${placeholders})
          `;
          totalAvailableParams = projectIds;
        }
      } 
      // For managers/team leads without project filter, use their assigned projects
      // If manager has no assignments, show all users (like super admin)
      else if (userId && userRole && (userRole === 'manager' || userRole === 'team_lead')) {
        if (hasAssignments) {
          // Manager has assignments - get users from assigned projects
          totalAvailableQuery = `
            SELECT COALESCE(SUM(COALESCE(u.available_hours_per_week, 40)), 0) as total
            FROM users u
            INNER JOIN project_team_members ptm ON u.id = ptm.user_id
            INNER JOIN project_assignments pa ON ptm.project_id = pa.project_id
            WHERE pa.assigned_to_user_id = ?
          `;
          totalAvailableParams = [userId];
        } else {
          // Manager has no assignments - return 0 available hours (shouldn't reach here, but safety check)
          totalAvailableQuery = "SELECT 0 as total";
          totalAvailableParams = [];
        }
      } else {
        // All users
        totalAvailableQuery = "SELECT COALESCE(SUM(COALESCE(available_hours_per_week, 40)), 0) as total FROM users";
        totalAvailableParams = [];
      }
      
      // Simplified approach: Calculate availability per week directly
      // Return negative values for overutilization (when planned > available)
      // Positive values = available hours, Negative values = overutilized hours
      // Note: Week generation will be handled in the merge step, so we just calculate for existing weeks
      const availabilityQuery = `
      SELECT 
        week,
        COALESCE(?, 0) - COALESCE(SUM(total_planned_hours), 0) as available_hours
      FROM (
        SELECT 
          DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u') as week,
          SUM(t.planned_hours) as total_planned_hours
        FROM tasks t
        ${joinClause}
        ${whereClause}
        GROUP BY DATE_FORMAT(COALESCE(t.due_date, t.created_at), '%Y-W%u')
      ) as availability_calc
      GROUP BY week
      ORDER BY week ASC
    `;
      
      // Params: total available hours + where clause params for tasks
      const availabilityParamsBase = [...queryParams];

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

          // First, get total available hours from relevant users
          pool.execute(totalAvailableQuery, totalAvailableParams, (err, totalAvailableRows) => {
            if (err) {
              console.error("Total available hours query error:", err);
              return res
                .status(500)
                .json({ error: "Database error", details: err.message });
            }
            
            const totalAvailableHours = parseFloat(totalAvailableRows[0]?.total) || 0;
            console.log("Total Available Hours (from users):", totalAvailableHours);
            console.log("Total Available Query:", totalAvailableQuery);
            console.log("Total Available Params:", totalAvailableParams);
            
            // Now execute availability query with total available hours as first param
            const availabilityParams = [totalAvailableHours, ...availabilityParamsBase];
            
            console.log("Availability Query:", availabilityQuery.replace(/\s+/g, ' ').substring(0, 500));
            console.log("Availability Params Count:", availabilityParams.length);
            console.log("Availability Params:", availabilityParams);
            
            pool.execute(
              availabilityQuery,
              availabilityParams,
              (err, availabilityRows) => {
                if (err) {
                  console.error("Availability query error:", err);
                  return res
                    .status(500)
                    .json({ error: "Database error", details: err.message });
                }
                
                console.log("Availability Raw Results:", availabilityRows);

                console.log("Utilization rows:", utilizationRows.length);
                console.log("Productivity rows:", productivityRows.length);
                console.log("Availability rows:", availabilityRows.length);
                console.log("Total Available Hours:", totalAvailableHours);
                console.log("Utilization query:", utilizationQuery.replace(/\s+/g, ' ').substring(0, 300));
                console.log("Productivity query:", productivityQuery.replace(/\s+/g, ' ').substring(0, 300));
                console.log("Join clause:", joinClause);
                console.log("Where clause:", whereClause);
                console.log("Query params:", queryParams);

                // ✅ Format individual datasets
                const utilizationData = utilizationRows.map((row) => {
                  const utilPercent = row.utilization_percentage !== null && row.utilization_percentage !== undefined 
                    ? parseFloat(row.utilization_percentage) 
                    : null;
                  return {
                    week: row.week,
                    utilization: (utilPercent !== null && !isNaN(utilPercent)) ? utilPercent : null,
                    availableHours: parseInt(row.available_hours) || 0,
                    plannedHours: parseInt(row.planned_hours) || 0,
                  };
                });

                const productivityData = productivityRows.map((row) => {
                  const prodPercent = row.productivity_percentage !== null && row.productivity_percentage !== undefined 
                    ? parseFloat(row.productivity_percentage) 
                    : null;
                  return {
                    week: row.week,
                    completed: parseInt(row.completed_tasks) || 0,
                    hours: parseFloat(row.actual_hours) || 0,
                    productivity: (prodPercent !== null && !isNaN(prodPercent)) ? prodPercent : null,
                    plannedHours: parseFloat(row.planned_hours) || 0,
                  };
                });

                const availabilityData = availabilityRows.map((row) => {
                  const hours = parseFloat(row.available_hours) || 0;
                  return {
                    week: row.week,
                    availableHours: hours,
                  };
                });

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
                  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
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
                // For weeks with no tasks, use totalAvailableHours as availableHours
                const mergedData = allWeeks.map((week) => {
                  const util = utilizationData.find((d) => d.week === week);
                  const prod = productivityData.find((d) => d.week === week);
                  const avail = availabilityData.find((d) => d.week === week);
                  
                  // For utilization calculation, we need total available hours (from users)
                  // Use util.availableHours if available (from utilization query), otherwise use totalAvailableHours
                  const totalAvailableHoursForWeek = util && util.availableHours > 0 
                    ? util.availableHours 
                    : totalAvailableHours;
                  
                  // For availability chart, use remaining available hours (can be negative for overutilization)
                  const remainingAvailableHours = avail 
                    ? avail.availableHours 
                    : totalAvailableHours; // Use total available hours if no tasks in this week

                  return {
                    week,
                    utilization: util && util.utilization !== null ? util.utilization : null,
                    completed: prod ? prod.completed : 0,
                    hours: prod ? prod.hours : 0,
                    productivity: prod && prod.productivity !== null ? prod.productivity : null,
                    plannedHours: prod ? prod.plannedHours : 0,
                    availableHours: remainingAvailableHours, // For availability chart (remaining hours)
                    totalAvailableHours: totalAvailableHoursForWeek, // For utilization calculation (total hours)
                  };
                });

                console.log(
                  "Merged data weeks:",
                  mergedData.map((d) => d.week)
                );
                console.log(
                  "Sample merged data (first 3 weeks):",
                  mergedData.slice(0, 3).map(d => ({
                    week: d.week,
                    utilization: d.utilization,
                    productivity: d.productivity,
                    plannedHours: d.plannedHours,
                    availableHours: d.availableHours
                  }))
                );
                console.log(
                  "Utilization query results (first 3):",
                  utilizationRows.slice(0, 3)
                );
                console.log(
                  "Productivity query results (first 3):",
                  productivityRows.slice(0, 3)
                );

                // Return all weeks in the date range (similar to how task status returns all tasks)
                // Don't filter out weeks - let the frontend handle display logic
                // This ensures charts always show data for the selected date range
                res.json({
                  utilizationData: mergedData,
                  productivityData: mergedData,
                  availabilityData: mergedData,
                });
              }
            );
          });
        });
      });
    } // End of continueDashboardDataQuery function

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
          // Continue with the rest of the dashboard data query building...
          // Pass hasAssignments flag so totalAvailableQuery can use correct users
          continueDashboardDataQuery(hasAssignments);
        } else {
          // Manager has no assignments - return empty data (security: don't show other managers' data)
          return res.json({
            utilizationData: [],
            productivityData: [],
            availabilityData: [],
          });
        }
      });
    } else {
      // Super admin or employee - build and execute query directly
      continueDashboardDataQuery();
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

  let query;
  let params = [];

  // If userId and userRole are provided and user is manager/team_lead, filter by assignments
  // If manager has no project assignments, show all projects (like super admin)
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
        // Manager has assignments - show assigned projects
        query = `
          SELECT DISTINCT p.id, p.name, p.status
          FROM projects p
          INNER JOIN project_assignments pa ON p.id = pa.project_id
          WHERE pa.assigned_to_user_id = ?
          ORDER BY p.name
        `;
        params = [userId];
        } else {
          // Manager has no assignments - show empty (security: don't show other managers' data)
          return res.json([]);
        }
        
        pool.execute(query, params, (err, results) => {
          if (err) {
            console.error("Projects filter error:", err);
            return res.status(500).json({ error: "Failed to fetch projects" });
          }
          res.json(results);
        });
    });
  } else if (userId && userRole && userRole === 'employee') {
    // For employees, show only projects they are assigned to (via project_team_members)
    query = `
      SELECT DISTINCT p.id, p.name, p.status
      FROM projects p
      INNER JOIN project_team_members ptm ON p.id = ptm.project_id
      WHERE ptm.user_id = ?
      ORDER BY p.name
    `;
    params = [userId];
    
    pool.execute(query, params, (err, results) => {
      if (err) {
        console.error("Projects filter error:", err);
        return res.status(500).json({ error: "Failed to fetch projects" });
      }
      res.json(results);
    });
  } else {
    // Super admin: show all projects
    query = "SELECT id, name, status FROM projects ORDER BY name";
    params = [];
    
    pool.execute(query, params, (err, results) => {
      if (err) {
        console.error("Projects filter error:", err);
        return res.status(500).json({ error: "Failed to fetch projects" });
      }
      res.json(results);
    });
  }
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
    } else {
      // Super admin or employee - return all employees
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
          statusData[row.status] = row.count;
        }
      });

      // Calculate totals for logging
      const totalTasks = statusData.todo + statusData.in_progress + statusData.completed + statusData.blocked;
      console.log("Task status response:", { ...statusData, totalTasks });

      res.json(statusData);
    });
  }

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
        return res.status(500).json({ error: "Database error" });
      }
      
      const hasAssignments = checkRows[0]?.count > 0;
      
      if (hasAssignments) {
        // Manager has assignments - filter by assigned projects
        joinClause = "INNER JOIN project_assignments pa ON t.project_id = pa.project_id";
        whereConditions.push("pa.assigned_to_user_id = ?");
        queryParams.push(userId);
      } else {
        // Manager has no assignments - return empty task status (security: don't show other managers' data)
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
    let joinClause = "";

    // If manager/team_lead, always filter by their assigned projects
    if (userId && role && (role === 'manager' || role === 'team_lead')) {
      joinClause = "INNER JOIN project_assignments pa ON t.project_id = pa.project_id";
      conditions.push("pa.assigned_to_user_id = ?");
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
    
    // ✅ FIXED: Calculate week boundaries based on current date
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

    // Helper for parametrized week query
    const buildQuery = (weekStart, weekEnd, weekLabel) => {
      const allParams = [...params, weekStart, weekEnd];
      const dateField = "COALESCE(NULLIF(t.due_date, ''), t.created_at)";
      let whereClause = `DATE(${dateField}) >= ? AND DATE(${dateField}) <= ?`;
      
      if (conditions.length > 0) {
        whereClause += ' AND ' + conditions.join(' AND ');
      }
      
      const query = `
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
        WHERE ${whereClause}
        ORDER BY COALESCE(NULLIF(t.due_date, ''), t.created_at) ASC, t.created_at DESC
      `;
      
      console.log(`${weekLabel} query params:`, JSON.stringify(allParams));
      console.log(`${weekLabel} date range:`, weekStart, 'to', weekEnd);
      
      return { query, params: allParams };
    };

    const thisWeekQuery = buildQuery(todayStr, endOfThisWeekStr, "This Week");
    const nextWeekQuery = buildQuery(startOfNextWeekStr, endOfNextWeekStr, "Next Week");

    pool.execute(thisWeekQuery.query, thisWeekQuery.params, (err, thisRows) => {
      if (err) {
        console.error("Tasks timeline (this week) error:", err);
        return res.status(500).json({ error: "Database error" });
      }
      console.log("Tasks timeline (this week) results:", thisRows.length, "tasks");
      if (thisRows.length > 0) {
        console.log("Tasks this week:", thisRows.map(r => ({ 
          id: r.id, 
          title: r.title, 
          task_date: r.task_date
        })));
      }
      
      pool.execute(nextWeekQuery.query, nextWeekQuery.params, (err2, nextRows) => {
        if (err2) {
          console.error("Tasks timeline (next week) error:", err2);
          return res.status(500).json({ error: "Database error" });
        }
        console.log("Tasks timeline (next week) results:", nextRows.length, "tasks");
        if (nextRows.length > 0) {
          console.log("Tasks next week:", nextRows.map(r => ({ 
            id: r.id, 
            title: r.title, 
            task_date: r.task_date
          })));
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

        let finalThisWeek = thisRows.map(mapRow);
        let finalNextWeek = nextRows.map(mapRow);
        
        // Fallback logic if both weeks are empty
        if (thisRows.length === 0 && nextRows.length === 0) {
          console.log("Both weeks empty - fetching all active tasks as fallback...");
          const fallbackQuery = `
            SELECT 
              t.id,
              t.name as title,
              u.username as assignee,
              t.status,
              COALESCE(t.planned_hours, 0) AS estimated,
              COALESCE(t.actual_hours, 0) AS logged,
              t.due_date,
              t.created_at,
              DATE(COALESCE(t.due_date, t.created_at)) as task_date
            FROM tasks t
            JOIN users u ON u.id = t.assignee_id
            ${joinClause}
            WHERE ${conditions.length > 0 ? conditions.join(' AND ') : '1=1'}
              AND t.status != 'completed'
            ORDER BY COALESCE(t.due_date, t.created_at) ASC, t.created_at DESC
            LIMIT 20
          `;
          
          pool.execute(fallbackQuery, params, (fallbackErr, fallbackRows) => {
            if (!fallbackErr && fallbackRows.length > 0) {
              console.log("Fallback: Found", fallbackRows.length, "active tasks");
              finalThisWeek = [];
              finalNextWeek = [];
              
              fallbackRows.forEach(row => {
                const mapped = mapRow(row);
                const taskDate = row.task_date ? String(row.task_date) : null;
                
                if (taskDate && taskDate <= endOfThisWeekStr) {
                  finalThisWeek.push(mapped);
                } else {
                  finalNextWeek.push(mapped);
                }
              });
              
              if (finalThisWeek.length === 0 && finalNextWeek.length > 0) {
                finalThisWeek = finalNextWeek;
                finalNextWeek = [];
              }
            }
            
            res.json({
              thisWeek: finalThisWeek,
              nextWeek: finalNextWeek,
            });
          });
        } else {
          res.json({
            thisWeek: finalThisWeek,
            nextWeek: finalNextWeek,
          });
        }
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

const PORT = process.env.PORT || 5005;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Task reminder scheduler is active. Reminders will be sent daily at 9:00 AM.');
});
