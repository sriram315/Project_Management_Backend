const mysql = require('mysql2');

const pool = mysql.createPool({
    host: '217.21.90.204',
    user: 'u635298195_pmp',
    password: '>1BC/=Nf1',
    database: 'u635298195_pmp',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Adding additional configurations to handle connection issues
    ssl: {
        rejectUnauthorized: false
    },
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Test the connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Database Connection failed:', err);
        return;
    }
    console.log('Successfully connected to the database.');
    connection.release();
});

module.exports = pool.promise();