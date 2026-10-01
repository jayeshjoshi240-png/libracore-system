const socket = io();
let currentUser = null;
let currentRole = 'user';
let allBooksData = [];
let pendingReturnBook = null;

socket.on('system_update', () => {
    if (currentUser) {
        refreshGrid();
        loadAnalytics();
        loadProfile();
    }
});

document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.dataset.theme = document.body.dataset.theme === 'light' ? 'dark' : 'light';
});

document.getElementById('overdrive-toggle').addEventListener('click', () => {
    document.body.classList.toggle('overdrive');
    document.getElementById('cyber-grid').classList.toggle('hidden');
});

function toggleAuth(view) {
    document.getElementById('login-panel').classList.add('hidden');
    document.getElementById('login-panel').classList.remove('active');
    document.getElementById('register-panel').classList.add('hidden');
    document.getElementById('register-panel').classList.remove('active');

    const activePanel = document.getElementById(`${view}-panel`);
    activePanel.classList.remove('hidden');
    activePanel.classList.add('active');
}

function toggleView(view) {
    document.getElementById('login-panel').classList.add('hidden');
    document.getElementById('register-panel').classList.add('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('active');
    document.getElementById('profile').classList.add('hidden');
    document.getElementById('profile').classList.remove('active');

    const target = document.getElementById(view);
    target.classList.remove('hidden');
    target.classList.add('active');

    if (view === 'profile') loadProfile();
    if (view === 'dashboard') { refreshGrid(); loadAnalytics(); }
}

async function authenticate(action) {
    const isLogin = action === 'login';
    const email = document.getElementById(isLogin ? 'login-email' : 'reg-email').value;
    const pass = document.getElementById(isLogin ? 'login-password' : 'reg-password').value;
    const user = isLogin ? null : document.getElementById('reg-username').value;
    const msgBox = document.getElementById(isLogin ? 'login-msg' : 'reg-msg');

    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, email, username: user, password: pass })
        });
        const data = await res.json();

        if (data.success) {
            currentUser = data.username;
            currentRole = data.role;

            document.getElementById('nav-dash').classList.remove('hidden');
            document.getElementById('nav-prof').classList.remove('hidden');
            document.getElementById('search-bar').classList.remove('hidden');
            document.getElementById('overdrive-toggle').classList.remove('hidden');

            document.getElementById('user-id').innerText = currentUser;

            if (currentRole === 'admin') {
                document.getElementById('admin-badge').classList.remove('hidden');
            }

            toggleView('dashboard');
        } else {
            msgBox.innerText = `ERR: ${data.error}`;
        }
    } catch (err) {
        msgBox.innerText = "CRITICAL: Backend offline or unreachable.";
    }
}

async function loadAnalytics() {
    const res = await fetch('/api/analytics');
    const data = await res.json();
    document.getElementById('stat-total-books').innerText = data.totalBooks || 0;
    document.getElementById('stat-active-loans').innerText = data.activeLoans || 0;
    document.getElementById('stat-waitlists').innerText = data.totalWaitlists || 0;
    document.getElementById('stat-total-users').innerText = data.totalUsers || 0;
}

async function fetchLedger() {
    const res = await fetch('/api/ledger');
    const ledger = await res.json();
    document.getElementById('ledger-feed').innerHTML = ledger.map(log => {
        const date = new Date(log.timestamp).toLocaleTimeString();
        const actionColor = log.action === 'borrow' ? '#ef4444' : log.action === 'return' ? '#10b981' : '#38bdf8';
        return `
        <div class="history-item">
            [${date}] <b>${log.user}</b>: <span style="color:${actionColor}">${log.action.toUpperCase()}</span> 
            "<i>${log.title}</i>" ${log.details ? `— <span style="color:#94a3b8">${log.details}</span>` : ''}
        </div>`;
    }).join('');
}

async function refreshGrid() {
    const res = await fetch('/api/books');
    allBooksData = await res.json();
    renderBooks(allBooksData, 'book-grid');
    fetchLedger();
}

