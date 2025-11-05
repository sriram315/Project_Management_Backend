const mysql = require('mysql2');

const pool = mysql.createPool({
    host: '217.21.90.204',
    user: 'u635298195_pmp',
    password: '>1BC/=Nf1',
    database: 'u635298195_pmp',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Add dummy data without fake progress - progress will be calculated automatically
const dummyProjects = [
    ['E-Commerce Platform', 'A comprehensive e-commerce solution with payment integration', 'active', 50000.00, 1200, '2024-01-01', '2024-06-30'],
    ['Mobile App', 'Cross-platform mobile application for iOS and Android', 'active', 30000.00, 800, '2024-02-01', '2024-08-31'],
    ['Analytics Dashboard', 'Real-time analytics and reporting dashboard', 'completed', 20000.00, 400, '2023-10-01', '2024-01-15'],
    ['CRM System', 'Customer relationship management system', 'active', 75000.00, 1500, '2024-03-01', '2024-09-30'],
    ['Inventory Management', 'Stock tracking and management system', 'inactive', 25000.00, 600, '2024-01-15', '2024-05-15'],
    ['Learning Management System', 'Online education platform', 'dropped', 100000.00, 2000, '2023-12-01', '2024-12-31'],
    ['Social Media App', 'Social networking application', 'active', 60000.00, 1000, '2024-02-15', '2024-07-15'],
    ['Payment Gateway', 'Secure payment processing system', 'completed', 40000.00, 500, '2023-11-01', '2024-02-28'],
    ['Healthcare Management', 'Patient records and appointment system', 'active', 90000.00, 1800, '2024-04-01', '2024-10-31'],
    ['Food Delivery App', 'Restaurant and food delivery platform', 'active', 45000.00, 900, '2024-03-15', '2024-08-15'],
    ['Banking System', 'Core banking and transaction system', 'inactive', 150000.00, 3000, '2024-01-01', '2024-12-31'],
    ['Real Estate Portal', 'Property listing and management platform', 'dropped', 35000.00, 700, '2024-02-01', '2024-09-30']
];

// Clear existing projects and insert dummy data
pool.execute('DELETE FROM projects', (err) => {
    if (err) {
        console.error('Error clearing projects:', err);
    } else {
        console.log('Cleared existing projects');
        
        // Insert dummy data one by one
        let dataCompleted = 0;
        dummyProjects.forEach((project, index) => {
            const query = 'INSERT INTO projects (name, description, status, budget, estimated_hours, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)';
            pool.execute(query, project, (err, results) => {
                if (err) {
                    console.error(`Error inserting project ${index + 1}:`, err);
                } else {
                    console.log(`Successfully inserted project ${index + 1}: ${project[0]}`);
                }
                dataCompleted++;
                if (dataCompleted === dummyProjects.length) {
                    console.log('All dummy data inserted successfully!');
                    process.exit(0);
                }
            });
        });
    }
});
