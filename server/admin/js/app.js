/**
 * WhatsApp Monitor Admin Dashboard
 */

const API_BASE = '/api';

// ============================================
// Supabase Realtime + Auto-Polling
// ============================================

let _supabaseClient = null;
let _pollTimers = [];

async function initSupabaseLive() {
  try {
    const res = await fetch(`${API_BASE}/config`);
    const cfg = await res.json();
    if (!cfg.supabaseUrl || !cfg.supabaseAnon) return;

    _supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnon);

    // Subscribe to pipeline_logs inserts/updates → refresh dashboard & logs
    _supabaseClient
      .channel('pipeline_logs_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_logs' }, () => {
        const page = (window.location.hash || '#/').replace('#/', '') || 'dashboard';
        if (page === 'dashboard') initDashboard();
        if (page === 'logs') initLogs();
      })
      .subscribe();

    // Subscribe to messages inserts → refresh dashboard stats
    _supabaseClient
      .channel('messages_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        const page = (window.location.hash || '#/').replace('#/', '') || 'dashboard';
        if (page === 'dashboard') initDashboard();
      })
      .subscribe();

    document.getElementById('live-indicator').style.display = 'inline-flex';
    console.log('[Live] Supabase realtime connected');
  } catch (e) {
    console.warn('[Live] Supabase realtime unavailable, using polling fallback');
    startPollingFallback();
  }
}

function startPollingFallback() {
  // Poll every 30s when on dashboard or logs
  const timer = setInterval(() => {
    const page = (window.location.hash || '#/').replace('#/', '') || 'dashboard';
    if (page === 'dashboard') initDashboard();
    if (page === 'logs') initLogs();
  }, 30000);
  _pollTimers.push(timer);
  document.getElementById('live-indicator').style.display = 'inline-flex';
}

function stopLive() {
  _pollTimers.forEach(clearInterval);
  _pollTimers = [];
  if (_supabaseClient) {
    _supabaseClient.removeAllChannels();
  }
}

// ============================================
// Router
// ============================================

function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function handleRoute() {
  const hash = window.location.hash || '#/';
  const page = hash.replace('#/', '') || 'dashboard';

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  const titles = {
    dashboard: 'Dashboard',
    phones: 'Phones',
    messages: 'Messages',
    ai: 'AI Insights',
    logs: 'Sync Logs',
    upload: 'Upload Backup',
    alerts: 'Alerts',
    chat: 'Ask AI'
  };
  document.getElementById('page-title').textContent = titles[page] || 'Dashboard';

  loadPage(page);
}

function loadPage(page) {
  const template = document.getElementById(`${page}-template`);
  const content = document.getElementById('content');

  if (template) {
    content.innerHTML = '';
    content.appendChild(template.content.cloneNode(true));

    switch (page) {
      case 'dashboard': initDashboard(); break;
      case 'phones':    initPhones();    break;
      case 'messages':  initMessages();  break;
      case 'ai':        initAI();        break;
      case 'logs':      initLogs();      break;
      case 'upload':    initUpload();    break;
      case 'alerts':    initAlerts();    break;
      case 'chat':      initChat();      break;
    }
  }
}

// ============================================
// Dashboard
// ============================================

async function initDashboard() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    const data = await response.json();

    document.getElementById('stat-phones').textContent = formatNumber(data.totalPhones);
    document.getElementById('stat-active').textContent = formatNumber(data.activePhones);
    document.getElementById('stat-messages').textContent = formatNumber(data.totalMessages);
    document.getElementById('stat-today').textContent = formatNumber(data.messagesToday);
    document.getElementById('stat-success').textContent = `${data.successRate ?? '--'}%`;

    const logsTable = document.getElementById('recent-logs');
    if (data.recentLogs && data.recentLogs.length > 0) {
      logsTable.innerHTML = data.recentLogs.map(log => `
        <tr>
          <td>${formatTime(log.started_at)}</td>
          <td class="mono">${log.phones?.phone_number || '--'}</td>
          <td>${log.phones?.employee_name || '--'}</td>
          <td>${getStatusBadge(log.status)}</td>
          <td>${formatNumber(log.messages_added || 0)}</td>
          <td>${log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : '--'}</td>
        </tr>
      `).join('');
    } else {
      logsTable.innerHTML = '<tr><td colspan="6" class="loading">No sync activity yet</td></tr>';
    }
  } catch (error) {
    console.error('Dashboard error:', error);
  }
}

