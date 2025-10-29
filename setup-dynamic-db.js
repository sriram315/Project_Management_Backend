const mysql = require('mysql2');

const db = mysql.createConnection({
    host: '217.21.90.204',
    user: 'u635298195_pmp',
    password: '>1BC/=Nf1',
    database: 'u635298195_pmp',
    port: 3306
});

const setupDatabase = async () => {
    try {
        console.log('Setting up database with proper project-team relationships...');
        
        // Drop existing tables to start fresh
        await db.promise().execute('DROP TABLE IF EXISTS tasks');
        await db.promise().execute('DROP TABLE IF EXISTS project_team_members');
        await db.promise().execute('DROP TABLE IF EXISTS projects');
        await db.promise().execute('DROP TABLE IF EXISTS team_members');
        await db.promise().execute('DROP TABLE IF EXISTS users');

        // Create tables with proper relationships
        console.log('Creating tables...');
        
        await db.promise().execute(`
            CREATE TABLE users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('manager', 'team_lead', 'employee') NOT NULL,
                email VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.promise().execute(`
            CREATE TABLE team_members (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                role VARCHAR(50) NOT NULL,
                status ENUM('online', 'away', 'offline') DEFAULT 'offline',
                user_id INT,
                avatar VARCHAR(10),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        await db.promise().execute(`
            CREATE TABLE projects (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                status ENUM('active', 'planning', 'completed') DEFAULT 'planning',
                team_lead_id INT,
                progress INT DEFAULT 0,
                start_date DATE,
                end_date DATE,
                budget DECIMAL(10,2),
                FOREIGN KEY (team_lead_id) REFERENCES team_members(id)
            )
        `);

        await db.promise().execute(`
            CREATE TABLE project_team_members (
                id INT PRIMARY KEY AUTO_INCREMENT,
                project_id INT,
                team_member_id INT,
                allocated_hours_per_week INT DEFAULT 40,
                FOREIGN KEY (project_id) REFERENCES projects(id),
                FOREIGN KEY (team_member_id) REFERENCES team_members(id),
                UNIQUE KEY unique_project_member (project_id, team_member_id)
            )
        `);

        await db.promise().execute(`
            CREATE TABLE tasks (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                status ENUM('todo', 'in_progress', 'completed', 'blocked') DEFAULT 'todo',
                priority ENUM('high', 'medium', 'low') DEFAULT 'medium',
                assignee_id INT,
                project_id INT,
                planned_hours INT DEFAULT 0,
                actual_hours INT DEFAULT 0,
                week_number INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (assignee_id) REFERENCES team_members(id),
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
        `);

        // Insert comprehensive dummy data
        console.log('Inserting users...');
        
        await db.promise().execute(`
            INSERT INTO users (username, password, role, email) VALUES
            ('john.manager', 'password123', 'manager', 'john.manager@company.com'),
            ('sarah.lead', 'password123', 'team_lead', 'sarah.lead@company.com'),
            ('mike.dev', 'password123', 'employee', 'mike.dev@company.com'),
            ('lisa.qa', 'password123', 'employee', 'lisa.qa@company.com'),
            ('john.designer', 'password123', 'employee', 'john.designer@company.com'),
            ('alice.designer', 'password123', 'employee', 'alice.designer@company.com'),
            ('tom.backend', 'password123', 'employee', 'tom.backend@company.com'),
            ('emma.frontend', 'password123', 'employee', 'emma.frontend@company.com'),
            ('david.devops', 'password123', 'employee', 'david.devops@company.com'),
            ('sophia.analyst', 'password123', 'employee', 'sophia.analyst@company.com')
        `);

        console.log('Inserting team members...');
        
        await db.promise().execute(`
            INSERT INTO team_members (name, role, status, user_id, avatar) VALUES
            ('John Manager', 'Manager', 'online', 1, 'JM'),
            ('Sarah Lead', 'Team Lead', 'online', 2, 'SL'),
            ('Mike Dev', 'Senior Developer', 'away', 3, 'MD'),
            ('Lisa QA', 'QA Engineer', 'online', 4, 'LQ'),
            ('John Designer', 'UI/UX Designer', 'offline', 5, 'JD'),
            ('Alice Designer', 'Graphic Designer', 'online', 6, 'AD'),
            ('Tom Backend', 'Backend Developer', 'online', 7, 'TB'),
            ('Emma Frontend', 'Frontend Developer', 'online', 8, 'EF'),
            ('David DevOps', 'DevOps Engineer', 'away', 9, 'DD'),
            ('Sophia Analyst', 'Business Analyst', 'online', 10, 'SA')
        `);

        console.log('Inserting projects...');
        
        await db.promise().execute(`
            INSERT INTO projects (name, description, status, team_lead_id, progress, start_date, end_date, budget) VALUES
            ('E-Commerce Platform', 'Modern e-commerce solution with mobile app integration', 'active', 2, 65, '2024-01-15', '2024-06-30', 150000.00),
            ('Mobile App Development', 'Cross-platform mobile application for iOS and Android', 'planning', 3, 25, '2024-02-01', '2024-08-15', 200000.00),
            ('Analytics Dashboard', 'Real-time analytics and reporting dashboard', 'completed', 4, 100, '2023-10-01', '2024-01-31', 75000.00),
            ('API Gateway', 'Centralized API management and security layer', 'active', 7, 40, '2024-01-01', '2024-05-30', 120000.00),
            ('Cloud Migration', 'Migrate legacy systems to cloud infrastructure', 'planning', 9, 15, '2024-03-01', '2024-12-31', 300000.00),
            ('User Experience Redesign', 'Complete UX/UI overhaul for customer portal', 'active', 5, 30, '2024-02-15', '2024-07-15', 90000.00)
        `);

        console.log('Inserting project-team member relationships...');
        
        // E-Commerce Platform team
        await db.promise().execute(`
            INSERT INTO project_team_members (project_id, team_member_id, allocated_hours_per_week) VALUES
            (1, 2, 40), -- Sarah Lead
            (1, 3, 30), -- Mike Dev
            (1, 4, 25), -- Lisa QA
            (1, 5, 35), -- John Designer
            (1, 7, 20)  -- Tom Backend
        `);

        // Mobile App team
        await db.promise().execute(`
            INSERT INTO project_team_members (project_id, team_member_id, allocated_hours_per_week) VALUES
            (2, 3, 40), -- Mike Dev (Team Lead)
            (2, 5, 30), -- John Designer
            (2, 8, 35), -- Emma Frontend
            (2, 7, 25)  -- Tom Backend
        `);

        // Analytics Dashboard team
        await db.promise().execute(`
            INSERT INTO project_team_members (project_id, team_member_id, allocated_hours_per_week) VALUES
            (3, 4, 40), -- Lisa QA (Team Lead)
            (3, 6, 30), -- Alice Designer
            (3, 10, 25) -- Sophia Analyst
        `);

        // API Gateway team
        await db.promise().execute(`
            INSERT INTO project_team_members (project_id, team_member_id, allocated_hours_per_week) VALUES
            (4, 7, 40), -- Tom Backend (Team Lead)
            (4, 9, 30), -- David DevOps
            (4, 3, 20)  -- Mike Dev
        `);

        // Cloud Migration team
        await db.promise().execute(`
            INSERT INTO project_team_members (project_id, team_member_id, allocated_hours_per_week) VALUES
            (5, 9, 40), -- David DevOps (Team Lead)
            (5, 7, 25), -- Tom Backend
            (5, 10, 20) -- Sophia Analyst
        `);

        // UX Redesign team
        await db.promise().execute(`
            INSERT INTO project_team_members (project_id, team_member_id, allocated_hours_per_week) VALUES
            (6, 5, 40), -- John Designer (Team Lead)
            (6, 6, 30), -- Alice Designer
            (6, 8, 25), -- Emma Frontend
            (6, 10, 15) -- Sophia Analyst
        `);

        console.log('Inserting tasks...');
        
        await db.promise().execute(`
            INSERT INTO tasks (name, description, status, priority, assignee_id, project_id, planned_hours, actual_hours, week_number) VALUES
            ('API Integration', 'Integrate payment gateway and third-party APIs', 'in_progress', 'high', 3, 1, 24, 20, 51),
            ('Database Optimization', 'Optimize database queries and indexing', 'todo', 'medium', 2, 1, 16, 0, 51),
            ('User Authentication', 'Implement OAuth2 and JWT authentication', 'in_progress', 'high', 3, 2, 20, 15, 51),
            ('UI Components', 'Create reusable React components', 'completed', 'low', 4, 1, 8, 8, 51),
            ('Mobile App Testing', 'Comprehensive testing for mobile app', 'todo', 'medium', 4, 2, 12, 0, 52),
            ('Performance Optimization', 'Optimize app performance and loading times', 'todo', 'high', 3, 1, 18, 0, 52),
            ('Documentation Update', 'Update API and user documentation', 'completed', 'low', 5, 3, 6, 6, 50),
            ('Security Audit', 'Conduct security audit and vulnerability assessment', 'in_progress', 'high', 9, 4, 14, 8, 51),
            ('Cloud Infrastructure Setup', 'Set up AWS infrastructure and CI/CD pipeline', 'todo', 'high', 9, 5, 32, 0, 52),
            ('User Research', 'Conduct user research and usability testing', 'in_progress', 'medium', 10, 6, 16, 10, 51),
            ('Design System Creation', 'Create comprehensive design system', 'todo', 'medium', 5, 6, 20, 0, 52),
            ('Backend API Development', 'Develop RESTful APIs for mobile app', 'in_progress', 'high', 7, 2, 28, 18, 51),
            ('Frontend Development', 'Develop responsive web interface', 'todo', 'medium', 8, 1, 24, 0, 52),
            ('Data Migration', 'Migrate data from legacy systems', 'todo', 'high', 7, 5, 40, 0, 53),
            ('Quality Assurance Testing', 'Comprehensive QA testing for all modules', 'todo', 'medium', 4, 4, 20, 0, 52)
        `);

        console.log('Database setup completed successfully!');
        console.log('✅ Users: 10');
        console.log('✅ Team Members: 10');
        console.log('✅ Projects: 6');
        console.log('✅ Project-Team Relationships: 20');
        console.log('✅ Tasks: 15');
        
        process.exit(0);
        
    } catch (error) {
        console.error('Database setup failed:', error);
        process.exit(1);
    }
};

setupDatabase();
