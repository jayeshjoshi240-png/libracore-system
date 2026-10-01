# ⚡ LibraCore Nexus

> A high-performance, real-time Library Management & Physical Asset Tracking System built with Node.js, SQLite, and WebSockets. Designed with a cyber-glassmorphic UI, Optimistic Concurrency Control (OCC), physical inventory tracking, and FIFO waitlists.

---

## 🚀 Key Features

* **Real-Time WebSocket Synchronization:** Powered by Socket.io to push instantaneous inventory and custody updates to all active sessions without requiring page refreshes.
* **Optimistic Concurrency Control (OCC):** Database row versioning ensures multi-user concurrency integrity, eliminating race conditions when competing for borrow transactions.
* **FIFO Reservation & Waitlist Engine:** Automatically queues reservation requests for borrowed books; when an item is returned, custody instantly transitions to the queue pioneer.
* **Physical Locator & Dynamic QR Codes:** Generates scannable physical inventory tags containing rack, aisle, and shelf coordinates (`Rack-CS-02 / Shelf-A`).
* **Condition Grading & Chain-of-Custody:** Logs book wear levels (Mint, Good, Fair, Damaged) at checkout and return into a persistent audit trail.
* **Automated Penalty System:** Calculates per-day late fees on overdue loans with dynamic real-time countdown timers.
* **Role-Based Access Control (RBAC):** Distinct interfaces and privileges for Students (borrow, return, queue, loan renewals) and Administrative Root (decommission assets, inspect custody matrices, export CSV ledgers).
* **Overdrive Graphics Engine:** High-performance theme switcher toggling between clean dark mode and high-glow cyber-grid visualization.

---

## 🛠️ Tech Stack

* **Runtime:** Node.js
* **Backend Framework:** Express.js
* **Database:** SQLite3 (Serialized ACID transactions)
* **Real-Time Engine:** Socket.io
* **Security:** `bcryptjs` password hashing
* **Frontend:** Vanilla JavaScript (ES6+), Semantic HTML5, CSS3 Glassmorphism

---

## 📂 Project Structure

```text
LibraCore-System/
├── libracore.db         # Auto-generated SQLite database (git-ignored)
├── node_modules/        # Dependencies (git-ignored)
├── package.json         # Project manifests and dependencies
├── database.js          # SQLite schema, indices, and catalog seeder
├── server.js            # Express server, WebSocket engine, and API routes
├── .gitignore           # Excludes heavy dependencies & database locks
├── README.md            # System documentation
└── public/
## 🚀 How to Run the Project

### 1. Prerequisites
* Install **[Node.js](https://nodejs.org/)** (v16 or higher)

### 2. Open Project Terminal
Open the project folder in **VS Code** and launch the terminal (`Ctrl` + `~` or `Terminal > New Terminal`).

### 3. Install Dependencies
Run the command below to install all required packages:
```bash
npm install express sqlite3 bcryptjs cors body-parser socket.io
then:run node server.js
### 🔐 Access Credentials

| Role | Email Address | Passkey | Access Permissions |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@libracore.com` | `admin123` | Full Root Access, Asset Decommissioning, CSV Ledger Export, Global Catalog |
| **Standard User** | *Register via UI* | *Assigned at signup* | Borrow, Return, Renew (+7D), FIFO Waitlist Holds, Profile Activity Audit |
    ├── index.html       # Single-page interface & modal structures
    ├── style.css        # Glassmorphic, neon, and overdrive styling
    └── script.js        # Reactive DOM, WebSockets, modals, and filters
