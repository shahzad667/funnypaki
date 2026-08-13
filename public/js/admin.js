document.addEventListener('DOMContentLoaded', () => {
  const loginOverlay = document.getElementById('admin-login-overlay');
  const loginForm = document.getElementById('admin-login-form');
  const userInput = document.getElementById('admin-user-input');
  const passInput = document.getElementById('admin-pass-input');
  const toggleEyeBtn = document.getElementById('btn-admin-toggle-eye');
  const loginError = document.getElementById('admin-login-error');

  const mainConsole = document.getElementById('admin-main-console');
  const loggedAdminName = document.getElementById('logged-admin-name');
  const btnLogout = document.getElementById('btn-admin-logout');

  // Nav Tabs
  const tabBtnBans = document.getElementById('tab-btn-bans');
  const tabBtnSpam = document.getElementById('tab-btn-spam');
  const bansSection = document.getElementById('bans-section');
  const spamSection = document.getElementById('spam-section');

  // Bans DOM
  const statIpCount = document.getElementById('stat-ip-count');
  const statNickCount = document.getElementById('stat-nick-count');
  const statShunCount = document.getElementById('stat-shun-count');
  const bansSearchInput = document.getElementById('bans-search-input');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const bansTableBody = document.getElementById('bans-table-body');

  // Anti-Spam DOM
  const addSpamForm = document.getElementById('add-spam-filter-form');
  const spamWordInput = document.getElementById('spam-word-input');
  const spamActionSelect = document.getElementById('spam-action-select');
  const spamTableBody = document.getElementById('spam-table-body');

  let adminToken = localStorage.getItem('admin_token') || null;
  let allBansData = [];
  let currentFilter = 'all';

  // Toggle Password Eye
  if (toggleEyeBtn && passInput) {
    toggleEyeBtn.addEventListener('click', () => {
      const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passInput.setAttribute('type', type);
      toggleEyeBtn.textContent = type === 'password' ? '👁️' : '🙈';
    });
  }

  // Switch Main Nav Tabs
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');

      const sections = ['bans-section', 'spam-section', 'sounds-section', 'visitors-section'];
      sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          if (id === targetId) el.classList.remove('hidden');
          else el.classList.add('hidden');
        }
      });

      if (targetId === 'spam-section') loadSpamFilters();
      if (targetId === 'visitors-section') loadVisitorLogs();
    });
  });


  // Sound File Upload Handlers
  document.querySelectorAll('.upload-sound-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const soundType = form.getAttribute('data-type');
      const fileInput = form.querySelector('input[type="file"]');
      if (!fileInput || !fileInput.files || !fileInput.files[0]) {
        alert('Please select an audio file to upload.');
        return;
      }

      const file = fileInput.files[0];
      const reader = new FileReader();

      reader.onload = async () => {
        const base64Data = reader.result;
        const extension = file.name.split('.').pop().toLowerCase();

        try {
          const res = await fetch('/api/admin/upload-sound', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
              soundType,
              base64Data,
              extension,
              token: adminToken
            })
          });

          const data = await res.json();
          if (data.success) {
            alert(`✅ ${data.message}`);
            const audioPreview = document.getElementById(`audio-preview-${soundType}`);
            if (audioPreview) {
              audioPreview.src = `/sounds/${soundType}.${extension}?t=${Date.now()}`;
              audioPreview.load();
            }
          } else {
            alert(`🛑 Error: ${data.message}`);
          }
        } catch (err) {
          alert(`🛑 Upload failed: ${err.message}`);
        }
      };

      reader.readAsDataURL(file);
    });
  });

  // Check initial token
  if (adminToken) {
    verifyAndLoadAll();
  }

  // Handle Login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = userInput ? userInput.value.trim() : '';
      const password = passInput ? passInput.value.trim() : '';

      if (!username || !password) return;

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.success && data.token) {
          adminToken = data.token;
          localStorage.setItem('admin_token', adminToken);
          localStorage.setItem('admin_user', data.username || username);

          if (loginError) loginError.classList.add('hidden');
          verifyAndLoadAll();
        } else {
          if (loginError) {
            loginError.textContent = '🛑 Invalid Admin Username or Password!';
            loginError.classList.remove('hidden');
          }
        }
      } catch (err) {
        if (loginError) {
          loginError.textContent = '❌ Server Connection Error!';
          loginError.classList.remove('hidden');
        }
      }
    });
  }

  // Handle Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      adminToken = null;
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      if (mainConsole) mainConsole.classList.add('hidden');
      if (loginOverlay) loginOverlay.classList.remove('hidden');
    });
  }

  async function verifyAndLoadAll() {
    if (!adminToken) return;

    try {
      const res = await fetch(`/api/admin/bans?token=${encodeURIComponent(adminToken)}`);
      const data = await res.json();

      if (data.success && data.bans) {
        if (loginOverlay) loginOverlay.classList.add('hidden');
        if (mainConsole) mainConsole.classList.remove('hidden');

        const savedUser = localStorage.getItem('admin_user') || 'shahzad';
        if (loggedAdminName) loggedAdminName.textContent = `Admin: ${savedUser}`;

        processBansData(data.bans);
        loadSpamFilters();
      } else {
        localStorage.removeItem('admin_token');
        adminToken = null;
        if (mainConsole) mainConsole.classList.add('hidden');
        if (loginOverlay) loginOverlay.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Error fetching bans:', err);
    }
  }

  function processBansData(bansObj) {
    const ipBans = (bansObj.ip_bans || []).map(b => ({
      id: b.id,
      type: 'ip',
      typeLabel: 'IP Ban',
      badgeClass: 'badge-ip',
      target: b.ip,
      bannedBy: b.banned_by || 'Server',
      reason: b.reason || 'No reason',
      date: b.created_at ? new Date(b.created_at).toLocaleString() : 'N/A'
    }));

    const nickBans = (bansObj.nick_bans || []).map(b => ({
      id: b.id,
      type: 'nick',
      typeLabel: 'Nick Ban',
      badgeClass: 'badge-nick',
      target: b.original_nick || b.nick_lower,
      bannedBy: b.banned_by || 'Server',
      reason: b.reason || 'No reason',
      date: b.created_at ? new Date(b.created_at).toLocaleString() : 'N/A'
    }));

    const shuns = (bansObj.shuns || []).map(b => ({
      id: b.id,
      type: 'shun',
      typeLabel: 'Stealth Shun',
      badgeClass: 'badge-shun',
      target: b.target,
      bannedBy: b.shunned_by || 'Server',
      reason: b.reason || 'No reason',
      date: b.created_at ? new Date(b.created_at).toLocaleString() : 'N/A'
    }));

    const deviceBans = (bansObj.device_bans || []).map(b => ({
      id: b.id,
      type: 'device',
      typeLabel: 'Device Ban',
      badgeClass: 'badge-device',
      target: `${b.device_id} (${b.target_nick || 'User'})`,
      rawTarget: b.device_id,
      bannedBy: b.banned_by || 'Server',
      reason: b.reason || 'No reason',
      date: b.created_at ? new Date(b.created_at).toLocaleString() : 'N/A'
    }));

    const statDeviceCount = document.getElementById('stat-device-count');

    if (statIpCount) statIpCount.textContent = ipBans.length;
    if (statNickCount) statNickCount.textContent = nickBans.length;
    if (statDeviceCount) statDeviceCount.textContent = deviceBans.length;
    if (statShunCount) statShunCount.textContent = shuns.length;

    allBansData = [...ipBans, ...nickBans, ...deviceBans, ...shuns];
    renderBansTable();
  }

  function renderBansTable() {
    if (!bansTableBody) return;

    const query = bansSearchInput ? bansSearchInput.value.toLowerCase().trim() : '';

    const filtered = allBansData.filter(item => {
      const matchType = currentFilter === 'all' || item.type === currentFilter;
      const matchQuery = !query ||
        item.target.toLowerCase().includes(query) ||
        item.bannedBy.toLowerCase().includes(query) ||
        item.reason.toLowerCase().includes(query) ||
        item.typeLabel.toLowerCase().includes(query);
      return matchType && matchQuery;
    });

    if (filtered.length === 0) {
      bansTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 24px; color: #64748b; font-weight: 600;">
            No active bans found matching filter.
          </td>
        </tr>
      `;
      return;
    }

    bansTableBody.innerHTML = filtered.map(item => `
      <tr>
        <td><span class="badge-type ${item.badgeClass}">${item.typeLabel}</span></td>
        <td style="font-weight: 700; color: #0f172a;">${escapeHTML(item.target)}</td>
        <td style="font-weight: 600; color: #0e6231;">${escapeHTML(item.bannedBy)}</td>
        <td style="color: #475569;">${escapeHTML(item.reason)}</td>
        <td style="font-size: 12px; color: #64748b;">${item.date}</td>
        <td>
          <button class="btn-unban-action" data-type="${item.type}" data-target="${escapeHTML(item.rawTarget || item.target)}">
            🔓 Unban
          </button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.btn-unban-action').forEach(btn => {
      btn.addEventListener('click', async () => {
        const type = btn.getAttribute('data-type');
        const target = btn.getAttribute('data-target');

        if (!confirm(`Are you sure you want to UNBAN '${target}'?`)) return;

        btn.disabled = true;
        btn.textContent = 'Processing...';

        try {
          const res = await fetch('/api/admin/unban', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ type, target })
          });
          const result = await res.json();

          if (result.success) {
            verifyAndLoadAll();
          } else {
            alert(`Error: ${result.message}`);
            btn.disabled = false;
            btn.textContent = '🔓 Unban';
          }
        } catch (err) {
          alert('Failed to unban target.');
          btn.disabled = false;
          btn.textContent = '🔓 Unban';
        }
      });
    });
  }

  // Filter Tabs
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      renderBansTable();
    });
  });

  if (bansSearchInput) {
    bansSearchInput.addEventListener('input', renderBansTable);
  }

  // --- ANTI-SPAM & WORD FILTER FUNCTIONS ---

  async function loadSpamFilters() {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/spam-filters?token=${encodeURIComponent(adminToken)}`);
      const data = await res.json();
      if (data.success && data.filters) {
        renderSpamTable(data.filters);
      }
    } catch (err) {
      console.error('Error loading spam filters:', err);
    }
  }

  function renderSpamTable(filters) {
    if (!spamTableBody) return;

    if (filters.length === 0) {
      spamTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 24px; color: #64748b; font-weight: 600;">
            No active word/spam filters. Add one above!
          </td>
        </tr>
      `;
      return;
    }

    spamTableBody.innerHTML = filters.map(f => {
      let badgeClass = 'badge-act-block';
      let actText = '🚫 Block Message';

      if (f.action === 'kick') { badgeClass = 'badge-act-kick'; actText = '👢 Kick User'; }
      if (f.action === 'ban') { badgeClass = 'badge-act-ban'; actText = '🛑 Ban User'; }
      if (f.action === 'shun') { badgeClass = 'badge-act-shun'; actText = '🤫 Stealth Shun'; }

      const dateStr = f.created_at ? new Date(f.created_at).toLocaleString() : 'N/A';

      return `
        <tr>
          <td style="font-weight: 700; color: #991b1b; font-size: 15px;">${escapeHTML(f.word)}</td>
          <td><span class="badge-type ${badgeClass}">${actText}</span></td>
          <td style="font-weight: 600; color: #0e6231;">${escapeHTML(f.added_by || 'shahzad')}</td>
          <td style="font-size: 12px; color: #64748b;">${dateStr}</td>
          <td>
            <button class="btn-danger-action btn-delete-filter" data-id="${f.id}">
              🗑️ Delete Rule
            </button>
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.btn-delete-filter').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Delete this spam filter rule?')) return;

        btn.disabled = true;
        try {
          const res = await fetch(`/api/admin/spam-filters/${id}?token=${encodeURIComponent(adminToken)}`, {
            method: 'DELETE'
          });
          const result = await res.json();
          if (result.success) {
            loadSpamFilters();
          } else {
            alert(`Error: ${result.message}`);
          }
        } catch (err) {
          alert('Failed to delete spam filter.');
        }
      });
    });
  }

  // Add Spam Filter Submit
  if (addSpamForm) {
    addSpamForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const word = spamWordInput ? spamWordInput.value.trim() : '';
      const action = spamActionSelect ? spamActionSelect.value : 'block';

      if (!word) return;

      try {
        const res = await fetch('/api/admin/spam-filters', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({ word, action })
        });
        const result = await res.json();

        if (result.success) {
          if (spamWordInput) spamWordInput.value = '';
          loadSpamFilters();
        } else {
          alert(`Error: ${result.message}`);
        }
      } catch (err) {
        alert('Failed to add spam filter.');
      }
    });
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- 3-DAY UNIQUE VISITOR LOGS ENGINE ---
  let visitorData = null;
  let currentVisitorDayFilter = 'day1';

  async function loadVisitorLogs() {
    try {
      const res = await fetch('/api/admin/visitor-logs', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        visitorData = data.data;
        renderVisitorStats();
        renderVisitorTable();
      }
    } catch (err) {
      console.error('Error loading visitor logs:', err);
    }
  }

  function renderVisitorStats() {
    if (!visitorData || !visitorData.stats) return;
    const stats = visitorData.stats;
    const elIps = document.getElementById('stat-visitor-ips');
    const elNicks = document.getElementById('stat-visitor-nicks');
    const elDevs = document.getElementById('stat-visitor-devices');
    const elTotal = document.getElementById('stat-visitor-total');

    if (elIps) elIps.textContent = stats.today_unique_ips || 0;
    if (elNicks) elNicks.textContent = stats.today_unique_nicks || 0;
    if (elDevs) elDevs.textContent = stats.today_unique_devices || 0;
    if (elTotal) elTotal.textContent = stats.total_3day_logs || 0;
  }

  function renderVisitorTable() {
    const tableBody = document.getElementById('visitors-table-body');
    const searchInput = document.getElementById('visitors-search-input');
    if (!tableBody || !visitorData) return;

    let logs = [];
    if (currentVisitorDayFilter === 'day1') logs = visitorData.day1_logs || [];
    else if (currentVisitorDayFilter === 'day2') logs = visitorData.day2_logs || [];
    else if (currentVisitorDayFilter === 'day3') logs = visitorData.day3_logs || [];
    else logs = visitorData.all_logs || [];

    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    if (query) {
      logs = logs.filter(item =>
        (item.nick && item.nick.toLowerCase().includes(query)) ||
        (item.ip && item.ip.includes(query)) ||
        (item.device_id && item.device_id.toLowerCase().includes(query)) ||
        (item.timestamp && item.timestamp.toLowerCase().includes(query))
      );
    }

    tableBody.innerHTML = '';
    if (logs.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #64748b;">No visitor logs found for this filter.</td></tr>`;
      return;
    }

    logs.forEach(item => {
      const tr = document.createElement('tr');
      const timeStr = new Date(item.timestamp).toLocaleString();
      tr.innerHTML = `
        <td style="font-size: 13px; font-weight: 500;">${timeStr}</td>
        <td><strong style="color: #0e6231;">${escapeHTML(item.nick)}</strong></td>
        <td><code>${escapeHTML(item.ip)}</code></td>
        <td><code style="font-size: 12px; color: #475569;">${escapeHTML(item.device_id || 'DEV-GENERIC')}</code></td>
        <td>
          <button class="btn-sm btn-danger" onclick="quickBanIP('${escapeHTML(item.ip)}')">Ban IP</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // Day filter listeners
  document.querySelectorAll('.day-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.day-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentVisitorDayFilter = btn.getAttribute('data-day');
      renderVisitorTable();
    });
  });

  const visitorSearchInput = document.getElementById('visitors-search-input');
  if (visitorSearchInput) {
    visitorSearchInput.addEventListener('input', () => {
      renderVisitorTable();
    });
  }

  window.quickBanIP = async (ipToBan) => {
    if (!ipToBan || !confirm(`Are you sure you want to BAN IP address [${ipToBan}]?`)) return;
    try {
      const res = await fetch('/api/admin/unban', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ type: 'ip', target: ipToBan, token: adminToken })
      });
      alert(`IP [${ipToBan}] Ban action triggered.`);
    } catch (e) {}
  };
});

