/* ══════════════════════════════════════════
          MOCK JWT UTILITY
          (In production, verification is server-side)
       ══════════════════════════════════════════ */
const JWT = {
    sign(payload) {
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const body = btoa(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 3600000 }));
        const sig = btoa(`${header}.${body}.secret_signature_voxpop`);
        return `${header}.${body}.${sig}`;
    },
    decode(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            return JSON.parse(atob(parts[1]));
        } catch { return null; }
    },
    verify(token) {
        try {
            const payload = this.decode(token);
            if (!payload) return null;
            if (payload.exp < Date.now()) return null; // expired
            return payload;
        } catch { return null; }
    }
};

/* ══════════════════════════════════════════
   DATA STORE  (localStorage as mock DB)
══════════════════════════════════════════ */
const DB = {
    getUsers() { return JSON.parse(localStorage.getItem('vp_users') || '[]'); },
    getPolls() { return JSON.parse(localStorage.getItem('vp_polls') || '[]'); },
    saveUsers(u) { localStorage.setItem('vp_users', JSON.stringify(u)); },
    savePolls(p) { localStorage.setItem('vp_polls', JSON.stringify(p)); },
    getToken() { return localStorage.getItem('vp_token'); },
    saveToken(t) { localStorage.setItem('vp_token', t); },
    removeToken() { localStorage.removeItem('vp_token'); },
    currentUser() {
        const token = this.getToken();
        if (!token) return null;
        return JWT.verify(token);
    }
};

/* ══════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════ */
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function showAuth() { showPage('auth-page'); }