function renderBooks(books, containerId) {
    const grid = document.getElementById(containerId);
    grid.innerHTML = books.map(book => {
        let fineWarning = '';
        let countdown = '';

        if (book.status === 'Borrowed' && book.due_date) {
            const dueTime = new Date(book.due_date).getTime();
            const now = Date.now();
            const diffHours = Math.round((dueTime - now) / (1000 * 60 * 60));

            if (now > dueTime) {
                const daysLate = Math.ceil((now - dueTime) / (1000 * 60 * 60 * 24));
                fineWarning = `<div style="color: #ef4444; font-weight: 700; margin-top: 5px;">⚠️ OVERDUE: Fine ₹${daysLate * 10}</div>`;
            } else {
                countdown = `<div class="due-countdown" style="color: #38bdf8;">⏳ Return in ${diffHours}h (${new Date(book.due_date).toLocaleDateString()})</div>`;
            }
        }

        const waitlistBadge = book.waitlist_count > 0 
            ? `<span class="badge-tag" style="border-color:#f59e0b; color:#f59e0b; margin-left: 6px;">WAITLIST: ${book.waitlist_count}</span>` 
            : '';

        let actionArea = '';
        if (book.status === 'Available') {
            actionArea = `<button onclick="bookAction(${book.id}, 'borrow', ${book.version})" class="cyber-btn primary" style="width:100%; margin-top:10px;">BORROW VOLUME</button>`;
        } else if (book.borrowed_by === currentUser) {
            actionArea = `
                <div style="display:flex; gap: 8px; margin-top: 10px;">
                    <button onclick="promptReturnModal(${book.id}, '${book.title.replace(/'/g, "\\'")}', ${book.version})" class="cyber-btn outline" style="flex:1;">RETURN</button>
                    <button onclick="bookAction(${book.id}, 'renew', ${book.version})" class="cyber-btn primary" style="flex:1;">RENEW (+7D)</button>
                </div>`;
        } else {
            actionArea = `
                <div style="margin-top: 10px;">
                    <p style="font-size: 0.8rem; color: #ef4444; margin: 4px 0;">Custodian: ${book.borrowed_by}</p>
                    <button onclick="bookAction(${book.id}, 'reserve', ${book.version})" class="cyber-btn outline" style="width:100%; border-color: #f59e0b; color: #f59e0b;">JOIN WAITLIST</button>
                </div>`;
        }

        const adminDelete = currentRole === 'admin' 
            ? `<button onclick="deleteBook(${book.id})" class="cyber-btn danger" style="width:100%; margin-top:8px; padding: 4px; font-size: 0.75rem;">ADMIN // DECOMMISSION</button>` 
            : '';

        return `
        <div class="book-card">
            <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <span class="badge-tag ${book.status === 'Available' ? 'badge-avail' : 'badge-borrow'}">${book.status}</span>
                    <button onclick="openQrModal(${book.id}, '${book.title.replace(/'/g, "\\'")}', '${book.shelf_location}')" class="cyber-btn outline" style="padding: 2px 6px; font-size: 0.75rem;">🏷️ QR TAG</button>
                </div>
                
                <h3 style="margin: 10px 0 4px 0;">${book.title}</h3>
                <p style="color: #94a3b8; margin: 0; font-size: 0.9rem;">${book.author} | <span class="neon-text">${book.genre}</span></p>
                
                <div class="locator-tag">📍 ${book.shelf_location}</div>
                <div><span class="badge-tag" style="color: #a855f7;">CONDITION: ${book.condition}</span> ${waitlistBadge}</div>
                
                <div class="study-notes-tag">💡 <b>Notes:</b> ${book.study_notes}</div>
                ${countdown}
                ${fineWarning}
            </div>

            <div>
                ${actionArea}
                ${adminDelete}
            </div>
        </div>`;
    }).join('');
}

async function bookAction(bookId, action, version, condition = null) {
    const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, username: currentUser, action, version, condition })
    });
    const data = await res.json();
    if (!res.ok) {
        alert(data.error || "Operation failed.");
    }
}

