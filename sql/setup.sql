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
    status ENUM('active', 'planning', 'completed') DEFAULT 'planning',
    team_lead_id INT,
    progress INT DEFAULT 0,
    FOREIGN KEY (team_lead_id) REFERENCES team_members(id)
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

INSERT INTO projects (name, status, team_lead_id, progress) VALUES
('E-Commerce Platform', 'active', 2, 65),
('Mobile App', 'planning', 3, 25),
('Analytics Dashboard', 'completed', 4, 100);

INSERT INTO tasks (name, status, priority, assignee_id, project_id, planned_hours, actual_hours, week_number) VALUES
('API Integration', 'in_progress', 'high', 3, 1, 24, 20, 51),
('Database Optimization', 'todo', 'medium', 2, 1, 16, 0, 51),
('User Authentication', 'in_progress', 'high', 3, 2, 20, 15, 51),
('UI Components', 'completed', 'low', 4, 1, 8, 8, 51);