function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast show ${type ? 'toast-' + type : ''}`;
    setTimeout(() => t.classList.remove('show'), 3200);
}

function setAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
    document.getElementById('auth-success').style.display = 'none';
}

function setAuthSuccess(msg) {
    const el = document.getElementById('auth-success');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
    document.getElementById('auth-error').style.display = 'none';
}

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach((t, i) => {
        t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'));
    });
    document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
    setAuthError('');
}

function setNavUser(user) {
    if (user) {
        document.getElementById('navUser').style.display = 'flex';
        document.getElementById('navGuest').style.display = 'none';
        document.getElementById('navAvatar').textContent = user.username.slice(0, 2).toUpperCase();
        document.getElementById('navUsername').textContent = user.username;
    } else {
        document.getElementById('navUser').style.display = 'none';
        document.getElementById('navGuest').style.display = 'block';
    }
}

/* ══════════════════════════════════════════
   AUTH HANDLERS
══════════════════════════════════════════ */
function handleRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (!username || !email || !password) return setAuthError('All fields are required.');
    if (password.length < 6) return setAuthError('Password must be at least 6 characters.');
    if (password !== confirm) return setAuthError('Passwords do not match.');

    const users = DB.getUsers();
    if (users.find(u => u.username === username)) return setAuthError('Username already taken.');
    if (users.find(u => u.email === email)) return setAuthError('Email already registered.');

    const newUser = { id: Date.now().toString(), username, email, password, createdAt: Date.now() };
    DB.saveUsers([...users, newUser]);

    setAuthSuccess('Account created! Please sign in.');
    switchTab('login');
    document.getElementById('login-username').value = username;
}

function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) return setAuthError('Please enter your credentials.');

    const users = DB.getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return setAuthError('Invalid username or password.');

    const token = JWT.sign({ id: user.id, username: user.username, email: user.email });
    DB.saveToken(token);

    setNavUser(user);
    showDashboard();
    showToast(`Welcome back, ${user.username}! 👋`, 'success');
}

function logout() {
    DB.removeToken();
    setNavUser(null);
    showPage('auth-page');
    showToast('Signed out successfully.', '');
}

/* ══════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════ */
function showDashboard() {
    showPage('dashboard-page');
    renderPolls();
}

function updateStats() {
    const polls = DB.getPolls();
    const totalVotes = polls.reduce((sum, p) => sum + p.options.reduce((s, o) => s + o.votes, 0), 0);
    const users = DB.getUsers();
    document.getElementById('statPolls').textContent = polls.length;
    document.getElementById('statVotes').textContent = totalVotes;
    document.getElementById('statUsers').textContent = users.length;
}

/* ══════════════════════════════════════════
   POLL FORM
══════════════════════════════════════════ */
let formOpen = false;

function togglePollForm() {
    formOpen = !formOpen;
    const panel = document.getElementById('pollFormPanel');
    const btn = document.getElementById('createBtnText');
    panel.classList.toggle('open', formOpen);
    btn.textContent = formOpen ? '✕ Cancel' : '＋ Create Poll';
    if (formOpen) {
        document.getElementById('pollQuestion').value = '';
        document.getElementById('optionsList').innerHTML = '';
        addOption(); addOption();
    }
}

function addOption() {
    const list = document.getElementById('optionsList');
    const idx = list.children.length + 1;
    const row = document.createElement('div');
    row.className = 'option-row';
    row.innerHTML = `
    <input type="text" placeholder="Option ${idx}" />
    <button class="remove-option" onclick="this.parentElement.remove()" title="Remove">✕</button>
  `;
    list.appendChild(row);
}

function createPoll() {
    const user = DB.currentUser();
    if (!user) return showToast('Please sign in first.', 'error');

    const question = document.getElementById('pollQuestion').value.trim();
    if (!question) return showToast('Enter a question.', 'error');

    const inputs = document.querySelectorAll('#optionsList input');
    const options = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
    if (options.length < 2) return showToast('Add at least 2 options.', 'error');

    const poll = {
        id: Date.now().toString(),
        question,
        author: user.username,
        authorId: user.id,
        options: options.map((label, i) => ({ id: i.toString(), label, votes: 0 })),
        voters: {},
        createdAt: Date.now()
    };

    const polls = DB.getPolls();
    DB.savePolls([poll, ...polls]);

    togglePollForm();
    formOpen = false;
    document.getElementById('createBtnText').textContent = '＋ Create Poll';
    document.getElementById('pollFormPanel').classList.remove('open');

    renderPolls();
    showToast('Poll published! 🎉', 'success');
}

/* ══════════════════════════════════════════
   VOTING
══════════════════════════════════════════ */
function castVote(pollId, optionId) {
    const user = DB.currentUser();
    if (!user) return showToast('Sign in to vote.', 'error');

    const polls = DB.getPolls();
    const poll = polls.find(p => p.id === pollId);
    if (!poll) return;

    if (poll.voters[user.id]) return showToast('You already voted on this poll.', 'error');

    poll.voters[user.id] = optionId;
    const opt = poll.options.find(o => o.id === optionId);
    if (opt) opt.votes++;

    DB.savePolls(polls);
    renderPolls();
    showToast('Vote counted! ✅', 'success');
}

function deletePoll(pollId) {
    const user = DB.currentUser();
    if (!user) return;
    const polls = DB.getPolls().filter(p => !(p.id === pollId && p.authorId === user.id));
    DB.savePolls(polls);
    renderPolls();
    showToast('Poll deleted.', '');
}

/* ══════════════════════════════════════════
   RENDER
══════════════════════════════════════════ */
function renderPolls() {
    updateStats();
    const user = DB.currentUser();
    const polls = DB.getPolls();
    const grid = document.getElementById('pollsGrid');

    if (!polls.length) {
        grid.innerHTML = `<div class="empty-state"><div class="icon">🗳️</div><p>No polls yet.<br>Be the first to create one!</p></div>`;
        return;
    }

    grid.innerHTML = polls.map(poll => {
        const totalVotes = poll.options.reduce((s, o) => s + o.votes, 0);
        const userVote = user ? poll.voters[user.id] : null;
        const maxVotes = Math.max(...poll.options.map(o => o.votes), 1);

        const optionsHTML = poll.options.map(opt => {
            const pct = totalVotes ? Math.round((opt.votes / totalVotes) * 100) : 0;
            const barWidth = totalVotes ? Math.round((opt.votes / maxVotes) * 100) : 0;
            const isVoted = userVote === opt.id;
            const isWinner = totalVotes > 0 && opt.votes === maxVotes;
            const classes = [isVoted ? 'voted' : '', isWinner && totalVotes > 0 ? 'winner' : ''].filter(Boolean).join(' ');
            const cursor = userVote ? 'default' : 'pointer';
            return `
        <div class="poll-option ${classes}" onclick="${userVote ? '' : `castVote('${poll.id}','${opt.id}')`}" style="cursor:${cursor}">
          <div class="option-bar" style="width:${barWidth}%"></div>
          <div class="poll-option-inner">
            <span class="option-label">${escHtml(opt.label)} ${isVoted ? '✓' : ''}</span>
            <span class="option-pct">${pct}% · ${opt.votes}</span>
          </div>
        </div>`;
        }).join('');

        const canDelete = user && poll.authorId === user.id;
        const deleteBtn = canDelete ? `<button class="delete-poll-btn" onclick="deletePoll('${poll.id}')">Delete</button>` : '';

        return `
      <div class="poll-card">
        <div class="poll-meta">
          <span class="poll-author">by ${escHtml(poll.author)}</span>
          <span class="poll-votes-count">${totalVotes} vote${totalVotes !== 1 ? 's' : ''}</span>
        </div>
        <div class="poll-question">${escHtml(poll.question)}</div>
        <div class="poll-options">${optionsHTML}</div>
        <div class="poll-footer">${deleteBtn}</div>
      </div>`;
    }).join('');
}

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════
   INIT — check for existing session
══════════════════════════════════════════ */
(function init() {
    const user = DB.currentUser();
    if (user) {
        setNavUser(user);
        showDashboard();
    }

    // Enter key support
    document.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const loginForm = document.getElementById('login-form');
        const regForm = document.getElementById('register-form');
        if (loginForm.style.display !== 'none') handleLogin();
        else if (regForm.style.display !== 'none') handleRegister();
    });
})();