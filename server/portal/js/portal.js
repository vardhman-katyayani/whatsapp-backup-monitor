// ── Supabase config (public anon key — safe to expose in frontend)
const SUPABASE_URL = 'https://qxsauwrxaamcerrvznhp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4c2F1d3J4YWFtY2VycnZ6bmhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MjM5MDEsImV4cCI6MjA4NDE5OTkwMX0.Y2MISnuV3tURllO58x57Y9gG9rk2_DWxOulUDfV1i4w';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let SESSION = null;

// ── Init: check if already logged in
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    SESSION = session;
    loadDashboard();
  } else {
    showPage('login');
  }

  sb.auth.onAuthStateChange((_event, session) => {
    SESSION = session;
    if (session) loadDashboard();
    else showPage('login');
  });
})();

// ── Email + Password login
async function loginWithEmail() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');

  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = 'Enter your email and password';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Signing in...';

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    errEl.textContent = error.message;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Sign In';
    return;
  }

  SESSION = data.session;
  loadDashboard();
}

// ── Allow Enter key to submit
document.addEventListener('DOMContentLoaded', () => {
  ['login-email', 'login-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') loginWithEmail(); });
  });
});

// ── Logout
async function logout() {
  await sb.auth.signOut();
  SESSION = null;
  showPage('login');
}

// ── Load dashboard data from backend
async function loadDashboard() {
  try {
    const res = await apiFetch('/api/agent/me');
    const data = await res.json();

    if (res.status === 403 && data.needs_linking) {
      showError('Your account is not linked to a phone record. Contact your admin.');
      await sb.auth.signOut();
      showPage('login');
      return;
    }

    if (!res.ok) throw new Error(data.error);

    const { phone, recent_syncs } = data;

    document.getElementById('agent-name').textContent = phone.employee_name || SESSION.user.email;
    document.getElementById('d-phone').textContent = phone.phone_number;
    document.getElementById('d-dept').textContent = phone.department || '--';
    document.getElementById('d-messages').textContent = (phone.total_messages || 0).toLocaleString();
    document.getElementById('d-last-sync').textContent = phone.last_sync_at ? timeAgo(phone.last_sync_at) : 'Never';

    const connected = phone.drive_connected;
    document.getElementById('drive-badge').textContent = connected ? '✅ Connected' : 'Not Connected';
    document.getElementById('drive-badge').className = 'badge' + (connected ? ' connected' : '');
    document.getElementById('drive-connected-view').style.display = connected ? '' : 'none';
    document.getElementById('drive-disconnected-view').style.display = connected ? 'none' : '';

    renderSyncHistory(recent_syncs);
    showPage('dashboard');
  } catch (err) {
    console.error('Dashboard error:', err);
    showError(err.message);
    showPage('login');
  }
}

function renderSyncHistory(syncs) {
  const el = document.getElementById('sync-history');
  if (!syncs || syncs.length === 0) {
    el.innerHTML = '<div class="loading-text">No sync history yet.</div>';
    return;
  }
  el.innerHTML = syncs.map(s => `
    <div class="sync-item">
      <div>
        <div style="font-weight:500;margin-bottom:3px">${formatDate(s.started_at)}</div>
        <div class="sync-meta">${s.messages_added || 0} messages${s.error_message ? ' · <span style="color:#fca5a5">' + s.error_message + '</span>' : ''}</div>
      </div>
      <span class="sync-status ${s.status}">${statusEmoji(s.status)} ${s.status}</span>
    </div>
  `).join('');
}

async function connectDrive() {
  const btn = document.getElementById('connect-drive-btn');
  btn.disabled = true;
  btn.textContent = 'Getting URL...';
  try {
    const res = await apiFetch('/api/agent/drive-connect');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    window.location.href = data.auth_url;
  } catch (err) {
    showError(err.message);
    btn.disabled = false;
    btn.textContent = '☁️ Connect Google Drive';
  }
}

async function disconnectDrive() {
  if (!confirm('Disconnect Google Drive? Automatic backups will stop.')) return;
  try {
    const res = await apiFetch('/api/agent/drive-disconnect', { method: 'DELETE' });
    if (res.ok) loadDashboard();
  } catch (err) {
    showError(err.message);
  }
}

function apiFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': SESSION ? `Bearer ${SESSION.access_token}` : '',
      ...opts.headers
    }
  });
}

function showPage(name) {
  ['login', 'dashboard'].forEach(p => {
    document.getElementById(p + '-page').style.display = p === name ? '' : 'none';
  });
}

function showError(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusEmoji(s) {
  return { success: '✅', failed: '❌', processing: '⏳', received: '📥', inserting: '💾' }[s] || '🔄';
}
