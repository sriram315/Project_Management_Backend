-- Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('manager', 'team_lead', 'employee') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Team Members Table
CREATE TABLE IF NOT EXISTS team_members (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    available_hours INT DEFAULT 40,
    status ENUM('online', 'away', 'offline') DEFAULT 'offline',
    user_id INT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status ENUM('active', 'inactive', 'completed', 'dropped') DEFAULT 'active',
    team_lead_id INT,
    progress INT DEFAULT 0,
    budget DECIMAL(10,2),
    estimated_hours INT,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (team_lead_id) REFERENCES team_members(id)
);

-- Create Project Team Members Table (Links projects to team members with allocated hours)
CREATE TABLE IF NOT EXISTS project_team_members (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    team_member_id INT NOT NULL,
    allocated_hours_per_week INT NOT NULL DEFAULT 40,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE,
    UNIQUE KEY unique_project_team (project_id, team_member_id)
);

-- Create Tasks Table
CREATE TABLE IF NOT EXISTS tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    status ENUM('todo', 'in_progress', 'completed', 'blocked') DEFAULT 'todo',
    priority ENUM('high', 'medium', 'low') DEFAULT 'medium',
    assignee_id INT,
    project_id INT,
    planned_hours INT DEFAULT 0,
    actual_hours INT DEFAULT 0,
    week_number INT,
    FOREIGN KEY (assignee_id) REFERENCES team_members(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- Insert Sample Data
INSERT INTO users (username, password, role) VALUES
('john.manager', 'password123', 'manager'),
('sarah.lead', 'password123', 'team_lead'),
('mike.dev', 'password123', 'employee'),
('lisa.qa', 'password123', 'employee'),
('john.designer', 'password123', 'employee'),
('alice.designer', 'password123', 'employee');

INSERT INTO team_members (name, role, status, user_id) VALUES
('John Manager', 'Manager', 'online', 1),
('Sarah Lead', 'Team Lead', 'online', 2),
('Mike Dev', 'Developer', 'away', 3),
('Lisa QA', 'QA Engineer', 'online', 4),
('John Designer', 'Designer', 'offline', 5),
('Alice Designer', 'Designer', 'online', 6);

INSERT INTO projects (name, description, status, team_lead_id, progress, budget, estimated_hours, start_date, end_date) VALUES
('E-Commerce Platform', 'A comprehensive e-commerce solution with payment integration', 'active', 2, 65, 50000.00, 1200, '2024-01-01', '2024-06-30'),
('Mobile App', 'Cross-platform mobile application for iOS and Android', 'active', 3, 25, 30000.00, 800, '2024-02-01', '2024-08-31'),
('Analytics Dashboard', 'Real-time analytics and reporting dashboard', 'completed', 4, 100, 20000.00, 400, '2023-10-01', '2024-01-15'),
('CRM System', 'Customer relationship management system', 'active', 2, 40, 75000.00, 1500, '2024-03-01', '2024-09-30'),
('Inventory Management', 'Stock tracking and management system', 'inactive', 3, 15, 25000.00, 600, '2024-01-15', '2024-05-15'),
('Learning Management System', 'Online education platform', 'dropped', 4, 5, 100000.00, 2000, '2023-12-01', '2024-12-31'),
('Social Media App', 'Social networking application', 'active', 2, 80, 60000.00, 1000, '2024-02-15', '2024-07-15'),
('Payment Gateway', 'Secure payment processing system', 'completed', 3, 100, 40000.00, 500, '2023-11-01', '2024-02-28'),
('Healthcare Management', 'Patient records and appointment system', 'active', 4, 30, 90000.00, 1800, '2024-04-01', '2024-10-31'),
('Food Delivery App', 'Restaurant and food delivery platform', 'active', 2, 55, 45000.00, 900, '2024-03-15', '2024-08-15'),
('Banking System', 'Core banking and transaction system', 'inactive', 3, 20, 150000.00, 3000, '2024-01-01', '2024-12-31'),
('Real Estate Portal', 'Property listing and management platform', 'dropped', 4, 10, 35000.00, 700, '2024-02-01', '2024-09-30'),
('Fitness Tracking App', 'Personal fitness and health monitoring', 'active', 2, 70, 28000.00, 560, '2024-03-01', '2024-07-31'),
('E-Learning Platform', 'Online courses and certification system', 'completed', 3, 100, 65000.00, 1300, '2023-09-01', '2024-03-31'),
('Supply Chain Management', 'Logistics and supply chain optimization', 'active', 4, 45, 85000.00, 1700, '2024-04-15', '2024-11-30'),
('Chat Application', 'Real-time messaging and communication platform', 'active', 2, 60, 22000.00, 440, '2024-02-20', '2024-06-20'),
('Document Management', 'Digital document storage and collaboration', 'inactive', 3, 25, 18000.00, 360, '2024-01-20', '2024-05-20'),
('IoT Monitoring System', 'Internet of Things device monitoring platform', 'dropped', 4, 8, 120000.00, 2400, '2023-11-15', '2024-11-15'),
('Video Streaming Platform', 'On-demand video content delivery system', 'active', 2, 35, 95000.00, 1900, '2024-03-10', '2024-09-10'),
('Project Management Tool', 'Team collaboration and project tracking system', 'completed', 3, 100, 32000.00, 640, '2023-08-01', '2024-02-29');

INSERT INTO tasks (name, status, priority, assignee_id, project_id, planned_hours, actual_hours, week_number) VALUES
('API Integration', 'in_progress', 'high', 3, 1, 24, 20, 51),
('Database Optimization', 'todo', 'medium', 2, 1, 16, 0, 51),
('User Authentication', 'in_progress', 'high', 3, 2, 20, 15, 51),
('UI Components', 'completed', 'low', 4, 1, 8, 8, 51);

