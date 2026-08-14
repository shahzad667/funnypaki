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
  const tabBtnUsers = document.getElementById('tab-btn-users');
  const tabBtnBans = document.getElementById('tab-btn-bans');
  const tabBtnSpam = document.getElementById('tab-btn-spam');
  const tabBtnSounds = document.getElementById('tab-btn-sounds');
  const tabBtnLogs = document.getElementById('tab-btn-logs');

  const usersSection = document.getElementById('users-section');
  const bansSection = document.getElementById('bans-section');
  const spamSection = document.getElementById('spam-section');
  const soundsSection = document.getElementById('sounds-section');
  const visitorLogsSection = document.getElementById('visitor-logs-section');

  // Users DOM
  const statUserTotal = document.getElementById('stat-user-total');
  const statUserOwners = document.getElementById('stat-user-owners');
  const statUserOpers = document.getElementById('stat-user-opers');
  const statUserRegular = document.getElementById('stat-user-regular');
  
  const assignRoleForm = document.getElementById('assign-role-form');
  const roleNickInput = document.getElementById('role-nick-input');
  const roleSelect = document.getElementById('role-select');
  const usersSearchInput = document.getElementById('users-search-input');
  const usersTableBody = document.getElementById('users-table-body');
  const userFilterBtns = document.querySelectorAll('[data-user-filter]');

  // Bans DOM
  const statIpCount = document.getElementById('stat-ip-count');
  const statNickCount = document.getElementById('stat-nick-count');
  const statShunCount = document.getElementById('stat-shun-count');
  const bansSearchInput = document.getElementById('bans-search-input');
  const filterBtns = document.querySelectorAll('.filter-btn:not([data-user-filter]):not([data-log-filter])');
  const bansTableBody = document.getElementById('bans-table-body');

  // Anti-Spam DOM
  const addSpamForm = document.getElementById('add-spam-filter-form');
  const spamWordInput = document.getElementById('spam-word-input');
  const spamActionSelect = document.getElementById('spam-action-select');
  const spamTableBody = document.getElementById('spam-table-body');

  // Visitor Logs DOM
  const statLogIps = document.getElementById('stat-log-ips');
  const statLogNicks = document.getElementById('stat-log-nicks');
  const statLogDevices = document.getElementById('stat-log-devices');
  const logsSearchInput = document.getElementById('logs-search-input');
  const logsTableBody = document.getElementById('logs-table-body');
  const logFilterBtns = document.querySelectorAll('[data-log-filter]');

  let adminToken = localStorage.getItem('admin_token') || null;
  let allBansData = [];
  let allUsersData = [];
  let allLogsData = [];
  let currentFilter = 'all';
  let currentUserFilter = 'all';
  let currentLogFilter = 'today';

  // Toggle Password Eye
  if (toggleEyeBtn && passInput) {
    toggleEyeBtn.addEventListener('click', () => {
      const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passInput.setAttribute('type', type);
      toggleEyeBtn.textContent = type === 'password' ? '👁️' : '🙈';
    });
  }

  function setActiveTab(activeBtn, activeSec) {
    [tabBtnUsers, tabBtnBans, tabBtnSpam, tabBtnSounds, tabBtnLogs].forEach(b => b && b.classList.remove('active'));
    [usersSection, bansSection, spamSection, soundsSection, visitorLogsSection].forEach(s => s && s.classList.add('hidden'));

    if (activeBtn) activeBtn.classList.add('active');
    if (activeSec) activeSec.classList.remove('hidden');
  }

  // Switch Main Nav Tabs
  if (tabBtnUsers) tabBtnUsers.addEventListener('click', () => { setActiveTab(tabBtnUsers, usersSection); loadUsersData(); });
  if (tabBtnBans) tabBtnBans.addEventListener('click', () => { setActiveTab(tabBtnBans, bansSection); });
  if (tabBtnSpam) tabBtnSpam.addEventListener('click', () => { setActiveTab(tabBtnSpam, spamSection); loadSpamFilters(); });
  if (tabBtnSounds) tabBtnSounds.addEventListener('click', () => { setActiveTab(tabBtnSounds, soundsSection); });
  if (tabBtnLogs) tabBtnLogs.addEventListener('click', () => { setActiveTab(tabBtnLogs, visitorLogsSection); loadVisitorLogs(); });

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
        loadUsersData();
        loadSpamFilters();
        loadVisitorLogs();
      } else {
        localStorage.removeItem('admin_token');
        adminToken = null;
        if (mainConsole) mainConsole.classList.add('hidden');
        if (loginOverlay) loginOverlay.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    }
  }

  // REGISTERED USERS DIRECTORY ENGINE
  async function loadUsersData() {
    try {
      const res = await fetch(`/api/admin/data`);
      const data = await res.json();

      if (data && data.registered_nicks) {
        allUsersData = data.registered_nicks;

        const statUserToday = document.getElementById('stat-user-today');
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        let todayCount = 0;
        allUsersData.forEach(u => {
          if (u.created_at) {
            const regDate = new Date(u.created_at);
            if (regDate >= todayStart) todayCount++;
          }
        });

        if (statUserTotal) statUserTotal.textContent = allUsersData.length;
        if (statUserToday) statUserToday.textContent = todayCount;

        renderUsersTable();
      }
    } catch (err) {
      console.error('Error loading users:', err);
    }
  }

  function renderUsersTable() {
    if (!usersTableBody) return;
    const query = usersSearchInput ? usersSearchInput.value.toLowerCase().trim() : '';

    let filtered = allUsersData.filter(u => {
      const nick = (u.nick || '').toLowerCase();
      if (query && !nick.includes(query)) return false;
      return true;
    });

    if (filtered.length === 0) {
      usersTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #64748b;">No registered user accounts found.</td></tr>`;
      return;
    }

    usersTableBody.innerHTML = filtered.map((u, idx) => {
      const regTimeStr = u.created_at ? new Date(u.created_at).toLocaleString() : 'Registered User';
      return `
        <tr>
          <td><strong style="color: #64748b;">${idx + 1}</strong></td>
          <td><strong style="color:#0e6231; font-size:14px;">${u.nick}</strong></td>
          <td><span style="font-size:13px; color:#334155; font-weight: 500;">📅 ${regTimeStr}</span></td>
          <td><span class="badge-type" style="background:#dcfce7; color:#15803d;">✔ Active Account</span></td>
          <td>
            <button class="btn-danger-action btn-drop-nick" data-nick="${u.nick}">
              🗑️ Drop Nick
            </button>
          </td>
        </tr>
      `;
    }).join('');

    document.querySelectorAll('.btn-drop-nick').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetNick = btn.getAttribute('data-nick');
        if (confirm(`Are you sure you want to DROP registered nick '${targetNick}'?\nThis will clear its password and channel access so it can be re-registered.`)) {
          await handleDropNick(targetNick);
        }
      });
    });
  }

  async function handleDropNick(nick) {
    try {
      const res = await fetch('/api/admin/drop-nick', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ nick })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        loadUsersData();
      } else {
        alert('Error: ' + (data.message || 'Could not drop nick'));
      }
    } catch (err) {
      alert('Failed to communicate with server.');
    }
  }

  if (usersSearchInput) {
    usersSearchInput.addEventListener('input', renderUsersTable);
  }

  userFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      userFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentUserFilter = btn.getAttribute('data-user-filter');
      renderUsersTable();
    });
  });

  // SOUND NOTIFICATIONS UPLOAD ENGINE
  function setupSoundUpload(type) {
    const btn = document.getElementById(`btn-upload-${type}`);
    const fileInput = document.getElementById(`file-${type}`);
    const audioPreview = document.getElementById(`audio-preview-${type}`);

    if (btn && fileInput) {
      btn.addEventListener('click', () => {
        const file = fileInput.files[0];
        if (!file) {
          alert('Please select an audio file (.wav or .mp3) to upload!');
          return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
          const fileData = e.target.result;
          try {
            const res = await fetch('/api/admin/upload-sound', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
              },
              body: JSON.stringify({ soundType: type, fileData })
            });
            const data = await res.json();
            if (data.success) {
              alert(data.message);
              if (audioPreview) audioPreview.src = `/sounds/${type}.wav?t=` + Date.now();
            } else {
              alert('Upload Error: ' + data.message);
            }
          } catch (err) {
            alert('Failed to upload audio file.');
          }
        };
        reader.readAsDataURL(file);
      });
    }
  }

  setupSoundUpload('newjoining');
  setupSoundUpload('tagnick');
  setupSoundUpload('private');

  // VISITOR LOGS ENGINE (3-DAY HISTORY)
  async function loadVisitorLogs() {
    try {
      const res = await fetch(`/api/admin/visitor-logs?token=${encodeURIComponent(adminToken)}`);
      const data = await res.json();

      if (data.success && data.logs) {
        allLogsData = data.logs;

        const uniqueIPs = new Set();
        const uniqueNicks = new Set();
        const uniqueDevices = new Set();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        allLogsData.forEach(l => {
          const lDate = new Date(l.last_seen || l.first_seen || Date.now());
          if (lDate >= todayStart) {
            if (l.ip) uniqueIPs.add(l.ip);
            if (l.nick) uniqueNicks.add(l.nick);
            if (l.device_id) uniqueDevices.add(l.device_id);
          }
        });

        if (statLogIps) statLogIps.textContent = uniqueIPs.size;
        if (statLogNicks) statLogNicks.textContent = uniqueNicks.size;
        if (statLogDevices) statLogDevices.textContent = uniqueDevices.size;

        renderVisitorLogsTable();
      }
    } catch (err) {
      console.error('Error fetching visitor logs:', err);
    }
  }

  function renderVisitorLogsTable() {
    if (!logsTableBody) return;
    const query = logsSearchInput ? logsSearchInput.value.toLowerCase().trim() : '';

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - (24 * 60 * 60 * 1000);
    const day3Start = todayStart - (2 * 24 * 60 * 60 * 1000);

    let filtered = allLogsData.filter(item => {
      const itemTime = new Date(item.last_seen || item.first_seen || Date.now()).getTime();

      if (currentLogFilter === 'today' && itemTime < todayStart) return false;
      if (currentLogFilter === 'yesterday' && (itemTime < yesterdayStart || itemTime >= todayStart)) return false;
      if (currentLogFilter === 'day3' && (itemTime < day3Start || itemTime >= yesterdayStart)) return false;

      if (query) {
        const nick = (item.nick || '').toLowerCase();
        const ip = (item.ip || '').toLowerCase();
        const device = (item.device_id || '').toLowerCase();
        const ua = (item.user_agent || '').toLowerCase();
        return nick.includes(query) || ip.includes(query) || device.includes(query) || ua.includes(query);
      }

      return true;
    });

    if (filtered.length === 0) {
      logsTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #64748b;">No visitor logs found for the selected filter.</td></tr>`;
      return;
    }

    logsTableBody.innerHTML = filtered.map(l => `
      <tr>
        <td><strong style="color: #0e6231;">${l.nick || 'Guest'}</strong></td>
        <td><code>${l.ip || '127.0.0.1'}</code></td>
        <td><span class="badge-type badge-device">${l.device_id || 'Browser'}</span></td>
        <td><span style="font-size: 11px; color: #64748b;">${(l.user_agent || 'Web Browser').substring(0, 45)}...</span></td>
        <td><span style="font-size: 12px; color: #475569;">${l.last_seen ? new Date(l.last_seen).toLocaleString() : 'N/A'}</span></td>
        <td>
          <button class="btn-danger-action btn-ban-visitor" data-ip="${l.ip}" data-nick="${l.nick}">
            🛑 Ban IP
          </button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.btn-ban-visitor').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ip = btn.getAttribute('data-ip');
        const nick = btn.getAttribute('data-nick');
        if (confirm(`Ban IP address '${ip}' (${nick})?`)) {
          await handleBanIP(ip, `Banned via Visitor Logs`);
        }
      });
    });
  }

  async function handleBanIP(ip, reason) {
    try {
      const res = await fetch('/api/admin/unban', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ type: 'ip', target: ip })
      });
      alert(`IP address ${ip} ban request processed.`);
    } catch (e) {}
  }

  if (logsSearchInput) {
    logsSearchInput.addEventListener('input', renderVisitorLogsTable);
  }

  logFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      logFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLogFilter = btn.getAttribute('data-log-filter');
      renderVisitorLogsTable();
    });
  });

  // BANS DATA & TABLE ENGINE
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

    let filtered = allBansData.filter(item => {
      if (currentFilter !== 'all' && item.type !== currentFilter) return false;

      if (query) {
        const targetStr = (item.target || '').toLowerCase();
        const byStr = (item.bannedBy || '').toLowerCase();
        const reasonStr = (item.reason || '').toLowerCase();
        return targetStr.includes(query) || byStr.includes(query) || reasonStr.includes(query);
      }
      return true;
    });

    if (filtered.length === 0) {
      bansTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #64748b;">No matching ban entries found.</td></tr>`;
      return;
    }

    bansTableBody.innerHTML = filtered.map(item => `
      <tr>
        <td><span class="badge-type ${item.badgeClass}">${item.typeLabel}</span></td>
        <td><strong>${item.target}</strong></td>
        <td>${item.bannedBy}</td>
        <td>${item.reason}</td>
        <td><span style="font-size: 12px; color: #64748b;">${item.date}</span></td>
        <td>
          <button class="btn-danger-action btn-unban-item" data-type="${item.type}" data-target="${item.rawTarget || item.target}">
            🔓 Remove Ban
          </button>
        </td>
      </tr>
    `).join('');

    document.querySelectorAll('.btn-unban-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const type = btn.getAttribute('data-type');
        const target = btn.getAttribute('data-target');
        if (confirm(`Are you sure you want to remove ${type.toUpperCase()} ban for '${target}'?`)) {
          await handleUnban(type, target);
        }
      });
    });
  }

  async function handleUnban(type, target) {
    try {
      const res = await fetch('/api/admin/unban', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ type, target })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully unbanned ${target}`);
        verifyAndLoadAll();
      } else {
        alert(`Failed to unban: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      alert('Error communicating with server.');
    }
  }

  if (bansSearchInput) {
    bansSearchInput.addEventListener('input', renderBansTable);
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      renderBansTable();
    });
  });

  // ANTI-SPAM ENGINE
  async function loadSpamFilters() {
    try {
      const res = await fetch(`/api/admin/spam-filters?token=${encodeURIComponent(adminToken)}`);
      const data = await res.json();
      if (data.success && data.filters) {
        renderSpamTable(data.filters);
      }
    } catch (err) {
      console.error('Error fetching spam filters:', err);
    }
  }

  function renderSpamTable(filters) {
    if (!spamTableBody) return;

    if (filters.length === 0) {
      spamTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #64748b;">No active spam filters configured.</td></tr>`;
      return;
    }

    spamTableBody.innerHTML = filters.map(f => {
      let badgeClass = 'badge-act-block';
      let actText = '🚫 Block';
      if (f.action === 'kick') { badgeClass = 'badge-act-kick'; actText = '👢 Kick'; }
      else if (f.action === 'ban') { badgeClass = 'badge-act-ban'; actText = '🛑 Ban'; }
      else if (f.action === 'shun') { badgeClass = 'badge-act-shun'; actText = '🤫 Shun'; }

      const dateStr = f.added_at ? new Date(f.added_at).toLocaleString() : 'N/A';

      return `
        <tr>
          <td><strong style="color: #dc2626;">${f.word}</strong></td>
          <td><span class="badge-type ${badgeClass}">${actText}</span></td>
          <td>${f.added_by || 'Admin'}</td>
          <td><span style="font-size: 12px; color: #64748b;">${dateStr}</span></td>
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
        if (confirm('Delete this spam filter rule?')) {
          await deleteSpamFilter(id);
        }
      });
    });
  }

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
        const data = await res.json();
        if (data.success) {
          spamWordInput.value = '';
          loadSpamFilters();
        } else {
          alert(`Error: ${data.message || 'Could not add filter'}`);
        }
      } catch (err) {
        alert('Failed to add filter rule.');
      }
    });
  }

  async function deleteSpamFilter(id) {
    try {
      const res = await fetch(`/api/admin/spam-filters/${id}?token=${encodeURIComponent(adminToken)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        loadSpamFilters();
      } else {
        alert('Could not delete filter.');
      }
    } catch (err) {
      alert('Error deleting filter.');
    }
  }
});
