// #FunnyPaki WebIRC JavaScript Client (Emoji Sizing & Text Smilies Auto-Converter)
document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // State
  let currentNick = '';
  let currentIP = '';
  let activeWindow = '#FunnyPaki';
  let isRegistered = false;
  let isAdmin = false;
  let globalRole = 'user';
  let selectedTargetUser = null;
  let unreadCounts = {};
  let currentChannelUsers = [];

  // Channel Cache: channel_lower -> { name, topic, modes, users }
  const channelCache = {};

  // Formatting state
  let isBold = false;
  let isItalic = false;
  let isUnderline = false;

  // Vibrant Palette for User Badges & Nicks
  const COLOR_PALETTE = [
    '#ef4444', '#ec4899', '#8b5cf6', '#10b981', '#f59e0b',
    '#06b6d4', '#3b82f6', '#e11d48', '#059669', '#d97706'
  ];

  function getNickColor(nick) {
    if (!nick) return COLOR_PALETTE[0];
    let hash = 0;
    for (let i = 0; i < nick.length; i++) {
      hash = nick.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % COLOR_PALETTE.length;
    return COLOR_PALETTE[index];
  }

  // --- TEXT SMILIES SHORTCUT KEY AUTO-CONVERTER ---
  function parseEmojiShortcuts(escapedText) {
    if (!escapedText) return '';
    const map = {
      ':-)' : '😊', ':)' : '😊',
      ':-(' : '🙁', ':(' : '🙁',
      ':-D' : '😀', ':D' : '😀',
      ';-)' : '😉', ';)' : '😉',
      ':-P' : '😛', ':-p' : '😛', ':P' : '😛', ':p' : '😛',
      '&lt;3': '❤️', '<3'  : '❤️',
      ':-O' : '😮', ':-o' : '😮', ':O' : '😮', ':o' : '😮',
      '8-)' : '😎', '8)'  : '😎', 'B)' : '😎',
      ":'(" : '😢', ';('  : '😢',
      '(y)' : '👍', '(Y)' : '👍'
    };

    return escapedText.replace(/(:\-\)|:\)|:\-\(|:\(|:\-D|:D|;\-\)|;\)|:\-P|:\-p|:P|:p|&lt;3|<3|:\-O|:\-o|:O|:o|8\-\)|8\)|B\)|:'\(|;\(|\(y\)|\(Y\))/g, (match) => {
      const emoji = map[match] || match;
      return `<span class="emoji-char">${emoji}</span>`;
    });
  }

  // DOM
  const chatInput = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-send-message');
  const chatLogsContainer = document.getElementById('chat-logs-container');
  const tabList = document.getElementById('tab-list');
  const userListContainer = document.getElementById('user-list-container');
  const windowTitleText = document.getElementById('window-title-text');
  const windowModesText = document.getElementById('window-modes-text');
  const windowTopicText = document.getElementById('window-topic-text');
  const currentNickDisplay = document.getElementById('current-nick-display');
  const userStatusBadge = document.getElementById('user-status-badge');
  const userCount = document.getElementById('user-count');
  const btnAdminModal = document.getElementById('btn-admin-modal');

  // Context Menu
  const contextMenu = document.getElementById('user-context-menu');
  const ctxUserTitle = document.getElementById('ctx-user-title');

  // Emoji Picker & Formatting
  const emojiPicker = document.getElementById('emoji-picker');
  const btnToggleEmoji = document.getElementById('btn-toggle-emoji');
  const btnCloseEmoji = document.getElementById('btn-close-emoji');
  const btnFmtBold = document.getElementById('btn-fmt-bold');
  const btnFmtItalic = document.getElementById('btn-fmt-italic');
  const btnFmtUnderline = document.getElementById('btn-fmt-underline');

  // Front Login Overlay DOM
  const loginOverlay = document.getElementById('login-overlay');
  const loginForm = document.getElementById('login-form');
  const loginNickInput = document.getElementById('login-nick-input');
  const loginPassInput = document.getElementById('login-pass-input');
  const btnToggleEye = document.getElementById('btn-toggle-eye');

  // Eye Password Visibility Toggle
  if (btnToggleEye && loginPassInput) {
    btnToggleEye.addEventListener('click', () => {
      const type = loginPassInput.getAttribute('type') === 'password' ? 'text' : 'password';
      loginPassInput.setAttribute('type', type);
      btnToggleEye.textContent = type === 'password' ? '👁️' : '🙈';
    });
  }

  function generateDeviceFingerprint() {
    try {
      let saved = localStorage.getItem('pakichat_device_id');
      if (saved && saved.startsWith('DEV-')) return saved;

      const screenSig = `${screen.width}x${screen.height}x${screen.colorDepth}`;
      const tzSig = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      const cores = navigator.hardwareConcurrency || 4;
      const mem = navigator.deviceMemory || 4;
      const ua = navigator.userAgent || '';

      let canvasHash = 'cvs000';
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('FunnyPaki#2026', 2, 15);
        const dataUrl = canvas.toDataURL();
        let hash = 0;
        for (let i = 0; i < dataUrl.length; i++) {
          hash = ((hash << 5) - hash) + dataUrl.charCodeAt(i);
          hash |= 0;
        }
        canvasHash = Math.abs(hash).toString(16).toUpperCase();
      } catch (e) {}

      const rawSig = `${screenSig}|${tzSig}|${cores}|${mem}|${canvasHash}|${ua.substring(0, 40)}`;
      let strHash = 0;
      for (let i = 0; i < rawSig.length; i++) {
        strHash = ((strHash << 5) - strHash) + rawSig.charCodeAt(i);
        strHash |= 0;
      }
      const hexPart1 = Math.abs(strHash).toString(16).toUpperCase().padStart(4, '0').substring(0, 4);
      const hexPart2 = Math.abs((strHash * 31) | 0).toString(16).toUpperCase().padStart(4, '0').substring(0, 4);

      const deviceId = `DEV-${hexPart1}-${hexPart2}`;
      localStorage.setItem('pakichat_device_id', deviceId);
      document.cookie = `pakichat_dev_id=${deviceId}; path=/; max-age=315360000`;
      return deviceId;
    } catch (err) {
      return 'DEV-GENERIC-0000';
    }
  }

  const clientDeviceId = generateDeviceFingerprint();

  socket.on('connect', () => {
    socket.emit('set_device_id', { deviceId: clientDeviceId });
  });

  // Handle Login Connect Submit (With 5-Second Buffer Delay)
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const chosenNick = loginNickInput ? loginNickInput.value.trim() : '';
      const chosenPass = loginPassInput ? loginPassInput.value.trim() : '';
      const btnConnect = document.getElementById('login-btn-connect');

      if (!chosenNick) return;

      if (btnConnect) {
        btnConnect.disabled = true;
        btnConnect.classList.add('connecting');
      }

      let secondsLeft = 5;
      const updateButtonText = () => {
        if (btnConnect) {
          btnConnect.innerHTML = `<span class="spinner-icon">⏳</span> Connecting (${secondsLeft}s)...`;
        }
      };

      updateButtonText();

      const countdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) {
          updateButtonText();
        } else {
          clearInterval(countdownInterval);
        }
      }, 1000);

      // 5 Seconds Buffer Delay
      setTimeout(() => {
        if (chosenNick) {
          socket.emit('change_nick', { newNick: chosenNick, deviceId: clientDeviceId });
        }

        if (chosenPass) {
          setTimeout(() => {
            socket.emit('identify', { nick: chosenNick || currentNick, password: chosenPass });
          }, 300);
        }

        if (loginOverlay) {
          loginOverlay.style.opacity = '0';
          loginOverlay.style.pointerEvents = 'none';
          setTimeout(() => {
            loginOverlay.classList.add('hidden');
          }, 300);
        }

        setTimeout(() => {
          if (chatInput) chatInput.focus();
        }, 400);
      }, 5000);
    });
  }

  // --- Socket Listeners ---

  socket.on('user_init', (data) => {
    currentNick = data.nick;
    currentIP = data.ip;
    updateUserBadge();

    // Populate default nick into login input if empty
    if (loginNickInput && !loginNickInput.value) {
      loginNickInput.value = currentNick;
    }

    data.channels.forEach(ch => addChannelTab(ch));
    switchWindow('#FunnyPaki');
  });

  socket.on('system_notice', ({ type, message }) => {
    appendSystemMessage(activeWindow, type, message);
  });

  socket.on('banned', ({ reason }) => {
    alert(`BANNED FROM SERVER:\n${reason}`);
    window.location.reload();
  });

  socket.on('nick_updated', (data) => {
    currentNick = data.nick;
    isRegistered = data.identified;
    isAdmin = data.is_admin;
    globalRole = data.global_role || 'user';
    updateUserBadge();
    appendSystemMessage(activeWindow, 'success', `*** Your nick is now '${currentNick}'`);
    if (isAdmin || globalRole === 'owner' || globalRole === 'oper') {
      btnAdminModal.classList.remove('hidden');
    }
  });

  socket.on('channel_user_list', ({ channel, topic, modes, users }) => {
    const chLower = channel.toLowerCase();
    channelCache[chLower] = {
      name: channel,
      topic: topic || `Topic for ${channel}`,
      modes: modes ? `[${modes}]` : '',
      users: users
    };

    if (activeWindow.toLowerCase() === chLower) {
      windowTopicText.textContent = channelCache[chLower].topic;
      windowModesText.textContent = channelCache[chLower].modes;
      currentChannelUsers = users;
      renderUserListGrouped(users, channel);
    }
  });

  socket.on('chat_message', ({ channel, nick, prefix, roleName, message, textColor, bgColor, timestamp }) => {
    const isSelf = nick.toLowerCase() === currentNick.toLowerCase();
    appendChatMessage(channel, nick, prefix, roleName, message, timestamp, false, isSelf, textColor, bgColor);
  });

  socket.on('chat_action', ({ channel, nick, action, timestamp }) => {
    appendActionMessage(channel, nick, action, timestamp);
  });

  socket.on('private_message', ({ from, to, message, textColor, bgColor, timestamp }) => {
    const otherParty = (from.toLowerCase() === currentNick.toLowerCase()) ? to : from;
    ensurePMTabExists(otherParty);

    const isSelf = from.toLowerCase() === currentNick.toLowerCase();
    appendChatMessage(otherParty, from, '', 'User', message, timestamp, true, isSelf, textColor, bgColor);

    if (activeWindow.toLowerCase() !== otherParty.toLowerCase()) {
      incrementUnread(otherParty);
    }
  });

  socket.on('user_joined', ({ channel, nick, ip }) => {
    appendSystemMessage(channel, 'join', `*** ${nick} [${ip}] has joined ${channel}`);
  });

  socket.on('user_part', ({ channel, nick, reason }) => {
    appendSystemMessage(channel, 'part', `*** ${nick} has left ${channel} (${reason})`);
  });

  const loginAlertBanner = document.getElementById('login-alert-banner');

  function showLoginRedirect(type, title, message) {
    if (loginOverlay) {
      loginOverlay.style.opacity = '1';
      loginOverlay.style.pointerEvents = 'auto';
      loginOverlay.classList.remove('hidden');
    }

    const btnConnect = document.getElementById('login-btn-connect');
    if (btnConnect) {
      btnConnect.disabled = false;
      btnConnect.classList.remove('connecting');
      btnConnect.textContent = 'Connect';
    }

    if (loginAlertBanner) {
      loginAlertBanner.className = `login-alert-banner ${type}`;
      loginAlertBanner.innerHTML = `<strong>${title}</strong><br/>${message}`;
      loginAlertBanner.classList.remove('hidden');
    }
  }

  socket.on('user_kicked', ({ channel, targetNick, kickedBy, reason }) => {
    appendSystemMessage(channel, 'kick', `*** ${targetNick} was kicked from ${channel} by ${kickedBy} (${reason})`);
  });

  socket.on('you_were_kicked', ({ channel, kickedBy, reason }) => {
    showLoginRedirect(
      'kick',
      '⚠️ You Were Kicked',
      `You were kicked from <strong>${channel}</strong> by <strong>${escapeHTML(kickedBy)}</strong><br/>Reason: <em>${escapeHTML(reason)}</em>`
    );
  });

  socket.on('you_were_banned', ({ channel, bannedBy, reason }) => {
    showLoginRedirect(
      'ban',
      '🛑 You Have Been Banned',
      `You were banned from <strong>${channel}</strong> by <strong>${escapeHTML(bannedBy)}</strong><br/>Reason: <em>${escapeHTML(reason)}</em>`
    );
  });

  socket.on('you_were_killed', ({ killedBy, reason }) => {
    showLoginRedirect(
      'kill',
      '💥 Connection Terminated (KILL)',
      `You were killed by Oper <strong>${escapeHTML(killedBy)}</strong><br/>Reason: <em>${escapeHTML(reason)}</em>`
    );
  });

  socket.on('nick_changed', ({ channel, oldNick, newNick }) => {
    appendSystemMessage(channel, 'info', `*** ${oldNick} is now known as ${newNick}`);
  });

  socket.on('topic_changed', ({ channel, topic, setBy }) => {
    appendSystemMessage(channel, 'info', `*** ${setBy} changed topic of ${channel} to: ${topic}`);

    const chLower = channel.toLowerCase();
    if (channelCache[chLower]) {
      channelCache[chLower].topic = topic;
    }

    if (activeWindow.toLowerCase() === chLower) {
      windowTopicText.textContent = topic;
    }
  });

  socket.on('mode_change', ({ channel, mode, setBy }) => {
    appendSystemMessage(channel, 'info', `*** ${setBy} set mode ${mode} in ${channel}`);
  });

  socket.on('admin_data_res', (data) => {
    renderAdminTables(data);
  });

  // --- UI Helpers ---

  function updateUserBadge() {
    currentNickDisplay.textContent = currentNick;

    if (globalRole === 'owner') {
      userStatusBadge.textContent = 'Owner ~';
      userStatusBadge.className = 'badge badge-owner';
      btnAdminModal.classList.remove('hidden');
    } else if (isAdmin || globalRole === 'admin' || globalRole === 'oper') {
      userStatusBadge.textContent = 'Oper &';
      userStatusBadge.className = 'badge badge-admin';
      btnAdminModal.classList.remove('hidden');
    } else if (isRegistered) {
      userStatusBadge.textContent = 'Registered +';
      userStatusBadge.className = 'badge badge-reg';
    } else {
      userStatusBadge.textContent = 'Guest';
      userStatusBadge.className = 'badge badge-guest';
    }
  }

  function getOrCreateWindowElement(winName) {
    const cleanId = 'window-' + winName.replace(/[^a-zA-Z0-9_-]/g, '_');
    let winEl = document.getElementById(cleanId);
    if (!winEl) {
      winEl = document.createElement('div');
      winEl.id = cleanId;
      winEl.className = 'chat-window';
      chatLogsContainer.appendChild(winEl);
    }
    return winEl;
  }

  function switchWindow(winName) {
    activeWindow = winName;
    windowTitleText.textContent = winName;

    document.querySelectorAll('.pakichat-tab').forEach(el => el.classList.remove('active'));

    const targetTab = document.querySelector(`.pakichat-tab[data-target="${winName}"]`);
    if (targetTab) {
      targetTab.classList.add('active');
      const unreadEl = targetTab.querySelector('.unread-count');
      if (unreadEl) unreadEl.remove();
      unreadCounts[winName] = 0;
    }

    document.querySelectorAll('.chat-window').forEach(el => el.classList.remove('active'));
    const winEl = getOrCreateWindowElement(winName);
    winEl.classList.add('active');
    scrollToBottom();

    if (winName.startsWith('#')) {
      const chLower = winName.toLowerCase();

      if (channelCache[chLower]) {
        windowTopicText.textContent = channelCache[chLower].topic;
        windowModesText.textContent = channelCache[chLower].modes;
        currentChannelUsers = channelCache[chLower].users;
        renderUserListGrouped(channelCache[chLower].users, winName);
      } else {
        windowTopicText.textContent = `Topic for ${winName}`;
        windowModesText.textContent = '';
      }

      socket.emit('join_channel', { channel: winName });
    } else if (winName === 'Status') {
      userListContainer.innerHTML = '<div class="user-item"><span class="u-icon">💻</span><span class="u-nick">Console Status</span></div>';
      userCount.textContent = '1';
      windowTopicText.textContent = 'System Status Console';
      windowModesText.textContent = '';
      currentChannelUsers = [];
    } else {
      userListContainer.innerHTML = '<div class="user-item"><span class="u-icon">👤</span><span class="u-nick">PM Window</span></div>';
      userCount.textContent = '1';
      windowTopicText.textContent = `Direct Message with ${winName}`;
      windowModesText.textContent = '';
      currentChannelUsers = [];
    }
  }

  function closeTabOrWindow(winName) {
    const targetTab = document.querySelector(`.pakichat-tab[data-target="${winName}"]`);
    if (targetTab) targetTab.remove();

    const cleanId = 'window-' + winName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const winEl = document.getElementById(cleanId);
    if (winEl) winEl.remove();

    if (winName.startsWith('#')) {
      socket.emit('part_channel', { channel: winName });
      delete channelCache[winName.toLowerCase()];
    }

    delete unreadCounts[winName];

    if (activeWindow.toLowerCase() === winName.toLowerCase()) {
      switchWindow('#FunnyPaki');
    }
  }

  function addChannelTab(chName) {
    let existing = document.querySelector(`.pakichat-tab[data-target="${chName}"]`);
    if (!existing) {
      const li = document.createElement('li');
      li.className = 'pakichat-tab';
      li.setAttribute('data-target', chName);
      li.innerHTML = `<span class="tab-label">${chName}</span> <span class="tab-close">&times;</span>`;

      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) {
          e.stopPropagation();
          closeTabOrWindow(chName);
        } else {
          switchWindow(chName);
        }
      });

      tabList.appendChild(li);
    }
    getOrCreateWindowElement(chName);
  }

  function ensurePMTabExists(nick) {
    let existing = document.querySelector(`.pakichat-tab[data-target="${nick}"]`);
    if (!existing) {
      const li = document.createElement('li');
      li.className = 'pakichat-tab';
      li.setAttribute('data-target', nick);
      li.innerHTML = `<span class="tab-label">${nick}</span> <span class="tab-close">&times;</span>`;

      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) {
          e.stopPropagation();
          closeTabOrWindow(nick);
        } else {
          switchWindow(nick);
        }
      });

      tabList.appendChild(li);
    }
    getOrCreateWindowElement(nick);
  }

  // Attach close event to default static tabs
  document.querySelectorAll('.pakichat-tab').forEach(tab => {
    const target = tab.getAttribute('data-target');
    const closeBtn = tab.querySelector('.tab-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTabOrWindow(target);
      });
    }
    tab.addEventListener('click', () => switchWindow(target));
  });

  function incrementUnread(winName) {
    unreadCounts[winName] = (unreadCounts[winName] || 0) + 1;
    const navEl = document.querySelector(`.pakichat-tab[data-target="${winName}"]`);
    if (navEl) {
      let unreadEl = navEl.querySelector('.unread-count');
      if (!unreadEl) {
        unreadEl = document.createElement('span');
        unreadEl.className = 'unread-count';
        navEl.appendChild(unreadEl);
      }
      unreadEl.textContent = unreadCounts[winName];
    }
  }

  function renderUserListGrouped(users, channel) {
    userListContainer.innerHTML = '';
    userCount.textContent = users.length;
    const mobileUserCount = document.getElementById('mobile-user-count');
    if (mobileUserCount) mobileUserCount.textContent = users.length;

    const groups = {
      owner: { title: '👑 Owners (~)', sticker: '🏡', list: [] },
      admin: { title: '🛡️ Admins (&)', sticker: '🔑', list: [] },
      op: { title: '⭐ Operators (@)', sticker: '⭐', list: [] },
      halfop: { title: '⚡ Half-Ops (%)', sticker: '⚡', list: [] },
      voice: { title: '🔊 Voice / Reg (+)', sticker: '🔊', list: [] },
      guest: { title: '💬 Users / Guests', sticker: '👤', list: [] }
    };

    users.forEach(u => {
      if (u.prefix === '~') groups.owner.list.push(u);
      else if (u.prefix === '&') groups.admin.list.push(u);
      else if (u.prefix === '@') groups.op.list.push(u);
      else if (u.prefix === '%') groups.halfop.list.push(u);
      else if (u.prefix === '+') groups.voice.list.push(u);
      else groups.guest.list.push(u);
    });

    Object.keys(groups).forEach(key => {
      const group = groups[key];
      if (group.list.length > 0) {
        const titleDiv = document.createElement('div');
        titleDiv.className = 'rank-group-title';
        titleDiv.textContent = `${group.title} (${group.list.length})`;
        userListContainer.appendChild(titleDiv);

        const ul = document.createElement('ul');
        ul.className = 'user-list';

        group.list.forEach(u => {
          const nickColor = getNickColor(u.nick);
          const li = document.createElement('li');
          li.className = 'user-item';
          li.innerHTML = `
            <span class="u-icon">👤</span>
            <span class="u-nick" style="color: ${nickColor}" title="${u.prefix || ''}${u.nick}">${u.prefix || ''}${u.nick}</span>
            <span class="u-sticker">${group.sticker}</span>
          `;

          li.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            selectedTargetUser = { nick: u.nick, ip: u.ip, channel: channel, rank: u.rank, roleName: u.roleName, isRegistered: u.isRegistered };
            openContextMenu(e.clientX, e.clientY);
          });

          li.addEventListener('dblclick', () => {
            if (u.nick.toLowerCase() !== currentNick.toLowerCase()) {
              ensurePMTabExists(u.nick);
              switchWindow(u.nick);
            }
          });

          ul.appendChild(li);
        });

        userListContainer.appendChild(ul);
      }
    });
  }

  function formatTimeHHMM(ts) {
    if (!ts) {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts).substring(0, 5);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function appendChatMessage(winName, nick, prefix, roleName, message, timestamp, isPM = false, isSelf = false, textColor = null, bgColor = null) {
    const winEl = getOrCreateWindowElement(winName);
    const line = document.createElement('div');
    line.className = `chat-line ${isPM ? 'pm' : ''}`;

    const nickColor = getNickColor(nick);

    // AUTO-CONVERT TEXT SMILIES & ENHANCE EMOJI SIZING
    let formattedMsg = parseEmojiShortcuts(escapeHTML(message));

    if (textColor || (bgColor && bgColor !== 'transparent')) {
      const styles = [];
      if (textColor) styles.push(`color: ${textColor}`);
      if (bgColor && bgColor !== 'transparent') styles.push(`background-color: ${bgColor}`);
      formattedMsg = `<span class="msg-text-colored" style="${styles.join('; ')}">${formattedMsg}</span>`;
    }

    const timeStr = formatTimeHHMM(timestamp);
    const initialLetter = (nick[0] || 'U').toUpperCase();

    line.innerHTML = `
      <div class="avatar-badge" style="background-color: ${nickColor}">${initialLetter}</div>
      <div class="time-col">${timeStr}</div>
      <div class="nick-col nick-colored" style="color: ${nickColor}">${prefix || ''}${escapeHTML(nick)}</div>
      <span class="arrow-sep">➔</span>
      <div class="msg-col msg-text">${formattedMsg}</div>
    `;

    winEl.appendChild(line);
    scrollToBottom();
  }

  function appendActionMessage(winName, nick, action, timestamp) {
    const winEl = getOrCreateWindowElement(winName);
    const line = document.createElement('div');
    line.className = 'chat-line action';
    const nickColor = getNickColor(nick);
    const formattedAction = parseEmojiShortcuts(escapeHTML(action));
    line.innerHTML = `
      <div class="avatar-badge" style="background-color: ${nickColor}">*</div>
      <span class="nick-colored" style="color: ${nickColor}">${escapeHTML(nick)}</span>
      <span class="arrow-sep">➔</span>
      <span class="msg-text"><em>${formattedAction}</em></span>
    `;
    winEl.appendChild(line);
    scrollToBottom();
  }

  function appendSystemMessage(winName, type, message) {
    const winEl = getOrCreateWindowElement(winName);
    const line = document.createElement('div');
    line.className = `sys-msg ${type}`;
    line.textContent = message;
    winEl.appendChild(line);
    scrollToBottom();
  }

  function scrollToBottom() {
    chatLogsContainer.scrollTop = chatLogsContainer.scrollHeight;
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // Context Menu
  function openContextMenu(x, y) {
    if (!selectedTargetUser) return;
    ctxUserTitle.textContent = `${selectedTargetUser.nick} [${selectedTargetUser.roleName}]`;

    contextMenu.style.display = 'block';
    contextMenu.classList.remove('hidden');

    const menuWidth = contextMenu.offsetWidth || 195;
    const menuHeight = contextMenu.offsetHeight || 320;

    let posX = x;
    let posY = y;

    // Always position to the left if opened near right user list panel
    if (posX + menuWidth > window.innerWidth - 10) {
      posX = Math.max(10, posX - menuWidth);
    }

    // Adjust top position to prevent bottom screen clipping
    if (posY + menuHeight > window.innerHeight - 10) {
      posY = Math.max(10, window.innerHeight - menuHeight - 10);
    }

    contextMenu.style.left = `${posX}px`;
    contextMenu.style.top = `${posY}px`;
  }

  function closeContextMenu() {
    contextMenu.classList.add('hidden');
  }

  document.addEventListener('click', closeContextMenu);

  document.getElementById('ctx-action-pm').addEventListener('click', () => {
    if (selectedTargetUser) {
      ensurePMTabExists(selectedTargetUser.nick);
      switchWindow(selectedTargetUser.nick);
    }
  });

  document.getElementById('ctx-action-owner').addEventListener('click', () => {
    if (selectedTargetUser) {
      socket.emit('set_role', { channel: activeWindow, targetNick: selectedTargetUser.nick, role: 'owner', active: true });
    }
  });

  document.getElementById('ctx-action-admin').addEventListener('click', () => {
    if (selectedTargetUser) {
      socket.emit('set_role', { channel: activeWindow, targetNick: selectedTargetUser.nick, role: 'admin', active: true });
    }
  });

  document.getElementById('ctx-action-op').addEventListener('click', () => {
    if (selectedTargetUser) {
      socket.emit('set_role', { channel: activeWindow, targetNick: selectedTargetUser.nick, role: 'op', active: true });
    }
  });

  document.getElementById('ctx-action-halfop').addEventListener('click', () => {
    if (selectedTargetUser) {
      socket.emit('set_role', { channel: activeWindow, targetNick: selectedTargetUser.nick, role: 'halfop', active: true });
    }
  });

  document.getElementById('ctx-action-voice').addEventListener('click', () => {
    if (selectedTargetUser) {
      socket.emit('set_role', { channel: activeWindow, targetNick: selectedTargetUser.nick, role: 'voice', active: true });
    }
  });

  document.getElementById('ctx-action-add-access').addEventListener('click', () => {
    if (selectedTargetUser) {
      const role = prompt(`Enter persistent role for ${selectedTargetUser.nick} (owner, admin, op, halfop, voice):`, 'op');
      if (role) {
        socket.emit('manage_access', { channel: activeWindow, action: 'add', nick: selectedTargetUser.nick, role: role });
      }
    }
  });

  document.getElementById('ctx-action-demote').addEventListener('click', () => {
    if (selectedTargetUser) {
      socket.emit('set_role', { channel: activeWindow, targetNick: selectedTargetUser.nick, role: 'owner', active: false });
      socket.emit('set_role', { channel: activeWindow, targetNick: selectedTargetUser.nick, role: 'admin', active: false });
      socket.emit('set_role', { channel: activeWindow, targetNick: selectedTargetUser.nick, role: 'op', active: false });
      socket.emit('set_role', { channel: activeWindow, targetNick: selectedTargetUser.nick, role: 'halfop', active: false });
      socket.emit('set_role', { channel: activeWindow, targetNick: selectedTargetUser.nick, role: 'voice', active: false });
    }
  });

  document.getElementById('ctx-action-kick').addEventListener('click', () => {
    if (selectedTargetUser) {
      const reason = prompt(`Reason for kicking ${selectedTargetUser.nick}:`, 'Kicked by operator');
      if (reason !== null) {
        socket.emit('kick_user', { channel: activeWindow, targetNick: selectedTargetUser.nick, reason });
      }
    }
  });

  document.getElementById('ctx-action-ban-ip').addEventListener('click', () => {
    if (selectedTargetUser) {
      const reason = prompt(`Reason for banning IP (${selectedTargetUser.ip}):`, 'Banned by operator');
      if (reason !== null) {
        socket.emit('ban_user', { targetNick: selectedTargetUser.ip, banType: 'ip', reason });
      }
    }
  });

  document.getElementById('ctx-action-ban-nick').addEventListener('click', () => {
    if (selectedTargetUser) {
      const reason = prompt(`Reason for banning nick '${selectedTargetUser.nick}':`, 'Banned by operator');
      if (reason !== null) {
        socket.emit('ban_user', { targetNick: selectedTargetUser.nick, banType: 'nick', reason });
      }
    }
  });

  // Formatting Toolbar & Emoji
  btnToggleEmoji.addEventListener('click', () => {
    emojiPicker.classList.toggle('hidden');
  });

  btnCloseEmoji.addEventListener('click', () => {
    emojiPicker.classList.add('hidden');
  });

  document.querySelectorAll('.emoji-grid span').forEach(el => {
    el.addEventListener('click', (e) => {
      chatInput.value += e.target.textContent;
      chatInput.focus();
      emojiPicker.classList.add('hidden');
    });
  });

  btnFmtBold.addEventListener('click', () => {
    isBold = !isBold;
    btnFmtBold.classList.toggle('active', isBold);
    chatInput.focus();
  });

  btnFmtItalic.addEventListener('click', () => {
    isItalic = !isItalic;
    btnFmtItalic.classList.toggle('active', isItalic);
    chatInput.focus();
  });

  btnFmtUnderline.addEventListener('click', () => {
    isUnderline = !isUnderline;
    btnFmtUnderline.classList.toggle('active', isUnderline);
    chatInput.focus();
  });

  // TAB Autocomplete
  // Tab Completion & Command History State
  let tabMatches = [];
  let tabMatchIndex = 0;
  let tabStartPos = 0;

  const inputHistory = [];
  let historyIndex = -1;
  let tempCurrentInput = '';

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();

      if (tabMatches.length > 0) {
        // Cycle to next match
        tabMatchIndex = (tabMatchIndex + 1) % tabMatches.length;
        const nextMatch = tabMatches[tabMatchIndex];
        const val = chatInput.value;
        const newVal = val.substring(0, tabStartPos) + nextMatch + (tabStartPos === 0 ? ': ' : ' ');
        chatInput.value = newVal;
        return;
      }

      // Initial Tab Press: Extract word before cursor
      const cursorPos = chatInput.selectionStart;
      const textBefore = chatInput.value.substring(0, cursorPos);
      const lastSpace = textBefore.lastIndexOf(' ');
      const currentWord = lastSpace === -1 ? textBefore : textBefore.substring(lastSpace + 1);

      if (!currentWord) return;

      const currentWordLower = currentWord.toLowerCase();
      tabStartPos = lastSpace === -1 ? 0 : lastSpace + 1;

      // Find matching users in current channel
      const activeUsers = currentChannelUsers.map(u => u.nick);
      tabMatches = activeUsers.filter(n => n.toLowerCase().startsWith(currentWordLower));

      if (tabMatches.length > 0) {
        tabMatchIndex = 0;
        const firstMatch = tabMatches[0];
        const val = chatInput.value;
        const newVal = val.substring(0, tabStartPos) + firstMatch + (tabStartPos === 0 ? ': ' : ' ');
        chatInput.value = newVal;
      }
    } else if (e.key === 'ArrowUp') {
      if (inputHistory.length === 0) return;
      e.preventDefault();
      if (historyIndex === -1 || historyIndex === inputHistory.length) {
        tempCurrentInput = chatInput.value;
        historyIndex = inputHistory.length - 1;
      } else if (historyIndex > 0) {
        historyIndex--;
      }
      chatInput.value = inputHistory[historyIndex] || '';
      setTimeout(() => chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length), 0);
    } else if (e.key === 'ArrowDown') {
      if (inputHistory.length === 0 || historyIndex === -1) return;
      e.preventDefault();
      if (historyIndex < inputHistory.length - 1) {
        historyIndex++;
        chatInput.value = inputHistory[historyIndex];
      } else {
        historyIndex = inputHistory.length;
        chatInput.value = tempCurrentInput;
      }
      setTimeout(() => chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length), 0);
    } else if (e.key === 'Enter') {
      handleInputSubmit();
    } else {
      tabMatches = [];
      tabMatchIndex = 0;
    }
  });

  // --- TEXT & BACKGROUND COLOR PICKER ENGINE ---
  let activeTextColor = null;
  let activeBgColor = null;

  let tempFgColor = '#000000';
  let tempBgColor = 'transparent';

  const btnToggleColor = document.getElementById('btn-toggle-color');
  const colorPickerModal = document.getElementById('color-picker-modal');
  const btnCloseColorPicker = document.getElementById('btn-close-color-picker');
  const colorPreviewBox = document.getElementById('color-preview-box');
  const btnApplyColor = document.getElementById('btn-apply-color');
  const btnClearColor = document.getElementById('btn-clear-color');

  if (btnToggleColor && colorPickerModal) {
    btnToggleColor.addEventListener('click', () => {
      colorPickerModal.classList.toggle('hidden');
      if (emojiPicker) emojiPicker.classList.add('hidden');
    });
  }

  if (btnCloseColorPicker && colorPickerModal) {
    btnCloseColorPicker.addEventListener('click', () => {
      colorPickerModal.classList.add('hidden');
    });
  }

  function updateColorPreview() {
    if (!colorPreviewBox) return true;

    const fg = tempFgColor.toLowerCase();
    const bg = tempBgColor.toLowerCase();

    if (bg !== 'transparent' && fg === bg) {
      colorPreviewBox.textContent = "❌ Invalid: Text & Background colors cannot be identical!";
      colorPreviewBox.style.color = '#ef4444';
      colorPreviewBox.style.backgroundColor = '#fee2e2';
      return false;
    }

    if (bg === '#ffffff' && fg === '#ffffff') {
      colorPreviewBox.textContent = "❌ Invalid: White text on White background!";
      colorPreviewBox.style.color = '#ef4444';
      colorPreviewBox.style.backgroundColor = '#fee2e2';
      return false;
    }

    if (bg === '#000000' && fg === '#000000') {
      colorPreviewBox.textContent = "❌ Invalid: Black text on Black background!";
      colorPreviewBox.style.color = '#ef4444';
      colorPreviewBox.style.backgroundColor = '#fee2e2';
      return false;
    }

    colorPreviewBox.textContent = "Sample Text #FunnyPaki 😊";
    colorPreviewBox.style.color = tempFgColor;
    colorPreviewBox.style.backgroundColor = tempBgColor === 'transparent' ? '#ffffff' : tempBgColor;
    return true;
  }

  // Foreground Swatches
  document.querySelectorAll('#fg-color-grid .color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('#fg-color-grid .color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      tempFgColor = swatch.getAttribute('data-color') || '#000000';
      updateColorPreview();
    });
  });

  // Background Swatches
  document.querySelectorAll('#bg-color-grid .color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('#bg-color-grid .color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      tempBgColor = swatch.getAttribute('data-color') || 'transparent';
      updateColorPreview();
    });
  });

  // Apply Button
  if (btnApplyColor) {
    btnApplyColor.addEventListener('click', () => {
      const isValid = updateColorPreview();
      if (!isValid) {
        alert("Please select a readable combination of Text and Background colors!");
        return;
      }
      activeTextColor = tempFgColor;
      activeBgColor = tempBgColor;
      if (btnToggleColor) btnToggleColor.classList.add('active');
      if (colorPickerModal) colorPickerModal.classList.add('hidden');
      chatInput.focus();
    });
  }

  // Clear Button
  if (btnClearColor) {
    btnClearColor.addEventListener('click', () => {
      activeTextColor = null;
      activeBgColor = null;
      tempFgColor = '#000000';
      tempBgColor = 'transparent';

      document.querySelectorAll('#fg-color-grid .color-swatch').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('#bg-color-grid .color-swatch').forEach(s => s.classList.remove('active'));
      const defaultFg = document.querySelector('#fg-color-grid .color-swatch[data-color="#000000"]');
      if (defaultFg) defaultFg.classList.add('active');
      const defaultBg = document.querySelector('#bg-color-grid .color-swatch[data-color="transparent"]');
      if (defaultBg) defaultBg.classList.add('active');

      updateColorPreview();
      if (btnToggleColor) btnToggleColor.classList.remove('active');
      if (colorPickerModal) colorPickerModal.classList.add('hidden');
      chatInput.focus();
    });
  }

  // --- Complete Command Parser ---

  function handleInputSubmit() {
    let text = chatInput.value.trim();
    if (!text) return;

    inputHistory.push(text);
    if (inputHistory.length > 100) inputHistory.shift();
    historyIndex = inputHistory.length;

    chatInput.value = '';

    if (text.startsWith('/')) {
      parseIRCCommand(text);
    } else {
      if (activeWindow === 'Status') {
        appendSystemMessage('Status', 'error', '*** Please join a #channel or PM a user to send messages.');
        return;
      }
      socket.emit('send_message', {
        target: activeWindow,
        message: text,
        textColor: activeTextColor,
        bgColor: activeBgColor
      });
    }
  }

  function parseIRCCommand(inputStr) {
    const parts = inputStr.substring(1).trim().split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    const unrealCmds = [
      'oper', 'wallops', 'globops', 'chatops', 'locops', 'adchat', 'nachat',
      'sajoin', 'sapart', 'samode', 'kill', 'shun', 'unshun', 'kline', 'zline', 'gline', 'gzline',
      'sethost', 'setident', 'chghost', 'chgident', 'chgname', 'rehash',
      'opermotd', 'addmotd', 'addomotd', 'mkpasswd', 'htm', 'close', 'dccdeny', 'undccdeny',
      'banlist', 'stats', 'seen', 'whowas', 'whois', 'devban', 'devunban'
    ];

    if (unrealCmds.includes(cmd)) {
      socket.emit('unreal_command', { command: cmd, args: args });
      return;
    }

    switch (cmd) {
      case 'cs':
      case 'chanserv':
        if (!args[0]) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /cs register | info | drop | sop | aop | hop | vop | access');
          return;
        }
        socket.emit('chanserv_command', { command: args[0], args: args.slice(1) });
        break;

      case 'chreg':
      case 'registerchan':
        if (!args[0] || !args[1]) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /chreg #channel <password> [description]');
          return;
        }
        socket.emit('chanserv_command', { command: 'register', args: [args[0], args[1], args.slice(2).join(' ')] });
        break;

      case 'join':
      case 'j':
        if (!args[0]) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /join #channel [key]');
          return;
        }
        socket.emit('join_channel', { channel: args[0], key: args[1] || '' });
        addChannelTab(args[0]);
        switchWindow(args[0]);
        break;

      case 'banlist':
        const targetBChan = args[0] || activeWindow;
        socket.emit('unreal_command', { command: 'banlist', args: [targetBChan] });
        break;

      case 'op':
        if (args[0] === 'kline' || args[0] === 'shun' || args[0] === 'gline' || args[0] === 'zline' || args[0] === 'gzline') {
          socket.emit('unreal_command', { command: 'op', args: args });
        } else if (args[0] === 'list') {
          socket.emit('chanserv_command', { command: 'aop', args: [activeWindow, 'list'] });
        } else if (args[0] === 'add') {
          if (!args[1]) {
            appendSystemMessage(activeWindow, 'error', 'Usage: /op add <registered_nick>');
            return;
          }
          socket.emit('chanserv_command', { command: 'aop', args: [activeWindow, 'add', args[1]] });
        } else if (args[0] === 'del') {
          if (!args[1]) {
            appendSystemMessage(activeWindow, 'error', 'Usage: /op del <nick>');
            return;
          }
          socket.emit('chanserv_command', { command: 'aop', args: [activeWindow, 'del', args[1]] });
        } else if (args[0]) {
          socket.emit('set_role', { channel: activeWindow, targetNick: args[0], role: 'op', active: true });
        } else {
          appendSystemMessage(activeWindow, 'error', 'Usage: /banlist #channel OR /op kline list OR /op shun list OR /op gline list');
        }
        break;

      case 'sop':
      case 'aop':
      case 'hop':
      case 'vop':
        if (args[0] && args[0].startsWith('#')) {
          socket.emit('chanserv_command', { command: cmd, args: args });
        } else {
          socket.emit('chanserv_command', { command: cmd, args: [activeWindow, ...args] });
        }
        break;

      case 'access':
        if (args[0] && args[0].startsWith('#')) {
          socket.emit('chanserv_command', { command: 'access', args: args });
        } else {
          socket.emit('chanserv_command', { command: 'access', args: [activeWindow, ...args] });
        }
        break;

      case 'mode':
        if (!args[0]) {
          socket.emit('set_channel_mode', { channel: activeWindow, modeString: '', keyArg: '' });
          return;
        }
        const targetChan = args[0].startsWith('#') ? args[0] : activeWindow;
        const modeFlags = args[0].startsWith('#') ? args[1] : args[0];
        const keyVal = args[0].startsWith('#') ? args[2] : args[1];
        socket.emit('set_channel_mode', { channel: targetChan, modeString: modeFlags || '', keyArg: keyVal || '' });
        break;

      case 'invite':
        if (!args[0]) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /invite <nick> [#channel]');
          return;
        }
        socket.emit('invite_user', { targetNick: args[0], channel: args[1] || activeWindow });
        break;

      case 'halfop':
        if (args[0]) socket.emit('set_role', { channel: activeWindow, targetNick: args[0], role: 'halfop', active: true });
        break;

      case 'dehalfop':
        if (args[0]) socket.emit('set_role', { channel: activeWindow, targetNick: args[0], role: 'halfop', active: false });
        break;

      case 'nick':
        if (!args[0]) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /nick <new_nickname>');
          return;
        }
        socket.emit('change_nick', { newNick: args[0] });
        break;

      case 'register':
        if (!args[0]) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /register <password>');
          return;
        }
        socket.emit('register', { nick: currentNick, password: args[0] });
        break;

      case 'identify':
      case 'login':
        if (!args[0]) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /identify [nick] <password>');
          return;
        }
        if (args.length === 1) {
          socket.emit('identify', { nick: currentNick, password: args[0] });
        } else {
          socket.emit('identify', { nick: args[0], password: args[1] });
        }
        break;

      case 'msg':
      case 'query':
        if (!args[0] || args.length < 2) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /msg <nick> <message>');
          return;
        }
        socket.emit('send_message', { target: args[0], message: args.slice(1).join(' ') });
        break;

      case 'me':
        if (!args[0]) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /me <action>');
          return;
        }
        socket.emit('send_action', { target: activeWindow, action: args.join(' ') });
        break;

      case 'owner':
        if (args[0]) socket.emit('set_role', { channel: activeWindow, targetNick: args[0], role: 'owner', active: true });
        break;

      case 'deowner':
        if (args[0]) socket.emit('set_role', { channel: activeWindow, targetNick: args[0], role: 'owner', active: false });
        break;

      case 'admin':
        if (args[0]) socket.emit('set_role', { channel: activeWindow, targetNick: args[0], role: 'admin', active: true });
        break;

      case 'deadmin':
        if (args[0]) socket.emit('set_role', { channel: activeWindow, targetNick: args[0], role: 'admin', active: false });
        break;

      case 'deop':
        if (args[0]) socket.emit('set_role', { channel: activeWindow, targetNick: args[0], role: 'op', active: false });
        break;

      case 'voice':
        if (args[0]) socket.emit('set_role', { channel: activeWindow, targetNick: args[0], role: 'voice', active: true });
        break;

      case 'devoice':
        if (args[0]) socket.emit('set_role', { channel: activeWindow, targetNick: args[0], role: 'voice', active: false });
        break;

      case 'kick':
        if (!args[0]) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /kick <nick> [reason]');
          return;
        }
        socket.emit('kick_user', { channel: activeWindow, targetNick: args[0], reason: args.slice(1).join(' ') || 'Kicked' });
        break;

      case 'ban':
        if (!args[0]) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /ban <nick|ip> [reason]');
          return;
        }
        socket.emit('ban_user', { targetNick: args[0], banType: args[0].includes('.') ? 'ip' : 'nick', reason: args.slice(1).join(' ') || 'Banned' });
        break;

      case 'unban':
        if (!args[0]) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /unban <ip|nick>');
          return;
        }
        socket.emit('unban_user', { target: args[0], banType: args[0].includes('.') ? 'ip' : 'nick' });
        break;

      case 'topic':
        if (!args[0]) {
          appendSystemMessage(activeWindow, 'error', 'Usage: /topic <new topic>');
          return;
        }
        socket.emit('set_topic', { channel: activeWindow, topic: args.join(' ') });
        break;

      case 'clear':
        const winEl = getOrCreateWindowElement(activeWindow);
        winEl.innerHTML = '';
        break;

      case 'help':
        openModal('modal-help');
        break;

      default:
        appendSystemMessage(activeWindow, 'error', `*** Unknown command /${cmd}. Type /help for list.`);
    }
  }

  btnSend.addEventListener('click', handleInputSubmit);

  document.getElementById('btn-add-channel').addEventListener('click', () => {
    const ch = prompt('Enter channel name to join:', '#Lounge');
    if (ch) {
      addChannelTab(ch);
      switchWindow(ch);
    }
  });

  document.getElementById('btn-change-topic').addEventListener('click', () => {
    if (!activeWindow.startsWith('#')) return;
    const newTopic = prompt(`Set new topic for ${activeWindow}:`);
    if (newTopic !== null) {
      socket.emit('set_topic', { channel: activeWindow, topic: newTopic });
    }
  });

  document.getElementById('btn-clear-chat').addEventListener('click', () => {
    const winEl = getOrCreateWindowElement(activeWindow);
    winEl.innerHTML = '';
  });

  // Modals
  function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    if (id === 'modal-admin') {
      socket.emit('get_admin_data');
    }
  }

  function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      closeModal(e.target.getAttribute('data-close'));
    });
  });

  document.getElementById('btn-register-modal').addEventListener('click', () => openModal('modal-account'));
  document.getElementById('btn-admin-modal').addEventListener('click', () => openModal('modal-admin'));
  document.getElementById('btn-help-modal').addEventListener('click', () => openModal('modal-help'));

  const tabBtnIdentify = document.getElementById('tab-btn-identify');
  const tabBtnRegister = document.getElementById('tab-btn-register');
  const formIdentify = document.getElementById('form-identify');
  const formRegister = document.getElementById('form-register');

  tabBtnIdentify.addEventListener('click', () => {
    tabBtnIdentify.classList.add('active');
    tabBtnRegister.classList.remove('active');
    formIdentify.classList.remove('hidden');
    formRegister.classList.add('hidden');
  });

  tabBtnRegister.addEventListener('click', () => {
    tabBtnRegister.classList.add('active');
    tabBtnIdentify.classList.remove('active');
    formRegister.classList.remove('hidden');
    formIdentify.classList.add('hidden');
  });

  formIdentify.addEventListener('submit', (e) => {
    e.preventDefault();
    const nick = document.getElementById('identify-nick').value.trim();
    const pass = document.getElementById('identify-pass').value.trim();
    socket.emit('identify', { nick: nick, password: pass });
    closeModal('modal-account');
  });

  formRegister.addEventListener('submit', (e) => {
    e.preventDefault();
    const nick = document.getElementById('register-nick').value.trim();
    const pass = document.getElementById('register-pass').value.trim();
    socket.emit('register', { nick: nick, password: pass });
    closeModal('modal-account');
  });

  document.querySelectorAll('.adm-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel-sec').forEach(s => s.classList.remove('active'));
      e.target.classList.add('active');
      const targetSec = e.target.getAttribute('data-target');
      document.getElementById(targetSec).classList.add('active');
    });
  });

  document.getElementById('btn-manual-ban-ip').addEventListener('click', () => {
    const target = document.getElementById('manual-ban-target').value.trim();
    if (target) {
      socket.emit('ban_user', { targetNick: target, banType: 'ip', reason: 'Admin panel manual ban' });
      socket.emit('get_admin_data');
    }
  });

  document.getElementById('btn-manual-ban-nick').addEventListener('click', () => {
    const target = document.getElementById('manual-ban-target').value.trim();
    if (target) {
      socket.emit('ban_user', { targetNick: target, banType: 'nick', reason: 'Admin panel manual ban' });
      socket.emit('get_admin_data');
    }
  });

  function renderAdminTables(data) {
    const tbodyOnline = document.getElementById('table-online-users');
    tbodyOnline.innerHTML = '';
    data.online_users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${u.nick}</strong></td>
        <td><code>${u.ip}</code></td>
        <td><span class="badge badge-${u.global_role === 'owner' ? 'owner' : (u.global_role === 'admin' ? 'admin' : 'guest')}">${(u.global_role || 'user').toUpperCase()}</span></td>
        <td>${u.channels.join(', ')}</td>
        <td>
          <button class="btn btn-xs btn-danger adm-kick-btn" data-nick="${u.nick}">Kick</button>
          <button class="btn btn-xs btn-danger adm-banip-btn" data-ip="${u.ip}">Ban IP</button>
        </td>
      `;
      tbodyOnline.appendChild(tr);
    });

    const tbodyHistory = document.getElementById('table-ip-history');
    tbodyHistory.innerHTML = '';
    data.ip_history.forEach(h => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${h.nick}</td>
        <td><code>${h.ip}</code></td>
        <td>${new Date(h.last_seen).toLocaleString()}</td>
        <td><small>${escapeHTML(h.user_agent).substring(0, 40)}...</small></td>
        <td><button class="btn btn-xs btn-danger adm-banip-btn" data-ip="${h.ip}">Ban IP</button></td>
      `;
      tbodyHistory.appendChild(tr);
    });

    const tbodyIpBans = document.getElementById('table-ip-bans');
    tbodyIpBans.innerHTML = '';
    data.ip_bans.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${b.ip}</code></td>
        <td>${b.reason}</td>
        <td>${b.banned_by}</td>
        <td>${new Date(b.created_at).toLocaleDateString()}</td>
        <td><button class="btn btn-xs btn-outline adm-unbanip-btn" data-ip="${b.ip}">Unban</button></td>
      `;
      tbodyIpBans.appendChild(tr);
    });

    const tbodyNickBans = document.getElementById('table-nick-bans');
    tbodyNickBans.innerHTML = '';
    data.nick_bans.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${b.original_nick}</strong></td>
        <td>${b.reason}</td>
        <td>${b.banned_by}</td>
        <td>${new Date(b.created_at).toLocaleDateString()}</td>
        <td><button class="btn btn-xs btn-outline adm-unbannick-btn" data-nick="${b.original_nick}">Unban</button></td>
      `;
      tbodyNickBans.appendChild(tr);
    });

    const tbodyReg = document.getElementById('table-registered-nicks');
    tbodyReg.innerHTML = '';
    data.registered_nicks.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${r.nick}</strong></td>
        <td>${(r.global_role || 'user').toUpperCase()}</td>
        <td>${new Date(r.created_at).toLocaleDateString()}</td>
      `;
      tbodyReg.appendChild(tr);
    });

    document.querySelectorAll('.adm-kick-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const nick = e.target.getAttribute('data-nick');
        socket.emit('kick_user', { channel: activeWindow, targetNick: nick, reason: 'Admin panel kick' });
        setTimeout(() => socket.emit('get_admin_data'), 300);
      });
    });

    document.querySelectorAll('.adm-banip-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const ip = e.target.getAttribute('data-ip');
        socket.emit('ban_user', { targetNick: ip, banType: 'ip', reason: 'Admin panel IP ban' });
        setTimeout(() => socket.emit('get_admin_data'), 300);
      });
    });

    document.querySelectorAll('.adm-unbanip-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const ip = e.target.getAttribute('data-ip');
        socket.emit('unban_user', { target: ip, banType: 'ip' });
        setTimeout(() => socket.emit('get_admin_data'), 300);
      });
    });

    document.querySelectorAll('.adm-unbannick-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const nick = e.target.getAttribute('data-nick');
        socket.emit('unban_user', { target: nick, banType: 'nick' });
        setTimeout(() => socket.emit('get_admin_data'), 300);
      });
    });
  }

  // --- MOBILE USER LIST SLIDE-OVER DRAWER ENGINE ---
  const btnMobileUsersToggle = document.getElementById('btn-mobile-users-toggle');
  const btnCloseMobileUserlist = document.getElementById('btn-close-mobile-userlist');
  const pakichatUserlistPanel = document.getElementById('pakichat-userlist-panel');
  const userListBackdrop = document.getElementById('user-list-backdrop');

  function openMobileUserList() {
    if (pakichatUserlistPanel) pakichatUserlistPanel.classList.add('mobile-drawer-open');
    if (userListBackdrop) userListBackdrop.classList.remove('hidden');
  }

  function closeMobileUserList() {
    if (pakichatUserlistPanel) pakichatUserlistPanel.classList.remove('mobile-drawer-open');
    if (userListBackdrop) userListBackdrop.classList.add('hidden');
  }

  if (btnMobileUsersToggle) {
    btnMobileUsersToggle.addEventListener('click', openMobileUserList);
  }

  if (btnCloseMobileUserlist) {
    btnCloseMobileUserlist.addEventListener('click', closeMobileUserList);
  }

  if (userListBackdrop) {
    userListBackdrop.addEventListener('click', closeMobileUserList);
  }

  // --- MULTI-THEME SELECTOR DROPDOWN ENGINE ---
  const themeSelectorDropdown = document.getElementById('theme-selector-dropdown');
  const savedTheme = localStorage.getItem('pakichat_active_theme') || 'classic';

  function applyActiveTheme(themeName) {
    document.body.classList.remove('theme-vintage', 'theme-classic', 'theme-dark');
    document.body.classList.add(`theme-${themeName}`);
    if (themeSelectorDropdown) themeSelectorDropdown.value = themeName;
    localStorage.setItem('pakichat_active_theme', themeName);
  }

  if (themeSelectorDropdown) {
    themeSelectorDropdown.addEventListener('change', (e) => {
      applyActiveTheme(e.target.value);
    });
  }

  applyActiveTheme(savedTheme);

});
