const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./database');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

io.on('connection', () => console.log('⚡ Nexus Real-Time WebSocket Channel Active'));

// Authentication Endpoint
app.post('/api/auth', (req, res) => {
    const { action, email, username, password } = req.body;
    if (action === 'signup') {
        const hash = bcrypt.hashSync(password, 8);
        db.run(`INSERT INTO users (email, username, password) VALUES (?, ?, ?)`, [email, username, hash], err => {
            if (err) return res.status(400).json({ error: "Email or Username already taken." });
            res.json({ success: true, username, role: 'user' });
        });
    } else {
        db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
            if (!user) return res.status(404).json({ error: "Account not found." });
            const isValid = bcrypt.compareSync(password, user.password);
            if (!isValid) return res.status(401).json({ error: "Invalid credentials." });
            res.json({ success: true, username: user.username, role: user.role });
        });
    }
});

// Catalog Retrieval with Dynamic Reservation Queue Counters
app.get('/api/books', (req, res) => {
    const query = `
        SELECT b.*, 
        (SELECT COUNT(*) FROM reservations r WHERE r.book_id = b.id) AS waitlist_count
        FROM books b
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Book Intake Deployment
app.post('/api/books', (req, res) => {
    const { title, author, genre, owner, shelf_location, condition, study_notes } = req.body;
    db.run(
        `INSERT INTO books (title, author, genre, owner, shelf_location, condition, study_notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title, author, genre, owner, shelf_location || 'Rack-GEN / Shelf-0', condition || 'Mint', study_notes || 'Peer reference volume.'],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            db.run(`INSERT INTO transactions (book_id, action, user, details) VALUES (?, 'upload', ?, ?)`, [this.lastID, owner, `Added to ${shelf_location}`]);
            io.emit('system_update');
            res.json({ success: true });
        }
    );
});

// State Machine Handling: Borrow, Return, Renew, and FIFO Reservations
app.post('/api/action', (req, res) => {
    const { bookId, username, action, version, condition } = req.body;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.get(`SELECT * FROM books WHERE id = ?`, [bookId], (err, book) => {
            if (err || !book) {
                db.run('ROLLBACK');
                return res.status(404).json({ error: "Record not found." });
            }

            if (book.version !== version) {
                db.run('ROLLBACK');
                return res.status(409).json({ error: "State conflict: Another transaction modified this item." });
            }

            if (action === 'borrow') {
                const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                db.run(
                    `UPDATE books SET status = 'Borrowed', borrowed_by = ?, due_date = ?, version = version + 1 WHERE id = ? AND version = ?`,
                    [username, dueDate, bookId, version],
                    function(uErr) {
                        if (uErr || this.changes === 0) {
                            db.run('ROLLBACK');
                            return res.status(409).json({ error: "Failed to acquire lock." });
                        }
                        // Remove from reservation waitlist if user was holding it
                        db.run(`DELETE FROM reservations WHERE book_id = ? AND user = ?`, [bookId, username]);
                        db.run(`INSERT INTO transactions (book_id, action, user, details) VALUES (?, 'borrow', ?, ?)`, [bookId, username, `Acquired until ${new Date(dueDate).toLocaleDateString()}`]);
                        db.run('COMMIT', () => { io.emit('system_update'); res.json({ success: true }); });
                    }
                );
            } 
            else if (action === 'return') {
                const updatedCondition = condition || book.condition;
                
                // Inspect FIFO queue for this book
                db.get(`SELECT * FROM reservations WHERE book_id = ? ORDER BY timestamp ASC LIMIT 1`, [bookId], (qErr, nextHold) => {
                    let nextStatus = 'Available';
                    let nextBorrower = null;
                    let nextDueDate = null;
                    let actionDetails = `Returned in [${updatedCondition}] condition. Available on shelf.`;

                    if (nextHold) {
                        nextStatus = 'Borrowed';
                        nextBorrower = nextHold.user;
                        nextDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                        actionDetails = `Returned by ${username}. Auto-assigned to waitlist pioneer: ${nextHold.user}.`;
                        db.run(`DELETE FROM reservations WHERE id = ?`, [nextHold.id]);
                    }

                    db.run(
                        `UPDATE books SET status = ?, borrowed_by = ?, due_date = ?, condition = ?, version = version + 1 WHERE id = ? AND version = ?`,
                        [nextStatus, nextBorrower, nextDueDate, updatedCondition, bookId, version],
                        function(uErr) {
                            if (uErr || this.changes === 0) {
                                db.run('ROLLBACK');
                                return res.status(409).json({ error: "Return conflict occurred." });
                            }
                            db.run(`INSERT INTO transactions (book_id, action, user, details) VALUES (?, 'return', ?, ?)`, [bookId, username, actionDetails]);
                            db.run('COMMIT', () => { io.emit('system_update'); res.json({ success: true }); });
                        }
                    );
                });
            } 
            else if (action === 'renew') {
                if (book.borrowed_by !== username) {
                    db.run('ROLLBACK');
                    return res.status(403).json({ error: "Only the active custodian can renew this loan." });
                }

                db.get(`SELECT COUNT(*) as waitlistCount FROM reservations WHERE book_id = ?`, [bookId], (wErr, wRow) => {
                    if (wRow && wRow.waitlistCount > 0) {
                        db.run('ROLLBACK');
                        return res.status(400).json({ error: "Renewal blocked: Another student is in the reservation queue." });
                    }

                    const currentDue = new Date(book.due_date).getTime();
                    const newDueDate = new Date(Math.max(Date.now(), currentDue) + 7 * 24 * 60 * 60 * 1000).toISOString();

                    db.run(
                        `UPDATE books SET due_date = ?, version = version + 1 WHERE id = ? AND version = ?`,
                        [newDueDate, bookId, version],
                        function(uErr) {
                            if (uErr || this.changes === 0) {
                                db.run('ROLLBACK');
                                return res.status(409).json({ error: "Renewal conflict." });
                            }
                            db.run(`INSERT INTO transactions (book_id, action, user, details) VALUES (?, 'renew', ?, ?)`, [bookId, username, `Loan extended to ${new Date(newDueDate).toLocaleDateString()}`]);
                            db.run('COMMIT', () => { io.emit('system_update'); res.json({ success: true }); });
                        }
                    );
                });
            } 
            else if (action === 'reserve') {
                db.run(
                    `INSERT INTO reservations (book_id, user) VALUES (?, ?)`,
                    [bookId, username],
                    err => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(400).json({ error: "You are already in the waitlist queue for this book." });
                        }
                        db.run(`INSERT INTO transactions (book_id, action, user, details) VALUES (?, 'reserve', ?, 'Joined FIFO Waitlist')`, [bookId, username]);
                        db.run('COMMIT', () => { io.emit('system_update'); res.json({ success: true }); });
                    }
                );
            }
        });
    });
});

