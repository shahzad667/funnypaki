document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  const loginOverlay = document.getElementById('mobile-login-overlay');
  const loginForm = document.getElementById('mobile-login-form');
  const nickInput = document.getElementById('mobile-nick-input');
  const passInput = document.getElementById('mobile-pass-input');

  const chatLogs = document.getElementById('mobile-chat-logs');
  const chatForm = document.getElementById('mobile-chat-form');
  const msgInput = document.getElementById('mobile-msg-input');

  const topicDisplay = document.getElementById('mobile-topic');
  const btnNick = document.getElementById('btn-mobile-nick');

  // Category banners & lists
  const bannerOwner = document.getElementById('banner-owner');
  const bannerAdmin = document.getElementById('banner-admin');
  const bannerOp = document.getElementById('banner-op');
  const bannerHalfOp = document.getElementById('banner-halfop');
  const bannerOnline = document.getElementById('banner-online');

  const listOwner = document.getElementById('list-owner');
  const listAdmin = document.getElementById('list-admin');
  const listOp = document.getElementById('list-op');
  const listHalfOp = document.getElementById('list-halfop');
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
  let currentChannel = '#FunnyPaki';

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

  function appendSysLine(msg, type = 'info') {
    const div = document.createElement('div');
    div.className = `sys-line ${type}`;
    div.textContent = msg;
    chatLogs.appendChild(div);
    chatLogs.scrollTop = chatLogs.scrollHeight;
  }

  function formatMessageText(text) {
    let safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    safe = safe.replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
    safe = safe.replace(/&lt;i&gt;/g, '<i>').replace(/&lt;\/i&gt;/g, '</i>');
    safe = safe.replace(/&lt;u&gt;/g, '<u>').replace(/&lt;\/u&gt;/g, '</u>');
    safe = safe.replace(/&lt;span style="color:(.*?)"&gt;/g, '<span style="color:$1">').replace(/&lt;\/span&gt;/g, '</span>');
    return safe;
  }

  function appendChatLine(nick, text) {
    const div = document.createElement('div');
    div.className = 'msg-line';

    const nickSpan = document.createElement('span');
    nickSpan.className = `msg-nick ${getNickColorClass(nick)}`;
    nickSpan.textContent = nick;

    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'msg-arrow';
    arrowSpan.textContent = ' ➔ ';

    const msgSpan = document.createElement('span');
    msgSpan.className = 'msg-text';
    msgSpan.innerHTML = formatMessageText(text);

    div.appendChild(nickSpan);
    div.appendChild(arrowSpan);
    div.appendChild(msgSpan);

    chatLogs.appendChild(div);
    chatLogs.scrollTop = chatLogs.scrollHeight;
  }

  // Audio Sound Notifications System
  const SOUNDS = {
    newjoining: new Audio('/sounds/newjoining.wav'),
    tagnick: new Audio('/sounds/tagnick.wav'),
    private: new Audio('/sounds/private.wav')
  };
  let soundMuted = false;

  function playNotificationSound(type) {
    if (soundMuted) return;
    try {
      const snd = SOUNDS[type] || new Audio(`/sounds/${type}.mp3`);
      snd.currentTime = 0;
      snd.play().catch(() => {});
    } catch (e) {}
  }

  const btnSoundMobile = document.getElementById('btn-sound-toggle-mobile');
  if (btnSoundMobile) {
    btnSoundMobile.addEventListener('click', () => {
      soundMuted = !soundMuted;
      btnSoundMobile.textContent = soundMuted ? '🔇 OFF' : '🔊 ON';
    });
  }

  // Socket Initial Handshake
  socket.on('connect', () => {
    console.log('Mobile Socket Connected');
  });

  socket.on('user_init', (data) => {
    currentNick = data.nick;
    if (nickInput && !nickInput.value) {
      nickInput.value = currentNick;
    }
    appendSysLine(`*** Connected as ${currentNick}`, 'success');
  });

  socket.on('chat_message', (data) => {
    if (data.channel === currentChannel || !data.channel) {
      appendChatLine(data.nick, data.message);
    }
    if (data.nick && data.nick.toLowerCase() !== currentNick.toLowerCase() && currentNick) {
      const nickRegex = new RegExp(`\\b@?${currentNick}\\b`, 'i');
      if (nickRegex.test(data.message)) {
        playNotificationSound('tagnick');
      }
    }
  });

  socket.on('system_notice', (data) => {
    appendSysLine(data.message, data.type || 'info');
    if (data.type === 'join' || (data.message && data.message.toLowerCase().includes('joined'))) {
      playNotificationSound('newjoining');
    }
  });

  socket.on('private_message', (data) => {
    if (data.from && data.from.toLowerCase() !== currentNick.toLowerCase()) {
      playNotificationSound('private');
    }
  });

  socket.on('nick_changed', (data) => {
    if (data.oldNick === currentNick) {
      currentNick = data.newNick;
      appendSysLine(`*** You are now known as ${currentNick}`, 'success');
    } else {
      appendSysLine(`*** ${data.oldNick} is now known as ${data.newNick}`, 'info');
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
    if (listOnline) listOnline.innerHTML = '';

    let countOwner = 0;
    let countAdmin = 0;
    let countOp = 0;
    let countHalfOp = 0;
    let countOnline = 0;

    if (data.users) {
      data.users.forEach(u => {
        const li = document.createElement('li');
        li.className = 'user-group-item';
        li.textContent = (u.prefix || '') + u.nick;
        li.title = `${u.nick} (${u.roleName || 'User'})`;

        li.onclick = () => {
          msgInput.value = `/msg ${u.nick} `;
          msgInput.focus();
        };

        const role = (u.roleName || '').toLowerCase();
        const prefix = u.prefix || '';
        const rank = u.rank || 0;

        // Group classification: OWNER, ADMIN, OP, HALF-OP, ONLINE
        if (rank >= 5 || prefix === '~' || role.includes('owner') || role.includes('founder')) {
          if (listOwner) listOwner.appendChild(li);
          countOwner++;
        } else if (rank >= 4 || prefix === '&' || role.includes('admin') || role.includes('oper') || u.is_oper) {
          if (listAdmin) listAdmin.appendChild(li);
          countAdmin++;
        } else if (rank >= 3 || prefix === '@' || role.includes('op') || role.includes('operator')) {
          if (listOp) listOp.appendChild(li);
          countOp++;
        } else if (rank >= 2 || prefix === '%' || role.includes('halfop')) {
          if (listHalfOp) listHalfOp.appendChild(li);
          countHalfOp++;
        } else {
          if (listOnline) listOnline.appendChild(li);
          countOnline++;
        }
      });
    }

    // Dynamically show banner ONLY if at least 1 user is present
    if (bannerOwner) bannerOwner.style.display = countOwner > 0 ? 'block' : 'none';
    if (bannerAdmin) bannerAdmin.style.display = countAdmin > 0 ? 'block' : 'none';
    if (bannerOp) bannerOp.style.display = countOp > 0 ? 'block' : 'none';
    if (bannerHalfOp) bannerHalfOp.style.display = countHalfOp > 0 ? 'block' : 'none';
    if (bannerOnline) bannerOnline.style.display = countOnline > 0 ? 'block' : 'none';
  });

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

    if (chosenNick && chosenNick !== currentNick) {
      socket.emit('change_nick', { newNick: chosenNick });
      currentNick = chosenNick;
    }

    if (chosenPass) {
      socket.emit('identify', { nick: currentNick, password: chosenPass });
    }

    loginOverlay.style.display = 'none';
    msgInput.focus();
  });

  // Handle Chat Form Submit
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    let text = msgInput.value.trim();
    if (!text) return;

    if (text.startsWith('/')) {
      socket.emit('execute_command', { command: text, channel: currentChannel });
    } else {
      if (isBold) text = `<b>${text}</b>`;
      if (isItalic) text = `<i>${text}</i>`;
      if (isUnderline) text = `<u>${text}</u>`;
      if (selectedColor) text = `<span style="color:${selectedColor}">${text}</span>`;

      socket.emit('send_message', { channel: currentChannel, message: text });
    }

    msgInput.value = '';
    msgInput.focus();
  });

  btnNick.addEventListener('click', () => {
    loginOverlay.style.display = 'flex';
    nickInput.focus();
  });
});
