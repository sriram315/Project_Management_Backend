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
        console.log('Setting up basic database structure...');
        
        // Drop existing tables to start fresh (in correct order due to foreign keys)
        await db.promise().execute('SET FOREIGN_KEY_CHECKS = 0');
        await db.promise().execute('DROP TABLE IF EXISTS tasks');
        await db.promise().execute('DROP TABLE IF EXISTS projects');
        await db.promise().execute('DROP TABLE IF EXISTS team_members');
        await db.promise().execute('DROP TABLE IF EXISTS users');
        await db.promise().execute('SET FOREIGN_KEY_CHECKS = 1');

        // Create basic tables
        console.log('Creating basic tables...');
        
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
                budget DECIMAL(10,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (team_lead_id) REFERENCES team_members(id)
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (assignee_id) REFERENCES team_members(id),
                FOREIGN KEY (project_id) REFERENCES projects(id)
            )
        `);

        // Insert basic users
        console.log('Inserting basic users...');
        
        await db.promise().execute(`
            INSERT INTO users (username, password, role, email) VALUES
            ('john.manager', 'password123', 'manager', 'john.manager@company.com'),
            ('sarah.lead', 'password123', 'team_lead', 'sarah.lead@company.com'),
            ('mike.dev', 'password123', 'employee', 'mike.dev@company.com')
        `);

        console.log('Database setup completed successfully!');
        console.log('✅ Basic structure ready for step-by-step development');
        
        process.exit(0);
        
    } catch (error) {
        console.error('Database setup failed:', error);
        process.exit(1);
    }
};

setupDatabase();