// System Analytics Matrix Endpoint
app.get('/api/analytics', (req, res) => {
    const stats = {};
    db.get(`SELECT COUNT(*) AS total_books FROM books`, [], (e1, r1) => {
        stats.totalBooks = r1.total_books;
        db.get(`SELECT COUNT(*) AS active_loans FROM books WHERE status = 'Borrowed'`, [], (e2, r2) => {
            stats.activeLoans = r2.active_loans;
            db.get(`SELECT COUNT(*) AS total_users FROM users`, [], (e3, r3) => {
                stats.totalUsers = r3.total_users;
                db.get(`SELECT COUNT(*) AS waitlists FROM reservations`, [], (e4, r4) => {
                    stats.totalWaitlists = r4.waitlists;
                    res.json(stats);
                });
            });
        });
    });
});

// User Profile Aggregator
app.post('/api/profile', (req, res) => {
    const { username } = req.body;
    db.get(`SELECT email, role FROM users WHERE username = ?`, [username], (err, user) => {
        if (!user) return res.status(404).json({ error: "User not found." });

        db.all(`SELECT * FROM books WHERE borrowed_by = ? OR owner = ?`, [username, username], (bErr, books) => {
            db.all(
                `SELECT r.id as res_id, r.timestamp as reserved_at, b.title, b.shelf_location, b.status 
                 FROM reservations r 
                 JOIN books b ON r.book_id = b.id 
                 WHERE r.user = ?`,
                [username],
                (rErr, reservations) => {
                    db.all(
                        `SELECT t.action, t.timestamp, t.details, b.title 
                         FROM transactions t 
                         JOIN books b ON t.book_id = b.id 
                         WHERE t.user = ? 
                         ORDER BY t.timestamp DESC LIMIT 15`,
                        [username],
                        (tErr, history) => {
                            res.json({
                                user: { username, email: user.email, role: user.role },
                                books,
                                reservations,
                                history
                            });
                        }
                    );
                }
            );
        });
    });
});

// Admin Operations
app.post('/api/admin/delete', (req, res) => {
    const { bookId } = req.body;
    db.run(`DELETE FROM reservations WHERE book_id = ?`, [bookId], () => {
        db.run(`DELETE FROM books WHERE id = ?`, [bookId], () => {
            io.emit('system_update');
            res.json({ success: true });
        });
    });
});

app.get('/api/ledger', (req, res) => {
    db.all(
        `SELECT t.action, t.user, t.details, t.timestamp, b.title 
         FROM transactions t 
         JOIN books b ON t.book_id = b.id 
         ORDER BY t.timestamp DESC LIMIT 15`,
        [],
        (err, rows) => res.json(rows)
    );
});

server.listen(PORT, () => console.log(`🚀 SYSTEM ONLINE: Running on port ${PORT}`));