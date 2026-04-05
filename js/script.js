// ═══════════════════════════════════════════
//  FIREBASE SETUP — paste your config here
// ═══════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut, onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore, collection, addDoc, getDocs,
    doc, updateDoc, deleteDoc, query, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDrCxj38-qkYpdRT_9LODQQjdOjf6zCoxs",
    authDomain: "voxe-pop.firebaseapp.com",
    projectId: "voxe-pop",
    storageBucket: "voxe-pop.firebasestorage.app",
    messagingSenderId: "617312154094",
    appId: "1:617312154094:web:2b16d5423769d291a01eff"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ═══════════════════════════════════════════
//  AUTH STATE — auto login/logout on refresh
// ═══════════════════════════════════════════
let currentUser = null;
let pollsUnsubscribe = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        setNavUser(user);
        showDashboard();
    } else {
        currentUser = null;
        setNavUser(null);
        showPage('auth-page');
        if (pollsUnsubscribe) { pollsUnsubscribe(); pollsUnsubscribe = null; }
    }
});

// ═══════════════════════════════════════════
//  UI HELPERS  (unchanged from original)
// ═══════════════════════════════════════════
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
        const name = user.displayName || user.email;
        document.getElementById('navAvatar').textContent = name.slice(0, 2).toUpperCase();
        document.getElementById('navUsername').textContent = user.displayName || user.email;
    } else {
        document.getElementById('navUser').style.display = 'none';
        document.getElementById('navGuest').style.display = 'block';
    }
}

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════
//  AUTH HANDLERS
// ═══════════════════════════════════════════
async function handleRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (!username || !email || !password) return setAuthError('All fields are required.');
    if (password.length < 6) return setAuthError('Password must be at least 6 characters.');
    if (password !== confirm) return setAuthError('Passwords do not match.');

    const btn = document.getElementById('registerBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // Save the username as display name in Firebase Auth
        await updateProfile(cred.user, { displayName: username });
        setAuthSuccess('Account created! Signing you in…');
        // onAuthStateChanged fires automatically → no need to call showDashboard()
    } catch (err) {
        setAuthError(friendlyError(err.code));
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
}