// Modal Handlers: QR Shelf Tracker
function openQrModal(bookId, title, shelf) {
    document.getElementById('qr-modal-title').innerText = title;
    document.getElementById('qr-modal-shelf').innerText = `Physical Coordinates: ${shelf}`;
    const qrData = encodeURIComponent(`LIBRACORE-ASSET:${bookId}|LOC:${shelf}|TITLE:${title}`);
    document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${qrData}`;
    document.getElementById('qr-modal').classList.remove('hidden');
}
function closeQrModal() { document.getElementById('qr-modal').classList.add('hidden'); }

// Modal Handlers: Custody Condition Check
function promptReturnModal(bookId, title, version) {
    pendingReturnBook = { bookId, version };
    document.getElementById('return-modal-title').innerText = `Surrendering: ${title}`;
    document.getElementById('return-modal').classList.remove('hidden');
}
function closeReturnModal() { 
    document.getElementById('return-modal').classList.add('hidden');
    pendingReturnBook = null;
}
function confirmReturnAction() {
    if (!pendingReturnBook) return;
    const cond = document.getElementById('return-condition-select').value;
    bookAction(pendingReturnBook.bookId, 'return', pendingReturnBook.version, cond);
    closeReturnModal();
}

async function addBook() {
    const title = document.getElementById('new-title').value;
    const author = document.getElementById('new-author').value;
    const genre = document.getElementById('new-genre').value || 'Computer Science';
    const shelf = document.getElementById('new-shelf').value || 'Rack-GEN / Shelf-1';
    const condition = document.getElementById('new-condition').value;
    const notes = document.getElementById('new-notes').value || 'Standard reference material.';

    if (!title || !author) return alert("Title and Author fields are required.");

    await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, author, genre, owner: currentUser, shelf_location: shelf, condition, study_notes: notes })
    });

    document.getElementById('new-title').value = '';
    document.getElementById('new-author').value = '';
    document.getElementById('new-shelf').value = '';
    document.getElementById('new-notes').value = '';
}

async function loadProfile() {
    const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser })
    });
    const data = await res.json();

    document.getElementById('profile-avatar').src = `https://ui-avatars.com/api/?name=${data.user.username}&background=00f0ff&color=000&size=200&bold=true&format=svg`;
    document.getElementById('profile-name').innerText = data.user.username;
    document.getElementById('profile-email').innerText = data.user.email;

    const badge = document.getElementById('profile-role-badge');
    badge.innerText = `${data.user.role.toUpperCase()} LEVEL ACCESS`;
    badge.style.color = data.user.role === 'admin' ? '#ef4444' : '#10b981';

    // Personal Audit Trail
    document.getElementById('profile-history').innerHTML = data.history.length === 0 
        ? '<p style="color:#64748b;">No recent custody transactions logged.</p>'
        : data.history.map(h => `
            <div class="history-item">
                <div style="color:#94a3b8; font-size: 0.75rem;">${new Date(h.timestamp).toLocaleString()}</div>
                <div><b>${h.action.toUpperCase()}</b>: <i>${h.title}</i></div>
                ${h.details ? `<div style="color: #64748b; font-size: 0.75rem;">${h.details}</div>` : ''}
            </div>`).join('');

    renderBooks(data.books.filter(b => b.borrowed_by === currentUser), 'profile-borrowed');
    renderBooks(data.books.filter(b => b.owner === currentUser), 'profile-owned');

    // Waitlist Reservations
    document.getElementById('profile-reservations').innerHTML = data.reservations.length === 0
        ? '<p style="color:#64748b;">No active waitlists holds recorded.</p>'
        : data.reservations.map(r => `
            <div class="book-card">
                <h4 style="margin: 0 0 5px 0;">${r.title}</h4>
                <div class="locator-tag">📍 ${r.shelf_location}</div>
                <p style="font-size:0.8rem; color:#94a3b8; margin: 5px 0;">Status: <b>${r.status}</b></p>
                <p style="font-size:0.75rem; color:#f59e0b; margin: 0;">Reserved on: ${new Date(r.reserved_at).toLocaleDateString()}</p>
            </div>`).join('');
}

function exportLedgerCSV() {
    fetch('/api/ledger').then(r => r.json()).then(data => {
        if (data.length === 0) return alert("Audit ledger contains no records to extract.");
        let csv = "data:text/csv;charset=utf-8,Timestamp,User,Action,Volume Title,Audit Details\n";
        data.forEach(d => {
            csv += `"${d.timestamp}","${d.user}","${d.action}","${d.title.replace(/"/g, '""')}","${(d.details||'').replace(/"/g, '""')}"\n`;
        });
        const uri = encodeURI(csv);
        const link = document.createElement("a");
        link.setAttribute("href", uri);
        link.setAttribute("download", `LibraCore_Audit_Ledger_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}

async function deleteBook(bookId) {
    if (!confirm("Are you sure you want to decommission this asset from the database?")) return;
    await fetch('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId })
    });
}

function filterBooks() {
    const q = document.getElementById('search-bar').value.toLowerCase();
    const filtered = allBooksData.filter(b => 
        b.title.toLowerCase().includes(q) || 
        b.author.toLowerCase().includes(q) || 
        b.shelf_location.toLowerCase().includes(q) || 
        b.study_notes.toLowerCase().includes(q)
    );
    renderBooks(filtered, 'book-grid');
}

function applyFilter(genre) {
    if (!genre) return renderBooks(allBooksData, 'book-grid');
    const filtered = allBooksData.filter(b => b.genre.toLowerCase().includes(genre.toLowerCase()));
    renderBooks(filtered, 'book-grid');
}