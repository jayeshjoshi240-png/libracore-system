const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database('./libracore.db');

db.serialize(() => {
    // Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        email TEXT UNIQUE, 
        username TEXT UNIQUE, 
        password TEXT, 
        role TEXT DEFAULT 'user'
    )`);

    // Books Table with Physical Tracking & Study Metadata
    db.run(`CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT, 
        author TEXT, 
        genre TEXT,
        status TEXT DEFAULT 'Available',
        owner TEXT, 
        borrowed_by TEXT, 
        due_date DATETIME,
        shelf_location TEXT DEFAULT 'Rack-A1 / Shelf-1',
        condition TEXT DEFAULT 'Mint',
        study_notes TEXT DEFAULT 'Standard reference text.',
        rating INTEGER DEFAULT 0, 
        version INTEGER DEFAULT 1
    )`);

    // FIFO Reservations / Waitlist Table
    db.run(`CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER,
        user TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(book_id, user)
    )`);

    // Chain of Custody & Audit Ledger
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        book_id INTEGER, 
        action TEXT, 
        user TEXT, 
        details TEXT DEFAULT '',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Seed Admin Account
    db.get("SELECT count(*) as count FROM users", (err, row) => {
        if (row && row.count === 0) {
            const adminHash = bcrypt.hashSync('admin123', 8);
            db.run(`INSERT INTO users (email, username, password, role) VALUES ('admin@libracore.com', 'Admin_Prime', ?, 'admin')`, [adminHash]);
        }
    });

    // Seed 10 Technical & Academic Books with Coordinates & Notes
    db.get("SELECT count(*) as count FROM books", (err, row) => {
        if (row && row.count === 0) {
            const insert = db.prepare(`INSERT INTO books 
                (title, author, genre, owner, shelf_location, condition, study_notes) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`);

            const catalog = [
                ["Mastering Java OOP & Concurrency", "James Gosling", "Computer Science", "System", "Rack-CS-01 / Shelf-A", "Mint", "Core reference for SYECS semester lab exams."],
                ["Advanced SQL: Lock Protocols & Normalization", "A. Silberschatz", "Database Management", "System", "Rack-DB-02 / Shelf-B", "Mint", "Includes 2PL, OCC, and BCNF worked examples."],
                ["8086 & 8051 Microprocessor Architecture", "Hardware Specs", "Engineering", "System", "Rack-HW-04 / Shelf-C", "Good", "Covers pin configurations and assembly interrupt routines."],
                ["The Evolution of ISRO & Space Tech", "Vikram Sarabhai", "Space Exploration", "System", "Rack-SP-01 / Shelf-A", "Mint", "Case studies on PSLV autonomy and mission budgets."],
                ["Deep Space Telescopes: Hubble to JWST", "NASA Archives", "Space Exploration", "System", "Rack-SP-02 / Shelf-B", "Good", "High-res optical instrumentation diagrams."],
                ["Meru Prastara & Ancient Algorithmic Math", "Pingala", "History & Math", "System", "Rack-MA-03 / Shelf-A", "Mint", "Historical binary combinatorics & combinatoric trees."],
                ["Cybersecurity Threats in Cloud Platforms", "Tech Consortium", "Cybersecurity", "System", "Rack-CS-02 / Shelf-C", "Good", "Covers mitigation vectors for zero-day exploits."],
                ["Digital Payments & Behavioral Economics", "FinTech Research", "Business", "System", "Rack-EC-01 / Shelf-B", "Mint", "Analyzes UPI transactional adoption frameworks."],
                ["Clean Code Architecture in Java", "Robert C. Martin", "Software Engineering", "System", "Rack-CS-03 / Shelf-A", "Good", "Principles of SOLID design and unit testing patterns."],
                ["Relational Dependency Theory", "E.F. Codd", "Database Management", "System", "Rack-DB-01 / Shelf-C", "Fair", "Covers Armstrong axioms and lossless joins."]
            ];

            catalog.forEach(b => insert.run(b[0], b[1], b[2], b[3], b[4], b[5], b[6]));
            insert.finalize();
        }
    });
});

module.exports = db;