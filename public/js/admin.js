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
  if (tabBtnBans && tabBtnSpam) {
    tabBtnBans.addEventListener('click', () => {
      tabBtnBans.classList.add('active');
      tabBtnSpam.classList.remove('active');
      bansSection.classList.remove('hidden');
      spamSection.classList.add('hidden');
    });

    tabBtnSpam.addEventListener('click', () => {
      tabBtnSpam.classList.add('active');
      tabBtnBans.classList.remove('active');
      spamSection.classList.remove('hidden');
      bansSection.classList.add('hidden');
      loadSpamFilters();
    });
  }

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
});
