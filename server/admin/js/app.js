/**
 * WhatsApp Monitor Admin Dashboard
 * Single Page Application
 */

const API_BASE = '/api';

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
  
  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  
  // Update title
  const titles = {
    dashboard: 'Dashboard',
    phones: 'Phones',
    logs: 'Sync Logs',
    upload: 'Upload Backup',
    alerts: 'Alerts'
  };
  document.getElementById('page-title').textContent = titles[page] || 'Dashboard';
  
  // Load page
  loadPage(page);
}

function loadPage(page) {
  const template = document.getElementById(`${page}-template`);
  const content = document.getElementById('content');
  
  if (template) {
    content.innerHTML = '';
    content.appendChild(template.content.cloneNode(true));
    
    // Initialize page
    switch (page) {
      case 'dashboard':
        initDashboard();
        break;
      case 'phones':
        initPhones();
        break;
      case 'logs':
        initLogs();
        break;
      case 'upload':
        initUpload();
        break;
      case 'alerts':
        initAlerts();
        break;
    }
  }
}

// ============================================
// Dashboard Page
// ============================================

async function initDashboard() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    const data = await response.json();
    
    // Update stats
    document.getElementById('stat-phones').textContent = formatNumber(data.totalPhones);
    document.getElementById('stat-active').textContent = formatNumber(data.activePhones);
    document.getElementById('stat-messages').textContent = formatNumber(data.totalMessages);
    document.getElementById('stat-today').textContent = formatNumber(data.messagesToday);
    document.getElementById('stat-success').textContent = `${data.successRate}%`;
    
    // Update recent logs
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
// Phones Page
// ============================================

let phonesData = [];

async function initPhones() {
  try {
    const response = await fetch(`${API_BASE}/phones`);
    const data = await response.json();
    phonesData = data.phones || [];
    
    renderPhones(phonesData);
    
    // Setup filters
    document.getElementById('phone-filter').addEventListener('change', filterPhones);
    document.getElementById('phone-search').addEventListener('input', filterPhones);
  } catch (error) {
    console.error('Phones error:', error);
    document.getElementById('phones-table').innerHTML = 
      '<tr><td colspan="7" class="loading">Error loading phones</td></tr>';
  }
}

