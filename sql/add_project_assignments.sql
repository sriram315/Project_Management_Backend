-- Add super_admin to role ENUM
ALTER TABLE users MODIFY COLUMN role ENUM('super_admin', 'manager', 'team_lead', 'employee') NOT NULL;

-- Create project_assignments table
CREATE TABLE IF NOT EXISTS project_assignments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    assigned_to_user_id INT NOT NULL,
    assigned_by_user_id INT,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_project_assignment (project_id, assigned_to_user_id),
    INDEX idx_assigned_to (assigned_to_user_id),
    INDEX idx_project (project_id)
);