// ============================================
// Phones
// ============================================

let phonesData = [];

async function initPhones() {
  try {
    const response = await fetch(`${API_BASE}/phones`);
    const data = await response.json();
    phonesData = data.phones || [];
    renderPhones(phonesData);

    document.getElementById('phone-filter').addEventListener('change', filterPhones);
    document.getElementById('phone-search').addEventListener('input', filterPhones);
  } catch (error) {
    document.getElementById('phones-table').innerHTML =
      '<tr><td colspan="8" class="loading">Error loading phones</td></tr>';
  }
}

function filterPhones() {
  const filter = document.getElementById('phone-filter').value;
  const search = document.getElementById('phone-search').value.toLowerCase();
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  let filtered = phonesData;
  if (filter === 'synced') filtered = filtered.filter(p => p.last_sync_at && (now - new Date(p.last_sync_at)) < day);
  else if (filter === 'stale') filtered = filtered.filter(p => p.last_sync_at && (now - new Date(p.last_sync_at)) >= day);
  else if (filter === 'never') filtered = filtered.filter(p => !p.last_sync_at);

  if (search) {
    filtered = filtered.filter(p =>
      (p.phone_number && p.phone_number.includes(search)) ||
      (p.employee_name && p.employee_name.toLowerCase().includes(search)) ||
      (p.department && p.department.toLowerCase().includes(search))
    );
  }
  renderPhones(filtered);
}