function filterPhones() {
  const filter = document.getElementById('phone-filter').value;
  const search = document.getElementById('phone-search').value.toLowerCase();
  
  let filtered = phonesData;
  
  // Apply status filter
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  
  if (filter === 'synced') {
    filtered = filtered.filter(p => p.last_sync_at && (now - new Date(p.last_sync_at)) < day);
  } else if (filter === 'stale') {
    filtered = filtered.filter(p => p.last_sync_at && (now - new Date(p.last_sync_at)) >= day);
  } else if (filter === 'never') {
    filtered = filtered.filter(p => !p.last_sync_at);
  }
  
  // Apply search
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
    table.innerHTML = '<tr><td colspan="7" class="loading">No phones found</td></tr>';
    return;
  }
  
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  
  table.innerHTML = phones.map(phone => {
    const lastSync = phone.last_sync_at ? new Date(phone.last_sync_at) : null;
    const timeSinceSync = lastSync ? now - lastSync : Infinity;
    
    let status, statusClass;
    if (!lastSync) {
      status = 'Never';
      statusClass = 'muted';
    } else if (timeSinceSync < day) {
      status = 'Synced';
      statusClass = 'success';
    } else if (timeSinceSync < 7 * day) {
      status = 'Stale';
      statusClass = 'warning';
    } else {
      status = 'Critical';
      statusClass = 'danger';
    }
    
    return `
      <tr>
        <td class="mono">${phone.phone_number || '--'}</td>
        <td>${phone.employee_name || '--'}</td>
        <td>${phone.department || '--'}</td>
        <td>${lastSync ? formatTime(lastSync) : '--'}</td>
        <td>${formatNumber(phone.total_messages || 0)}</td>
        <td><span class="badge badge-${statusClass}">${status}</span></td>
        <td>
          <button class="btn btn-secondary" onclick="viewPhoneLogs('${phone.id}')">
            View Logs
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function viewPhoneLogs(phoneId) {
  // Navigate to logs with phone filter
  window.location.hash = '#/logs';
  // Could add phone filter to URL
}

// ============================================
// Logs Page
// ============================================

async function initLogs() {
  try {
    const response = await fetch(`${API_BASE}/logs?limit=100`);
    const data = await response.json();
    
    renderLogs(data.logs || []);
  } catch (error) {
    console.error('Logs error:', error);
    document.getElementById('logs-table').innerHTML = 
      '<tr><td colspan="8" class="loading">Error loading logs</td></tr>';
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
// Upload Page
// ============================================

let selectedFile = null;

function initUpload() {
  loadPhonesDropdown();
  
  const fileDrop = document.getElementById('file-drop');
  const fileInput = document.getElementById('file-input');
  const form = document.getElementById('upload-form');
  
  // File drop events
  fileDrop.addEventListener('click', () => fileInput.click());
  
  fileDrop.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDrop.classList.add('dragover');
  });
  
  fileDrop.addEventListener('dragleave', () => {
    fileDrop.classList.remove('dragover');
  });
  
  fileDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDrop.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  });
  
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });
  
  // Form submit
  form.addEventListener('submit', handleUpload);
}

async function loadPhonesDropdown() {
  const select = document.getElementById('phone-select');
  
  try {
    const response = await fetch(`${API_BASE}/phones`);
    const data = await response.json();
    
    if (data.phones && data.phones.length > 0) {
      select.innerHTML = '<option value="">-- Select Phone --</option>' +
        data.phones.map(p => 
          `<option value="${p.id}">${p.phone_number} - ${p.employee_name || 'Unknown'}</option>`
        ).join('');
    } else {
      select.innerHTML = '<option value="">No phones configured</option>';
    }
  } catch (error) {
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
  
  if (!phoneId) {
    alert('Please select a phone');
    return;
  }
  
  if (!selectedFile) {
    alert('Please select a backup file');
    return;
  }
  
  const btn = document.getElementById('upload-btn');
  const progressSection = document.getElementById('progress-section');
  const resultSection = document.getElementById('result-section');
  
  btn.disabled = true;
  progressSection.style.display = 'block';
  resultSection.style.display = 'none';
  
  // Update progress
  setProgress(0, 'upload');
  
  try {
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('phone_id', phoneId);
    
    setProgress(20, 'upload');
    
    const response = await fetch(`${API_BASE}/upload-backup`, {
      method: 'POST',
      body: formData
    });
    
    setProgress(60, 'decrypt');
    
    const result = await response.json();
    
    if (response.ok) {
      setProgress(100, 'done');
      showResult(true, result);
    } else {
      showResult(false, result);
    }
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
    if (i < stepIndex) {
      el.classList.add('done');
    } else if (i === stepIndex) {
      el.classList.add('active');
    }
  });
}

function showResult(success, data) {
  const resultSection = document.getElementById('result-section');
  const resultCard = document.getElementById('result-card');
  
  resultSection.style.display = 'block';
  resultCard.className = `result-card ${success ? 'success' : 'error'}`;
  
  if (success) {
    resultCard.innerHTML = `
      <h3>✅ Upload Successful!</h3>
      <p><strong>Phone:</strong> ${data.phone?.phone_number} (${data.phone?.employee_name})</p>
      <p><strong>Messages Parsed:</strong> ${formatNumber(data.stats?.parsing?.messageCount || 0)}</p>
      <p><strong>Chats Found:</strong> ${formatNumber(data.stats?.parsing?.chatCount || 0)}</p>
      <p><strong>Total Time:</strong> ${(data.stats?.totalDurationMs / 1000).toFixed(1)}s</p>
    `;
  } else {
    resultCard.innerHTML = `
      <h3>❌ Upload Failed</h3>
      <p>${data.error || 'Unknown error'}</p>
    `;
  }
}

// ============================================
// Alerts Page
// ============================================

async function initAlerts() {
  try {
    const [phonesRes, logsRes] = await Promise.all([
      fetch(`${API_BASE}/phones`),
      fetch(`${API_BASE}/logs?limit=100`)
    ]);
    
    const phonesData = await phonesRes.json();
    const logsData = await logsRes.json();
    
    const phones = phonesData.phones || [];
    const logs = logsData.logs || [];
    
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const week = 7 * day;
    
    // Categorize phones
    const stalePhones = phones.filter(p => {
      if (!p.last_sync_at) return false;
      const diff = now - new Date(p.last_sync_at);
      return diff >= day && diff < week;
    });
    
    const criticalPhones = phones.filter(p => {
      if (!p.last_sync_at) return false;
      return (now - new Date(p.last_sync_at)) >= week;
    });
    
    const neverSynced = phones.filter(p => !p.last_sync_at);
    
    // Failed logs in last 24h
    const failedLogs = logs.filter(l => {
      if (l.status !== 'failed') return false;
      return (now - new Date(l.started_at)) < day;
    });
    
    // Update counts
    document.getElementById('stale-count').textContent = stalePhones.length;
    document.getElementById('week-count').textContent = criticalPhones.length;
    document.getElementById('failed-count').textContent = failedLogs.length;
    document.getElementById('never-count').textContent = neverSynced.length;
    
    // Update lists
    document.getElementById('stale-list').innerHTML = renderAlertList(stalePhones);
    document.getElementById('week-list').innerHTML = renderAlertList(criticalPhones);
    document.getElementById('never-list').innerHTML = renderAlertList(neverSynced);
    document.getElementById('failed-list').innerHTML = failedLogs.map(l => 
      `<div class="alert-list-item">${l.phones?.phone_number || '--'}: ${truncate(l.error_message, 40)}</div>`
    ).join('') || '<div class="alert-list-item">None</div>';
    
  } catch (error) {
    console.error('Alerts error:', error);
  }
}

function renderAlertList(phones) {
  if (phones.length === 0) return '<div class="alert-list-item">None</div>';
  return phones.slice(0, 5).map(p => 
    `<div class="alert-list-item">${p.phone_number} - ${p.employee_name || 'Unknown'}</div>`
  ).join('') + (phones.length > 5 ? `<div class="alert-list-item">...and ${phones.length - 5} more</div>` : '');
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

function getStatusBadge(status) {
  const classes = {
    success: 'success',
    failed: 'danger',
    received: 'info',
    decrypting: 'info',
    parsing: 'info',
    inserting: 'info'
  };
  return `<span class="badge badge-${classes[status] || 'muted'}">${status}</span>`;
}

// ============================================
// Initialize
// ============================================

document.addEventListener('DOMContentLoaded', initRouter);