async function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    // Accept either email or username in the username field
    // For simplicity: if it doesn't contain @, append a fake domain
    // But Firebase requires email — so register with email, login with email
    if (!username || !password) return setAuthError('Please enter your credentials.');

    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
        await signInWithEmailAndPassword(auth, username, password);
        // onAuthStateChanged fires → showDashboard() called automatically
    } catch (err) {
        setAuthError(friendlyError(err.code));
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

async function logout() {
    await signOut(auth);
    showToast('Signed out successfully.');
}

function friendlyError(code) {
    const map = {
        'auth/email-already-in-use': 'Email already registered.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
    };
    return map[code] || 'Something went wrong. Please try again.';
}

// ═══════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════
function showDashboard() {
    showPage('dashboard-page');
    listenToPolls(); // real-time listener
}

// Real-time listener — polls update live across all users
function listenToPolls() {
    if (pollsUnsubscribe) pollsUnsubscribe(); // clear old listener
    const q = query(collection(db, 'polls'), orderBy('createdAt', 'desc'));
    pollsUnsubscribe = onSnapshot(q, (snapshot) => {
        const polls = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderPolls(polls);
    });
}

function updateStats(polls) {
    const totalVotes = polls.reduce((sum, p) =>
        sum + p.options.reduce((s, o) => s + (o.votes || 0), 0), 0);
    // Count unique voters across all polls
    const allVoters = new Set(polls.flatMap(p => Object.keys(p.voters || {})));
    document.getElementById('statPolls').textContent = polls.length;
    document.getElementById('statVotes').textContent = totalVotes;
    document.getElementById('statUsers').textContent = allVoters.size;
}

// ═══════════════════════════════════════════
//  POLL FORM
// ═══════════════════════════════════════════
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

async function createPoll() {
    if (!currentUser) return showToast('Please sign in first.', 'error');

    const question = document.getElementById('pollQuestion').value.trim();
    if (!question) return showToast('Enter a question.', 'error');

    const inputs = document.querySelectorAll('#optionsList input');
    const options = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
    if (options.length < 2) return showToast('Add at least 2 options.', 'error');

    const poll = {
        question,
        author: currentUser.displayName || currentUser.email,
        authorId: currentUser.uid,
        options: options.map((label, i) => ({ id: i.toString(), label, votes: 0 })),
        voters: {},
        createdAt: Date.now()
    };

    try {
        await addDoc(collection(db, 'polls'), poll);
        togglePollForm();
        formOpen = false;
        document.getElementById('createBtnText').textContent = '＋ Create Poll';
        document.getElementById('pollFormPanel').classList.remove('open');
        showToast('Poll published! 🎉', 'success');
    } catch (err) {
        showToast('Failed to create poll.', 'error');
    }
}

// ═══════════════════════════════════════════
//  VOTING
// ═══════════════════════════════════════════
async function castVote(pollId, optionId) {
    if (!currentUser) return showToast('Sign in to vote.', 'error');

    // ✅ Look up poll safely from global store
    const currentPoll = window.__polls__?.[pollId];
    if (!currentPoll) return showToast('Poll not found.', 'error');

    if (currentPoll.voters?.[currentUser.uid]) return showToast('You already voted on this poll.', 'error');

    const pollRef = doc(db, 'polls', pollId);
    const updatedOptions = currentPoll.options.map(o =>
        o.id === optionId ? { ...o, votes: (o.votes || 0) + 1 } : o
    );
    const updatedVoters = { ...currentPoll.voters, [currentUser.uid]: optionId };

    try {
        await updateDoc(pollRef, { options: updatedOptions, voters: updatedVoters });
        showToast('Vote counted! ✅', 'success');
    } catch (err) {
        showToast('Failed to cast vote.', 'error');
        console.error(err);
    }
}

async function deletePoll(pollId) {
    if (!currentUser) return;
    try {
        await deleteDoc(doc(db, 'polls', pollId));
        showToast('Poll deleted.', '');
    } catch (err) {
        showToast('Failed to delete poll.', 'error');
    }
}

// ═══════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════
function renderPolls(polls) {
    updateStats(polls);
    const grid = document.getElementById('pollsGrid');

    if (!polls.length) {
        grid.innerHTML = `<div class="empty-state"><div class="icon">🗳️</div><p>No polls yet.<br>Be the first to create one!</p></div>`;
        return;
    }

    // Store polls in a global map so onclick can reference by ID safely
    window.__polls__ = {};
    polls.forEach(p => window.__polls__[p.id] = p);

    grid.innerHTML = polls.map(poll => {
        const totalVotes = poll.options.reduce((s, o) => s + (o.votes || 0), 0);
        const userVote = currentUser ? (poll.voters?.[currentUser.uid] ?? null) : null;
        const maxVotes = Math.max(...poll.options.map(o => o.votes || 0), 1);

        const optionsHTML = poll.options.map(opt => {
            const pct = totalVotes ? Math.round(((opt.votes || 0) / totalVotes) * 100) : 0;
            const barWidth = totalVotes ? Math.round(((opt.votes || 0) / maxVotes) * 100) : 0;
            const isVoted = userVote === opt.id;
            const isWinner = totalVotes > 0 && (opt.votes || 0) === maxVotes;
            const classes = [isVoted ? 'voted' : '', isWinner ? 'winner' : ''].filter(Boolean).join(' ');
            const clickable = !userVote;

            // ✅ Safe: reference by ID only, no JSON in onclick
            const clickHandler = clickable
                ? `castVote('${poll.id}', '${opt.id}')`
                : '';

            return `
                <div class="poll-option ${classes}" onclick="${clickHandler}" style="cursor:${clickable ? 'pointer' : 'default'}">
                  <div class="option-bar" style="width:${barWidth}%"></div>
                  <div class="poll-option-inner">
                    <span class="option-label">${escHtml(opt.label)} ${isVoted ? '✓' : ''}</span>
                    <span class="option-pct">${pct}% · ${opt.votes || 0}</span>
                  </div>
                </div>`;
        }).join('');

        const canDelete = currentUser && poll.authorId === currentUser.uid;
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

// ═══════════════════════════════════════════
//  EXPOSE FUNCTIONS TO HTML onclick=""
// ═══════════════════════════════════════════
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.logout = logout;
window.showAuth = showAuth;
window.switchTab = switchTab;
window.togglePollForm = togglePollForm;
window.addOption = addOption;
window.createPoll = createPoll;
window.castVote = castVote;
window.deletePoll = deletePoll;

// ═══════════════════════════════════════════
//  INIT — Enter key support
// ═══════════════════════════════════════════
document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    if (loginForm && loginForm.style.display !== 'none') handleLogin();
    else if (regForm && regForm.style.display !== 'none') handleRegister();
});