function renderPhones(phones) {
  const table = document.getElementById('phones-table');
  if (!phones || phones.length === 0) {
    table.innerHTML = '<tr><td colspan="8" class="loading">No phones found</td></tr>';
    return;
  }

  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  table.innerHTML = phones.map(phone => {
    const lastSync = phone.last_sync_at ? new Date(phone.last_sync_at) : null;
    const diff = lastSync ? now - lastSync : Infinity;
    let status, statusClass;
    if (!lastSync) { status = 'Never'; statusClass = 'muted'; }
    else if (diff < day) { status = 'Synced'; statusClass = 'success'; }
    else if (diff < 7 * day) { status = 'Stale'; statusClass = 'warning'; }
    else { status = 'Critical'; statusClass = 'danger'; }

    const driveConnected = !!phone.google_refresh_token;

    return `
      <tr>
        <td class="mono">${phone.phone_number || '--'}</td>
        <td>${phone.employee_name || '--'}</td>
        <td>${phone.department || '--'}</td>
        <td>${lastSync ? formatTime(lastSync) : '--'}</td>
        <td>${formatNumber(phone.total_messages || 0)}</td>
        <td>
          ${driveConnected
            ? `<span class="badge badge-success">☁️ Connected</span>`
            : `<a href="/api/oauth/auth-url/${phone.id}" target="_blank" class="btn btn-secondary" style="padding:4px 10px;font-size:12px">Connect Drive</a>`
          }
        </td>
        <td><span class="badge badge-${statusClass}">${status}</span></td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px" onclick="viewMessages('${phone.id}')">💬 Chats</button>
          ${driveConnected ? `<button class="btn btn-secondary" style="padding:6px 12px;font-size:12px" onclick="manualSync('${phone.id}', this)">🔄 Sync</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

async function manualSync(phoneId, btn) {
  btn.disabled = true;
  btn.textContent = '⏳ Syncing...';
  try {
    const res = await fetch(`${API_BASE}/sync/${phoneId}`, { method: 'POST' });
    const data = await res.json();
    btn.textContent = data.error ? '❌ Failed' : '✅ Started';
    setTimeout(() => { btn.textContent = '🔄 Sync'; btn.disabled = false; }, 3000);
  } catch (e) {
    btn.textContent = '❌ Error'; btn.disabled = false;
  }
}

function viewMessages(phoneId) {
  window.location.hash = '#/messages';
  setTimeout(() => {
    const sel = document.getElementById('msg-phone-select');
    if (sel) { sel.value = phoneId; sel.dispatchEvent(new Event('change')); }
  }, 100);
}

// ============================================
// Messages Viewer
// ============================================

let currentChatId = null;
let messageOffset = 0;
const MESSAGE_PAGE = 50;

async function initMessages() {
  await loadPhonesIntoSelect('msg-phone-select');
  document.getElementById('msg-phone-select').addEventListener('change', async (e) => {
    if (e.target.value) await loadChats(e.target.value);
    else document.getElementById('chats-list').innerHTML = '<div class="chat-empty">Select a phone</div>';
  });
}

async function loadChats(phoneId) {
  const list = document.getElementById('chats-list');
  list.innerHTML = '<div class="chat-empty">Loading chats...</div>';

  try {
    const res = await fetch(`${API_BASE}/chats?phone_id=${phoneId}&limit=100`);
    const data = await res.json();
    const chats = data.chats || [];

    if (!chats.length) {
      list.innerHTML = '<div class="chat-empty">No chats found</div>';
      return;
    }

    list.innerHTML = chats.map(chat => `
      <div class="chat-item" onclick="openChat('${chat.id}', ${JSON.stringify(chat.contact_name || chat.group_name || 'Unknown').replace(/"/g, '&quot;')}, '${chat.is_group ? 'group' : 'direct'}')">
        <div class="chat-avatar">${chat.is_group ? '👥' : '👤'}</div>
        <div class="chat-info">
          <div class="chat-name">${chat.contact_name || chat.group_name || 'Unknown'}</div>
          <div class="chat-preview">${truncate(chat.last_message_preview || '', 40)}</div>
        </div>
        <div class="chat-meta">
          <div class="chat-time">${formatTime(chat.last_message_at)}</div>
          <div class="chat-count">${formatNumber(chat.total_messages || 0)}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = '<div class="chat-empty">Error loading chats</div>';
  }
}

async function openChat(chatId, chatName, chatType) {
  currentChatId = chatId;
  messageOffset = 0;

  // Highlight selected chat
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  event.currentTarget.classList.add('active');

  document.getElementById('thread-header').innerHTML = `
    <div class="thread-title">${chatType === 'group' ? '👥' : '👤'} ${chatName}</div>
  `;

  await loadMessages(chatId, false);
}

async function loadMessages(chatId, append = false) {
  const thread = document.getElementById('message-thread');

  if (!append) {
    thread.innerHTML = '<div class="thread-empty">Loading messages...</div>';
    messageOffset = 0;
  }

  try {
    const res = await fetch(`${API_BASE}/messages?chat_id=${chatId}&limit=${MESSAGE_PAGE}&offset=${messageOffset}`);
    const data = await res.json();
    const messages = data.messages || [];

    if (!messages.length && !append) {
      thread.innerHTML = '<div class="thread-empty">No messages found</div>';
      document.getElementById('thread-load-more').style.display = 'none';
      return;
    }

    const html = messages.map(msg => `
      <div class="message-bubble ${msg.from_me ? 'sent' : 'received'}">
        <div class="message-text">${escapeHtml(msg.text_data || '[media]')}</div>
        <div class="message-time">${formatTime(msg.timestamp)}</div>
      </div>
    `).join('');

    if (append) {
      thread.insertAdjacentHTML('afterbegin', html);
    } else {
      thread.innerHTML = html;
      thread.scrollTop = thread.scrollHeight;
    }

    messageOffset += messages.length;
    document.getElementById('thread-load-more').style.display =
      messages.length === MESSAGE_PAGE ? 'flex' : 'none';

  } catch (e) {
    if (!append) thread.innerHTML = '<div class="thread-empty">Error loading messages</div>';
  }
}

window.loadMoreMessages = async function() {
  if (currentChatId) await loadMessages(currentChatId, true);
};

// ============================================
// AI Insights
// ============================================

async function initAI() {
  await loadPhonesIntoSelect('ai-phone-select');
  document.getElementById('ai-phone-select').addEventListener('change', loadAIInsights);
  document.getElementById('ai-filter').addEventListener('change', loadAIInsights);

  // Load flagged insights by default
  await loadFlaggedInsights();
}

async function loadAIInsights() {
  const phoneId = document.getElementById('ai-phone-select').value;
  const filter = document.getElementById('ai-filter').value;

  if (!phoneId) {
    await loadFlaggedInsights();
    return;
  }

  const grid = document.getElementById('ai-insights-grid');
  grid.innerHTML = '<div class="loading-state">Loading insights...</div>';

  try {
    const res = await fetch(`${API_BASE}/ai-insights?phone_id=${phoneId}`);
    const data = await res.json();
    let insights = data.insights || [];

    if (filter === 'flagged') insights = insights.filter(i => i.red_flags?.length > 0);
    else if (filter === 'negative') insights = insights.filter(i => i.sentiment === 'negative');
    else if (filter === 'positive') insights = insights.filter(i => i.sentiment === 'positive');

    renderInsights(insights);
  } catch (e) {
    grid.innerHTML = '<div class="loading-state">Error loading insights</div>';
  }
}

async function loadFlaggedInsights() {
  const grid = document.getElementById('ai-insights-grid');
  grid.innerHTML = '<div class="loading-state">Loading flagged conversations...</div>';

  try {
    const res = await fetch(`${API_BASE}/ai-insights/flagged`);
    const data = await res.json();
    renderInsights(data.flagged || [], true);
  } catch (e) {
    grid.innerHTML = '<div class="loading-state">Select a phone and run AI analysis</div>';
  }
}

function renderInsights(insights, showPhone = false) {
  const grid = document.getElementById('ai-insights-grid');

  if (!insights.length) {
    grid.innerHTML = '<div class="loading-state">No insights yet — select a phone and click "Run AI Analysis"</div>';
    return;
  }

  grid.innerHTML = insights.map(insight => {
    const sentimentColor = { positive: 'success', negative: 'danger', neutral: 'muted', mixed: 'warning' }[insight.sentiment] || 'muted';
    const hasFlags = insight.red_flags?.length > 0;
    const chatName = insight.chats?.contact_name || insight.chats?.group_name || 'Unknown Chat';

    return `
      <div class="insight-card ${hasFlags ? 'flagged' : ''}">
        <div class="insight-header">
          <div class="insight-chat">${chatName}</div>
          <span class="badge badge-${sentimentColor}">${insight.sentiment || 'unknown'}</span>
        </div>
        ${showPhone && insight.phones ? `<div class="insight-phone">📞 ${insight.phones.phone_number} — ${insight.phones.employee_name || ''}</div>` : ''}
        <p class="insight-summary">${insight.summary || ''}</p>
        ${insight.key_topics?.length ? `
          <div class="insight-topics">
            ${insight.key_topics.map(t => `<span class="topic-tag">${t}</span>`).join('')}
          </div>
        ` : ''}
        ${hasFlags ? `
          <div class="insight-flags">
            <div class="flags-title">🚨 Red Flags:</div>
            ${insight.red_flags.map(f => `<div class="flag-item">• ${f}</div>`).join('')}
          </div>
        ` : ''}
        <div class="insight-footer">
          <span>${formatNumber(insight.message_count || 0)} messages</span>
          <span>Analyzed ${formatTime(insight.analyzed_at)}</span>
        </div>
      </div>
    `;
  }).join('');
}

window.triggerAnalysis = async function() {
  const phoneId = document.getElementById('ai-phone-select').value;
  const btn = document.getElementById('analyze-btn');
  const status = document.getElementById('ai-status');

  if (!phoneId) {
    alert('Please select a phone first');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Analyzing...';
  status.style.display = 'block';
  status.className = 'ai-status info';
  status.textContent = '🤖 AI analysis started. This may take 1-2 minutes depending on the number of chats...';

  try {
    const res = await fetch(`${API_BASE}/analyze/${phoneId}`, { method: 'POST' });
    const data = await res.json();

    if (data.error) {
      status.className = 'ai-status error';
      status.textContent = '❌ ' + data.error;
    } else {
      status.className = 'ai-status success';
      status.textContent = '✅ Analysis running in background. Refresh this page in ~2 minutes to see results.';
    }
  } catch (e) {
    status.className = 'ai-status error';
    status.textContent = '❌ Error: ' + e.message;
  }

  btn.disabled = false;
  btn.textContent = '🤖 Run AI Analysis';
};

// ============================================
// Sync Logs
// ============================================

let _logsLiveTimer = null;

async function initLogs() {
  await _fetchAndRenderLogs();

  // If a sync is currently in-progress, poll every 8s for live status
  clearInterval(_logsLiveTimer);
  _logsLiveTimer = setInterval(async () => {
    const page = (window.location.hash || '#/').replace('#/', '') || 'dashboard';
    if (page !== 'logs') { clearInterval(_logsLiveTimer); return; }
    await _fetchAndRenderLogs();
  }, 8000);
}

async function _fetchAndRenderLogs() {
  try {
    const res = await fetch(`${API_BASE}/logs?limit=100`);
    const data = await res.json();
    renderLogs(data.logs || []);
  } catch (error) {
    const tbl = document.getElementById('logs-table');
    if (tbl) tbl.innerHTML = '<tr><td colspan="8" class="loading">Error loading logs</td></tr>';
  }
}

function renderLogs(logs) {
  const table = document.getElementById('logs-table');
  if (!logs || logs.length === 0) {
    table.innerHTML = '<tr><td colspan="8" class="loading">No logs found</td></tr>';
    return;
  }

  table.innerHTML = logs.map(log => `
    <tr>
      <td>${formatTime(log.started_at)}</td>
      <td class="mono">${log.phones?.phone_number || '--'}</td>
      <td>${formatFileSize(log.file_size_bytes)}</td>
      <td>${getStatusBadge(log.status)}</td>
      <td>${log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : '--'}</td>
      <td>${formatNumber(log.messages_added || 0)}</td>
      <td>${formatNumber(log.chats_added || 0)}</td>
      <td title="${log.error_message || ''}">${log.error_message ? '❌ ' + truncate(log.error_message, 30) : '--'}</td>
    </tr>
  `).join('');
}

// ============================================
// Upload
// ============================================

let selectedFile = null;

function initUpload() {
  loadPhonesIntoSelect('phone-select');

  const fileDrop = document.getElementById('file-drop');
  const fileInput = document.getElementById('file-input');

  fileDrop.addEventListener('click', () => fileInput.click());
  fileDrop.addEventListener('dragover', e => { e.preventDefault(); fileDrop.classList.add('dragover'); });
  fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
  fileDrop.addEventListener('drop', e => {
    e.preventDefault(); fileDrop.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e => { if (e.target.files.length > 0) handleFileSelect(e.target.files[0]); });
  document.getElementById('upload-form').addEventListener('submit', handleUpload);
}

async function loadPhonesIntoSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;

  try {
    const res = await fetch(`${API_BASE}/phones`);
    const data = await res.json();
    const phones = data.phones || [];

    if (phones.length > 0) {
      const existingOption = select.querySelector('option[value=""]');
      select.innerHTML = (existingOption ? existingOption.outerHTML : '<option value="">-- Select Phone --</option>') +
        phones.map(p => `<option value="${p.id}">${p.phone_number} — ${p.employee_name || 'Unknown'}</option>`).join('');
    } else {
      select.innerHTML = '<option value="">No phones configured</option>';
    }
  } catch (e) {
    select.innerHTML = '<option value="">Error loading phones</option>';
  }
}

function handleFileSelect(file) {
  if (!file.name.match(/\.crypt1[45]$/i)) {
    alert('Please select a .crypt15 or .crypt14 file');
    return;
  }
  selectedFile = file;
  document.getElementById('file-name').textContent = `${file.name} (${formatFileSize(file.size)})`;
}

async function handleUpload(e) {
  e.preventDefault();
  const phoneId = document.getElementById('phone-select').value;
  if (!phoneId) { alert('Please select a phone'); return; }
  if (!selectedFile) { alert('Please select a backup file'); return; }

  const btn = document.getElementById('upload-btn');
  btn.disabled = true;
  document.getElementById('progress-section').style.display = 'block';
  document.getElementById('result-section').style.display = 'none';
  setProgress(0, 'upload');

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('phone_id', phoneId);
    setProgress(20, 'upload');

    const res = await fetch(`${API_BASE}/upload-backup`, { method: 'POST', body: formData });
    setProgress(60, 'decrypt');

    const result = await res.json();
    if (res.ok) { setProgress(100, 'done'); showResult(true, result); }
    else showResult(false, result);
  } catch (error) {
    showResult(false, { error: error.message });
  }

  btn.disabled = false;
}

function setProgress(percent, step) {
  document.getElementById('progress-fill').style.width = `${percent}%`;
  const steps = ['upload', 'decrypt', 'parse', 'insert', 'done'];
  const stepIndex = steps.indexOf(step);
  steps.forEach((s, i) => {
    const el = document.getElementById(`step-${s}`);
    el.classList.remove('active', 'done');
    if (i < stepIndex) el.classList.add('done');
    else if (i === stepIndex) el.classList.add('active');
  });
}

function showResult(success, data) {
  const section = document.getElementById('result-section');
  const card = document.getElementById('result-card');
  section.style.display = 'block';
  card.className = `result-card ${success ? 'success' : 'error'}`;
  card.innerHTML = success
    ? `<h3>✅ Upload Successful!</h3>
       <p><strong>Phone:</strong> ${data.phone?.phone_number} (${data.phone?.employee_name})</p>
       <p><strong>Messages:</strong> ${formatNumber(data.stats?.parsing?.messageCount || 0)}</p>
       <p><strong>Chats:</strong> ${formatNumber(data.stats?.parsing?.chatCount || 0)}</p>
       <p><strong>Duration:</strong> ${(data.stats?.totalDurationMs / 1000).toFixed(1)}s</p>`
    : `<h3>❌ Upload Failed</h3><p>${data.error || 'Unknown error'}</p>`;
}

// ============================================
// Alerts
// ============================================

async function initAlerts() {
  try {
    const [phonesRes, logsRes] = await Promise.all([
      fetch(`${API_BASE}/phones`),
      fetch(`${API_BASE}/logs?limit=100`)
    ]);

    const phones = (await phonesRes.json()).phones || [];
    const logs = (await logsRes.json()).logs || [];

    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const week = 7 * day;

    const stalePhones = phones.filter(p => p.last_sync_at && (now - new Date(p.last_sync_at)) >= day && (now - new Date(p.last_sync_at)) < week);
    const criticalPhones = phones.filter(p => p.last_sync_at && (now - new Date(p.last_sync_at)) >= week);
    const neverSynced = phones.filter(p => !p.last_sync_at);
    const failedLogs = logs.filter(l => l.status === 'failed' && (now - new Date(l.started_at)) < day);

    document.getElementById('stale-count').textContent = stalePhones.length;
    document.getElementById('week-count').textContent = criticalPhones.length;
    document.getElementById('failed-count').textContent = failedLogs.length;
    document.getElementById('never-count').textContent = neverSynced.length;

    document.getElementById('stale-list').innerHTML = renderAlertList(stalePhones);
    document.getElementById('week-list').innerHTML = renderAlertList(criticalPhones);
    document.getElementById('never-list').innerHTML = renderAlertList(neverSynced);
    document.getElementById('failed-list').innerHTML = failedLogs.map(l =>
      `<div class="alert-list-item">${l.phones?.phone_number || '--'}: ${truncate(l.error_message, 40)}</div>`
    ).join('') || '<div class="alert-list-item">None</div>';

  } catch (e) {
    console.error('Alerts error:', e);
  }
}

function renderAlertList(phones) {
  if (!phones.length) return '<div class="alert-list-item">None</div>';
  const id = 'al-' + Math.random().toString(36).slice(2);
  const rows = phones.map(p =>
    `<div class="alert-list-item">${p.phone_number} — ${p.employee_name || 'Unknown'}</div>`
  ).join('');
  if (phones.length <= 5) return rows;
  const visible = phones.slice(0, 5).map(p =>
    `<div class="alert-list-item">${p.phone_number} — ${p.employee_name || 'Unknown'}</div>`
  ).join('');
  const hidden = phones.slice(5).map(p =>
    `<div class="alert-list-item">${p.phone_number} — ${p.employee_name || 'Unknown'}</div>`
  ).join('');
  return `${visible}
    <div id="${id}-more" style="display:none">${hidden}</div>
    <div class="alert-list-item alert-show-more" onclick="
      document.getElementById('${id}-more').style.display='block';
      this.style.display='none';
    " style="color:var(--blue);cursor:pointer;font-weight:600;">
      ↓ Show ${phones.length - 5} more
    </div>`;
}

// ============================================
// Utilities
// ============================================

function formatNumber(num) {
  if (num === null || num === undefined) return '--';
  return new Intl.NumberFormat().format(num);
}

function formatTime(dateStr) {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString();
}

function formatFileSize(bytes) {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(str, length) {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getStatusBadge(status) {
  const classes = { success: 'success', failed: 'danger', received: 'info', decrypting: 'info', parsing: 'info', inserting: 'info' };
  return `<span class="badge badge-${classes[status] || 'muted'}">${status}</span>`;
}

// ============================================
// Ask AI Chat
// ============================================

let chatHistory = [];

function initChat() {
  chatHistory = [];
  const input = document.getElementById('chat-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  // auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
}

window.askSuggestion = function(btn) {
  const input = document.getElementById('chat-input');
  input.value = btn.textContent;
  sendChatMessage();
};

window.sendChatMessage = async function() {
  const input = document.getElementById('chat-input');
  const question = input.value.trim();
  if (!question) return;

  const container = document.getElementById('chat-messages');

  // Hide welcome screen on first message
  const welcome = container.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  // Append user bubble
  container.insertAdjacentHTML('beforeend', `
    <div class="chat-bubble user">${escapeHtml(question)}</div>
  `);

  input.value = '';
  input.style.height = 'auto';

  const sendBtn = document.getElementById('chat-send-btn');
  sendBtn.disabled = true;

  // Typing indicator
  const typingId = 'typing-' + Date.now();
  container.insertAdjacentHTML('beforeend', `
    <div class="chat-bubble ai typing" id="${typingId}">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </div>
  `);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history: chatHistory })
    });
    const data = await res.json();

    document.getElementById(typingId)?.remove();

    const answer = data.answer || data.error || 'No response';

    container.insertAdjacentHTML('beforeend', `
      <div class="chat-bubble ai">${formatMarkdown(answer)}</div>
    `);

    // Keep history for context (last 6 turns)
    chatHistory.push({ role: 'user', content: question });
    chatHistory.push({ role: 'assistant', content: answer });
    if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);

  } catch (e) {
    document.getElementById(typingId)?.remove();
    container.insertAdjacentHTML('beforeend', `
      <div class="chat-bubble ai error">Error: ${e.message}</div>
    `);
  }

  sendBtn.disabled = false;
  container.scrollTop = container.scrollHeight;
  input.focus();
};

function formatMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/((<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    .replace(/\n/g, '<br>');
}

document.addEventListener('DOMContentLoaded', () => {
  initRouter();
  initSupabaseLive();
});
