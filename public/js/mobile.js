document.addEventListener('DOMContentLoaded', () => {
  const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
  });

  // 24/7 Keep-Alive Heartbeat Timer
  setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('keep_alive');
    }
  }, 15000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && socket && socket.connected) {
      socket.emit('keep_alive');
    }
  });

  const loginOverlay = document.getElementById('mobile-login-overlay');
  const loginForm = document.getElementById('mobile-login-form');
  const nickInput = document.getElementById('mobile-nick-input');
  const passInput = document.getElementById('mobile-pass-input');

  const chatLogsViewport = document.getElementById('mobile-chat-logs');
  const chatForm = document.getElementById('mobile-chat-form');
  const msgInput = document.getElementById('mobile-msg-input');
  const tabList = document.getElementById('mobile-tab-list');

  const topicDisplay = document.getElementById('mobile-topic');
  const btnNick = document.getElementById('btn-mobile-nick');

  // Category banners & lists
  const bannerOwner = document.getElementById('banner-owner');
  const bannerAdmin = document.getElementById('banner-admin');
  const bannerOp = document.getElementById('banner-op');
  const bannerHalfOp = document.getElementById('banner-halfop');
  const bannerVip = document.getElementById('banner-vip');
  const bannerOnline = document.getElementById('banner-online');

  const listOwner = document.getElementById('list-owner');
  const listAdmin = document.getElementById('list-admin');
  const listOp = document.getElementById('list-op');
  const listHalfOp = document.getElementById('list-halfop');
  const listVip = document.getElementById('list-vip');
  const listOnline = document.getElementById('list-online');

  // Toolbar buttons
  const btnEmoji = document.getElementById('btn-mobile-emoji');
  const btnColor = document.getElementById('btn-mobile-color');
  const btnBold = document.getElementById('btn-mobile-bold');
  const btnItalic = document.getElementById('btn-mobile-italic');
  const btnUnderline = document.getElementById('btn-mobile-underline');

  const emojiPopover = document.getElementById('mobile-emoji-popover');
  const colorPopover = document.getElementById('mobile-color-popover');

  let currentNick = '';
  let activeMobileWindow = '#FunnyPaki';
  let unreadCounts = {};

  // Formatting state
  let isBold = false;
  let isItalic = false;
  let isUnderline = false;
  let selectedColor = null;

  // Helper: Color hash for nicks (nick-c1 to nick-c8)
  function getNickColorClass(nick) {
    if (!nick) return 'nick-c1';
    let hash = 0;
    for (let i = 0; i < nick.length; i++) {
      hash = nick.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIdx = (Math.abs(hash) % 8) + 1;
    return `nick-c${colorIdx}`;
  }

  // Audio Sound Notifications System (HTML5 Audio + Web Audio Synthesizer Fallback)
  let soundMuted = localStorage.getItem('chat_sound_muted') === '1';
  let audioCtxMobile = null;

  function initMobileAudioContext() {
    if (!audioCtxMobile) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtxMobile = new AudioContext();
    }
    if (audioCtxMobile && audioCtxMobile.state === 'suspended') {
      audioCtxMobile.resume().catch(() => {});
    }
  }

  document.addEventListener('click', initMobileAudioContext, { once: false });

  const btnSoundMobile = document.getElementById('btn-sound-toggle-mobile');
  function updateMobileSoundButton() {
    if (btnSoundMobile) {
      btnSoundMobile.textContent = soundMuted ? '🔇 OFF' : '🔊 ON';
      btnSoundMobile.style.background = soundMuted ? '#64748b' : '#16a34a';
    }
  }

  if (btnSoundMobile) {
    updateMobileSoundButton();
    btnSoundMobile.addEventListener('click', () => {
      soundMuted = !soundMuted;
      localStorage.setItem('chat_sound_muted', soundMuted ? '1' : '0');
      updateMobileSoundButton();
    });
  }

  function playSynthBeepMobile(freqs, durations) {
    try {
      initMobileAudioContext();
      if (!audioCtxMobile) return;
      let now = audioCtxMobile.currentTime;
      freqs.forEach((freq, idx) => {
        const dur = durations[idx];
        const osc = audioCtxMobile.createOscillator();
        const gain = audioCtxMobile.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(gain);
        gain.connect(audioCtxMobile.destination);
        osc.start(now);
        osc.stop(now + dur);
        now += dur + 0.05;
      });
    } catch (e) {}
  }

  function playNotificationSound(type) {
    if (soundMuted) return;
    initMobileAudioContext();

    const audioFile = `/sounds/${type}.wav`;
    const audio = new Audio(audioFile);
    audio.currentTime = 0;
    audio.play().catch(() => {
      if (type === 'newjoining') playSynthBeepMobile([523.25, 783.99], [0.15, 0.25]);
      else if (type === 'tagnick') playSynthBeepMobile([880, 1046.5], [0.1, 0.15]);
      else if (type === 'private') playSynthBeepMobile([659.25, 880], [0.12, 0.2]);
    });
  }

  function getOrCreateMobileWindowElement(winName) {
    const cleanId = 'm-window-' + winName.replace(/^#/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    let winEl = document.getElementById(cleanId);
    if (!winEl) {
      winEl = document.createElement('div');
      winEl.id = cleanId;
      winEl.className = 'm-chat-window';
      winEl.setAttribute('data-name', winName);

      if (!winName.startsWith('#')) {
        const pmNotice = document.createElement('div');
        pmNotice.className = 'sys-line info';
        pmNotice.textContent = `*** Private Message session with ${winName} initialized.`;
        winEl.appendChild(pmNotice);
      }

      chatLogsViewport.appendChild(winEl);
    }
    return winEl;
  }

  function switchMobileWindow(winName) {
    activeMobileWindow = winName;

    // Update tab styles
    document.querySelectorAll('.mobile-tab').forEach(el => {
      if (el.getAttribute('data-target') === winName) {
        el.classList.add('active');
        const badge = el.querySelector('.unread-badge');
        if (badge) badge.remove();
        unreadCounts[winName] = 0;
      } else {
        el.classList.remove('active');
      }
    });

    // Update window views
    document.querySelectorAll('.m-chat-window').forEach(el => el.classList.remove('active'));
    const targetWin = getOrCreateMobileWindowElement(winName);
    targetWin.classList.add('active');

    chatLogsViewport.scrollTop = chatLogsViewport.scrollHeight;
  }

  function ensureMobilePMTabExists(targetNick) {
    if (!tabList) return;
    let existingTab = document.querySelector(`.mobile-tab[data-target="${targetNick}"]`);
    if (!existingTab) {
      const tab = document.createElement('div');
      tab.className = 'mobile-tab';
      tab.setAttribute('data-target', targetNick);

      const labelSpan = document.createElement('span');
      labelSpan.textContent = targetNick;

      const closeSpan = document.createElement('span');
      closeSpan.className = 'tab-close';
      closeSpan.innerHTML = '&times;';

      closeSpan.onclick = (e) => {
        e.stopPropagation();
        tab.remove();
        const cleanId = 'm-window-' + targetNick.replace(/^#/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const winEl = document.getElementById(cleanId);
        if (winEl) winEl.remove();
        delete unreadCounts[targetNick];

        if (activeMobileWindow === targetNick) {
          switchMobileWindow('#FunnyPaki');
        }
      };

      tab.appendChild(labelSpan);
      tab.appendChild(closeSpan);

      tab.onclick = () => {
        switchMobileWindow(targetNick);
      };

      tabList.appendChild(tab);
    }

    getOrCreateMobileWindowElement(targetNick);
  }

  function formatMessageText(text) {
    if (!text) return '';
    let safe = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    safe = safe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    safe = safe.replace(/&lt;(\/)?(b|i|u|em|strong|ins|sub|sup)&gt;/gi, '<$1$2>');
    safe = safe.replace(/&lt;span style=["']color:\s*(.*?)["']&gt;/gi, '<span style="color:$1">');
    safe = safe.replace(/&lt;span class=["']msg-text-colored["'] style=["'](.*?)["']&gt;/gi, '<span class="msg-text-colored" style="$1">');
    safe = safe.replace(/&lt;\/span&gt;/gi, '</span>');
    return safe;
  }

  function appendSysLine(msg, type = 'info', targetWin = null) {
    const winName = targetWin || activeMobileWindow || '#FunnyPaki';
    const winEl = getOrCreateMobileWindowElement(winName);

    const div = document.createElement('div');
    div.className = `sys-line ${type}`;
    div.textContent = msg;
    winEl.appendChild(div);

    if (activeMobileWindow === winName) {
      chatLogsViewport.scrollTop = chatLogsViewport.scrollHeight;
    }
  }

  function tagNickInMobileInput(nick) {
    if (!msgInput) return;
    const currentVal = msgInput.value;
    if (!currentVal) {
      msgInput.value = `${nick}: `;
    } else if (currentVal.endsWith(' ')) {
      msgInput.value = `${currentVal}${nick} `;
    } else {
      msgInput.value = `${currentVal} ${nick} `;
    }
    msgInput.focus();
  }

  function appendChatLine(winName, nick, text, isPM = false) {
    const winEl = getOrCreateMobileWindowElement(winName);

    const div = document.createElement('div');
    div.className = `msg-line ${isPM ? 'pm' : ''}`;

    const nickSpan = document.createElement('span');
    nickSpan.className = `msg-nick ${getNickColorClass(nick)}`;
    nickSpan.textContent = nick;
    nickSpan.style.cursor = 'pointer';
    nickSpan.title = 'Tap to tag nick';

    nickSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      tagNickInMobileInput(nick);
    });

    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'msg-arrow';
    arrowSpan.textContent = ' ➔ ';

    const msgSpan = document.createElement('span');
    msgSpan.className = 'msg-text';
    msgSpan.innerHTML = formatMessageText(text);

    div.appendChild(nickSpan);
    div.appendChild(arrowSpan);
    div.appendChild(msgSpan);

    winEl.appendChild(div);

    if (activeMobileWindow === winName) {
      chatLogsViewport.scrollTop = chatLogsViewport.scrollHeight;
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  function appendActionLine(winName, nick, action) {
    const winEl = getOrCreateMobileWindowElement(winName);
    const div = document.createElement('div');
    div.className = 'msg-line action-line';
    div.style.color = '#7e22ce';
    div.style.fontStyle = 'italic';
    div.style.fontWeight = '600';
    div.style.margin = '3px 0';

    div.innerHTML = `<span style="font-weight:700;">* ${escapeHTML(nick)}</span> ${formatMessageText(action)}`;
    winEl.appendChild(div);

    if (activeMobileWindow === winName) {
      chatLogsViewport.scrollTop = chatLogsViewport.scrollHeight;
    }
  }

  // Socket Initial Handshake
  socket.on('connect', () => {
    console.log('Mobile Socket Connected');
  });

  socket.on('user_init', (data) => {
    if (data && data.nick) {
      currentNick = data.nick;
      if (nickInput) nickInput.value = currentNick;
    }
  });

  socket.on('nick_updated', (data) => {
    if (data && data.nick) {
      currentNick = data.nick;
      if (nickInput) nickInput.value = currentNick;
    }
  });

  socket.on('chat_action', (data) => {
    const targetChan = data.channel || '#FunnyPaki';
    appendActionLine(targetChan, data.nick, data.action);
  });

  socket.on('chat_message', (data) => {
    const targetChan = data.channel || '#FunnyPaki';
    appendChatLine(targetChan, data.nick, data.message);

    if (data.nick && data.nick.toLowerCase() !== currentNick.toLowerCase() && currentNick) {
      const nickRegex = new RegExp(`\\b@?${currentNick}\\b`, 'i');
      if (nickRegex.test(data.message)) {
        playNotificationSound('tagnick');
      }
    }
  });

  socket.on('private_message', (data) => {
    const fromNick = data.from;
    const toNick = data.to;
    const isSelf = fromNick.toLowerCase() === currentNick.toLowerCase();
    const otherParty = isSelf ? toNick : fromNick;

    ensureMobilePMTabExists(otherParty);
    appendChatLine(otherParty, fromNick, data.message, true);

    if (!isSelf) {
      playNotificationSound('private');
      if (activeMobileWindow !== otherParty) {
        unreadCounts[otherParty] = (unreadCounts[otherParty] || 0) + 1;
        const pmTab = document.querySelector(`.mobile-tab[data-target="${otherParty}"]`);
        if (pmTab) {
          let badge = pmTab.querySelector('.unread-badge');
          if (!badge) {
            badge = document.createElement('span');
            badge.className = 'unread-badge';
            pmTab.appendChild(badge);
          }
          badge.textContent = unreadCounts[otherParty];
        }
      }
    }
  });

  socket.on('user_joined', (data) => {
    appendSysLine(`*** ${data.nick} [${data.ip}] has joined ${data.channel || '#FunnyPaki'}`, 'join', data.channel || '#FunnyPaki');
    playNotificationSound('newjoining');
  });

  socket.on('user_part', (data) => {
    appendSysLine(`*** ${data.nick} left ${data.channel || '#FunnyPaki'} (${data.reason || 'Left channel'})`, 'part', data.channel || '#FunnyPaki');
  });

  socket.on('user_quit', (data) => {
    appendSysLine(`*** ${data.nick} quit (${data.reason || 'Quit'})`, 'part', '#FunnyPaki');
  });

  socket.on('system_notice', (data) => {
    appendSysLine(data.message, data.type || 'info', activeMobileWindow);
    if (data.type === 'join' || (data.message && data.message.toLowerCase().includes('joined'))) {
      playNotificationSound('newjoining');
    }
  });

  socket.on('nick_changed', (data) => {
    if (data.oldNick === currentNick) {
      currentNick = data.newNick;
      appendSysLine(`*** You are now known as ${currentNick}`, 'success', '#FunnyPaki');
    } else {
      appendSysLine(`*** ${data.oldNick} is now known as ${data.newNick}`, 'info', '#FunnyPaki');
    }
  });

  socket.on('channel_user_list', (data) => {
    if (data.topic) {
      topicDisplay.textContent = `Topic : ${data.topic}`;
    }

    // Clear user lists
    if (listOwner) listOwner.innerHTML = '';
    if (listAdmin) listAdmin.innerHTML = '';
    if (listOp) listOp.innerHTML = '';
    if (listHalfOp) listHalfOp.innerHTML = '';
    if (listVip) listVip.innerHTML = '';
    if (listOnline) listOnline.innerHTML = '';

    let countOwner = 0;
    let countAdmin = 0;
    let countOp = 0;
    let countHalfOp = 0;
    let countVip = 0;
    let countOnline = 0;

    if (data.users && Array.isArray(data.users)) {
      data.users.forEach(u => {
        const li = document.createElement('li');
        li.className = 'user-group-item';
        li.textContent = (u.prefix || '') + u.nick;
        li.title = `${u.nick} (${u.roleName || 'User'})`;

        // 1-CLICK PM WINDOW SWITCHING
        li.onclick = () => {
          if (u.nick.toLowerCase() !== currentNick.toLowerCase()) {
            ensureMobilePMTabExists(u.nick);
            switchMobileWindow(u.nick);
          }
        };

        const role = (u.roleName || '').toLowerCase();
        const prefix = u.prefix || '';
        const rank = u.rank || 0;

        if (rank >= 5 || prefix === '~' || role.includes('owner') || role.includes('founder')) {
          if (listOwner) listOwner.appendChild(li);
          countOwner++;
        } else if (rank === 4 || prefix === '&') {
          if (listAdmin) listAdmin.appendChild(li);
          countAdmin++;
        } else if (rank === 3 || prefix === '@') {
          if (listOp) listOp.appendChild(li);
          countOp++;
        } else if (rank === 2 || prefix === '%') {
          if (listHalfOp) listHalfOp.appendChild(li);
          countHalfOp++;
        } else if (rank === 1 || prefix === '+') {
          if (listVip) listVip.appendChild(li);
          countVip++;
        } else {
          if (listOnline) listOnline.appendChild(li);
          countOnline++;
        }
      });
    }

    // Show banners ONLY if at least 1 user is present
    if (bannerOwner) bannerOwner.style.display = countOwner > 0 ? 'block' : 'none';
    if (bannerAdmin) bannerAdmin.style.display = countAdmin > 0 ? 'block' : 'none';
    if (bannerOp) bannerOp.style.display = countOp > 0 ? 'block' : 'none';
    if (bannerHalfOp) bannerHalfOp.style.display = countHalfOp > 0 ? 'block' : 'none';
    if (bannerVip) bannerVip.style.display = countVip > 0 ? 'block' : 'none';
    if (bannerOnline) bannerOnline.style.display = countOnline > 0 ? 'block' : 'none';
  });

  // Tab 1 default setup
  const mainTab = document.querySelector('.mobile-tab[data-target="#FunnyPaki"]');
  if (mainTab) {
    mainTab.onclick = () => switchMobileWindow('#FunnyPaki');
  }

  // Toolbar Functionality
  btnBold.addEventListener('click', () => {
    isBold = !isBold;
    btnBold.classList.toggle('active', isBold);
    msgInput.focus();
  });

  btnItalic.addEventListener('click', () => {
    isItalic = !isItalic;
    btnItalic.classList.toggle('active', isItalic);
    msgInput.focus();
  });

  btnUnderline.addEventListener('click', () => {
    isUnderline = !isUnderline;
    btnUnderline.classList.toggle('active', isUnderline);
    msgInput.focus();
  });

  btnEmoji.addEventListener('click', () => {
    emojiPopover.classList.toggle('hidden');
    colorPopover.classList.add('hidden');
  });

  btnColor.addEventListener('click', () => {
    colorPopover.classList.toggle('hidden');
    emojiPopover.classList.add('hidden');
  });

  document.querySelectorAll('.emoji-opt').forEach(el => {
    el.addEventListener('click', () => {
      msgInput.value += el.textContent;
      emojiPopover.classList.add('hidden');
      msgInput.focus();
    });
  });

  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const col = sw.getAttribute('data-color');
      if (selectedColor === col) {
        selectedColor = null;
        btnColor.classList.remove('active');
        btnColor.style.borderColor = '#cbd5e1';
      } else {
        selectedColor = col;
        btnColor.classList.add('active');
        btnColor.style.borderColor = col;
      }
      colorPopover.classList.add('hidden');
      msgInput.focus();
    });
  });

  // Handle Mobile Login Submit
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const chosenNick = nickInput.value.trim();
    const chosenPass = passInput.value.trim();

    socket.emit('user_enter_lobby', {
      nick: chosenNick,
      password: chosenPass
    });

    if (chosenNick) currentNick = chosenNick;

    loginOverlay.style.display = 'none';
    msgInput.focus();
  });

  // Handle Chat Form Submit
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    let text = msgInput.value.trim();
    if (!text) return;

    if (text.startsWith('/me ') || text.startsWith('.me ') || text.startsWith('!me ') || text === '/me' || text === '.me' || text === '!me') {
      const parts = text.split(' ');
      const actionText = parts.slice(1).join(' ');
      if (actionText) {
        socket.emit('send_action', { target: activeMobileWindow, action: actionText });
      } else {
        appendSysLine('*** Usage: /me <action>', 'error', activeMobileWindow);
      }
      msgInput.value = '';
      msgInput.focus();
      return;
    }

    if (text.startsWith('/') || text.startsWith('.') || text.startsWith('!')) {
      const targetChan = activeMobileWindow.startsWith('#') ? activeMobileWindow : '#FunnyPaki';
      socket.emit('send_message', { channel: targetChan, message: text });
    } else {
      if (isBold) text = `<b>${text}</b>`;
      if (isItalic) text = `<i>${text}</i>`;
      if (isUnderline) text = `<u>${text}</u>`;
      if (selectedColor) text = `<span style="color:${selectedColor}">${text}</span>`;

      if (activeMobileWindow.startsWith('#')) {
        socket.emit('send_message', { channel: activeMobileWindow, message: text });
      } else {
        // Send PM to target nick!
        socket.emit('send_message', { target: activeMobileWindow, message: text });
      }
    }

    msgInput.value = '';
    msgInput.focus();
  });

  btnNick.addEventListener('click', () => {
    loginOverlay.style.display = 'flex';
    nickInput.focus();
  });
});
