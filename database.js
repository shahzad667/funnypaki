const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// DECOUPLED DATABASE STORAGE FILES
const USER_DB_FILE = path.join(__dirname, 'user_database.json');
const SYS_CONFIG_FILE = path.join(__dirname, 'system_config.json');
const LEGACY_DB_FILE = path.join(__dirname, 'mirc_database.json');

// Dedicated User & Channel Data Store (100% Isolated from code updates)
let userData = {
  registered_nicks: {},     // nick_lower -> { nick, password_hash, global_role: 'user'|'admin'|'owner'|'oper', vhost, ident, realname, created_at }
  registered_channels: {},  // channel_lower -> { name, founder_nick, password_hash, description, modes: { r: false, i: false, m: false, k: '' }, created_at }
  channel_access: {},       // channel_lower -> [ { nick_lower, original_nick, role: 'owner'|'admin'|'op'|'halfop'|'voice', added_by, created_at } ]
  ip_bans: [],              // [{ id, ip, reason, banned_by, created_at }]
  nick_bans: [],            // [{ id, nick_lower, original_nick, reason, banned_by, created_at }]
  shuns: [],                // [{ id, target, target_lower, reason, shunned_by, expires_at, created_at }]
  device_bans: [],          // [{ id, device_id, target_nick, reason, banned_by, created_at }]
  dcc_deny: [],             // [{ id, mask, reason, added_by, created_at }]
  spam_filters: [],         // [{ id, word, word_lower, action: 'block'|'kick'|'ban'|'shun', added_by, created_at }]
  word_stats: {},           // nick_lower -> { original_nick, today_date, today_words, all_time_words }
  pappu_brain: {
    learned_qa: []          // [{ trigger_lower, trigger, response, learned_from, created_at }]
  },
  ip_history: [],           // [{ id, nick, ip, device_id, user_agent, last_seen }]
  chat_logs: []             // [{ id, channel, nick, ip, message, timestamp }]
};

// System Configuration Store (Isolated MOTD & Server Settings)
let sysConfig = {
  motd: [
    "==========================================================",
    "  Welcome to #FunnyPaki UnrealIRCd Server                 ",
    "  Respect all users & Obey Server Operators!              ",
    "=========================================================="
  ],
  opermotd: [
    "==========================================================",
    "  OPERATOR MOTD: Confidential Server Oper Area           ",
    "  Do not abuse Oper privileges! All actions logged.       ",
    "=========================================================="
  ]
};

function initDatabases() {
  try {
    // 1. Check if user_database.json exists, otherwise migrate from legacy mirc_database.json if present
    if (fs.existsSync(USER_DB_FILE)) {
      const rawUser = fs.readFileSync(USER_DB_FILE, 'utf8');
      const loadedUser = JSON.parse(rawUser);
      userData = {
        registered_nicks: loadedUser.registered_nicks || {},
        registered_channels: loadedUser.registered_channels || {},
        channel_access: loadedUser.channel_access || {},
        ip_bans: loadedUser.ip_bans || [],
        nick_bans: loadedUser.nick_bans || [],
        shuns: loadedUser.shuns || [],
        dcc_deny: loadedUser.dcc_deny || [],
        pappu_brain: loadedUser.pappu_brain || { learned_qa: [] },
        ip_history: loadedUser.ip_history || [],
        chat_logs: loadedUser.chat_logs || []
      };
    } else if (fs.existsSync(LEGACY_DB_FILE)) {
      console.log('Migrating legacy data from mirc_database.json to user_database.json...');
      const rawLegacy = fs.readFileSync(LEGACY_DB_FILE, 'utf8');
      const loadedLegacy = JSON.parse(rawLegacy);
      userData = {
        registered_nicks: loadedLegacy.registered_nicks || {},
        registered_channels: loadedLegacy.registered_channels || {},
        channel_access: loadedLegacy.channel_access || {},
        ip_bans: loadedLegacy.ip_bans || [],
        nick_bans: loadedLegacy.nick_bans || [],
        shuns: loadedLegacy.shuns || [],
        dcc_deny: loadedLegacy.dcc_deny || [],
        pappu_brain: loadedLegacy.pappu_brain || { learned_qa: [] },
        ip_history: loadedLegacy.ip_history || [],
        chat_logs: loadedLegacy.chat_logs || []
      };
      saveUserData();
    } else {
      saveUserData();
    }

    // 2. Load or initialize System Config
    if (fs.existsSync(SYS_CONFIG_FILE)) {
      const rawSys = fs.readFileSync(SYS_CONFIG_FILE, 'utf8');
      const loadedSys = JSON.parse(rawSys);
      sysConfig = {
        motd: loadedSys.motd || sysConfig.motd,
        opermotd: loadedSys.opermotd || sysConfig.opermotd
      };
    } else {
      saveSysConfig();
    }

  } catch (err) {
    console.error('Error initializing decoupled databases:', err);
  }
}

function saveUserData() {
  try {
    fs.writeFileSync(USER_DB_FILE, JSON.stringify(userData, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving user_database.json:', err);
  }
}

function saveSysConfig() {
  try {
    fs.writeFileSync(SYS_CONFIG_FILE, JSON.stringify(sysConfig, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving system_config.json:', err);
  }
}

initDatabases();

const Database = {
  // Register Nick
  async registerNick(nick, password, globalRole = 'user') {
    const nickLower = nick.toLowerCase();
    if (userData.registered_nicks[nickLower]) {
      return { success: false, message: `Nick '${nick}' is already registered.` };
    }
    const hash = await bcrypt.hash(password, 10);
    userData.registered_nicks[nickLower] = {
      nick: nick,
      password_hash: hash,
      global_role: globalRole,
      is_admin: globalRole === 'admin' || globalRole === 'owner' || globalRole === 'oper' ? 1 : 0,
      vhost: '',
      ident: 'user',
      realname: 'PakiChat User',
      created_at: new Date().toISOString()
    };
    saveUserData();
    return { success: true, message: `Nick '${nick}' registered successfully!` };
  },

  async verifyNick(nick, password) {
    const nickLower = nick.toLowerCase();
    const user = userData.registered_nicks[nickLower];
    if (!user) {
      return { success: false, message: `Nick '${nick}' is not registered.` };
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return { success: false, message: `Incorrect password for nick '${nick}'.` };
    }
    return { success: true, user: user };
  },

  isRegistered(nick) {
    const nickLower = nick.toLowerCase();
    return !!userData.registered_nicks[nickLower];
  },

  getUser(nick) {
    const nickLower = nick.toLowerCase();
    return userData.registered_nicks[nickLower] || null;
  },

  // Register Channel (Founder)
  async registerChannel(chName, founderNick, password, description = 'Official Channel') {
    const chLower = chName.toLowerCase();
    if (userData.registered_channels[chLower]) {
      return { success: false, message: `Channel '${chName}' is already registered to Founder '${userData.registered_channels[chLower].founder_nick}'.` };
    }

    if (!this.isRegistered(founderNick)) {
      return { success: false, message: `Nick '${founderNick}' is NOT registered. You must register your nick first using /register <password>.` };
    }

    const hash = await bcrypt.hash(password, 10);
    userData.registered_channels[chLower] = {
      name: chName,
      founder_nick: founderNick,
      password_hash: hash,
      description: description,
      modes: { r: false, i: false, m: false, k: '' },
      created_at: new Date().toISOString()
    };

    // Add Founder as permanent Owner in access list
    this.addChannelAccess(chName, founderNick, 'owner', founderNick);

    saveUserData();
    return { success: true, message: `Channel '${chName}' registered successfully to Founder '${founderNick}'!` };
  },

  dropChannel(chName, requestingNick) {
    const chLower = chName.toLowerCase();
    const reg = userData.registered_channels[chLower];
    if (!reg) {
      return { success: false, message: `Channel '${chName}' is not registered.` };
    }

    if (reg.founder_nick.toLowerCase() !== requestingNick.toLowerCase()) {
      return { success: false, message: `Permission Denied: Only Founder '${reg.founder_nick}' can drop ${chName}.` };
    }

    delete userData.registered_channels[chLower];
    delete userData.channel_access[chLower];
    saveUserData();
    return { success: true, message: `Channel '${chName}' registration has been dropped.` };
  },

  getRegisteredChannel(chName) {
    const chLower = chName.toLowerCase();
    return userData.registered_channels[chLower] || null;
  },

  saveChannelModes(chName, modesObj) {
    const chLower = chName.toLowerCase();
    if (!userData.registered_channels[chLower]) {
      userData.registered_channels[chLower] = {
        name: chName,
        founder_nick: 'Server',
        password_hash: '',
        description: 'Default Room',
        modes: modesObj,
        created_at: new Date().toISOString()
      };
    } else {
      userData.registered_channels[chLower].modes = modesObj;
    }
    saveUserData();
  },

  addChannelAccess(chName, nick, role, addedBy) {
    const chLower = chName.toLowerCase();
    const nickLower = nick.toLowerCase();

    if (!this.isRegistered(nick)) {
      return { success: false, message: `Nick '${nick}' is NOT registered. Only registered nicks can be added to the channel access list.` };
    }

    if (!userData.channel_access) userData.channel_access = {};
    if (!userData.channel_access[chLower]) {
      userData.channel_access[chLower] = [];
    }

    const existingIndex = userData.channel_access[chLower].findIndex(item => item.nick_lower === nickLower);
    const entry = {
      nick_lower: nickLower,
      original_nick: nick,
      role: role.toLowerCase(),
      added_by: addedBy,
      created_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      userData.channel_access[chLower][existingIndex] = entry;
    } else {
      userData.channel_access[chLower].push(entry);
    }

    saveUserData();
    return { success: true, message: `Added '${nick}' as [${role.toUpperCase()}] to ${chName} access list.` };
  },

  removeChannelAccess(chName, nick) {
    const chLower = chName.toLowerCase();
    const nickLower = nick.toLowerCase();

    if (!userData.channel_access) userData.channel_access = {};
    if (!userData.channel_access[chLower]) {
      return { success: false, message: `No access list found for ${chName}.` };
    }

    const initialLen = userData.channel_access[chLower].length;
    userData.channel_access[chLower] = userData.channel_access[chLower].filter(item => item.nick_lower !== nickLower);

    if (userData.channel_access[chLower].length < initialLen) {
      saveUserData();
      return { success: true, message: `Removed '${nick}' from ${chName} access list.` };
    }
    return { success: false, message: `'${nick}' was not in ${chName} access list.` };
  },

  getChannelAccessList(chName) {
    const chLower = chName.toLowerCase();
    if (!userData.channel_access) userData.channel_access = {};
    return userData.channel_access[chLower] || [];
  },

  getUserChannelRole(chName, nick) {
    const chLower = chName.toLowerCase();
    const nickLower = nick.toLowerCase();

    const regChan = this.getRegisteredChannel(chName);
    if (regChan && regChan.founder_nick.toLowerCase() === nickLower) {
      return 'owner';
    }

    if (!userData.channel_access) userData.channel_access = {};
    const list = userData.channel_access[chLower] || [];
    const entry = list.find(item => item.nick_lower === nickLower);
    return entry ? entry.role : null;
  },

  // PAPPU AI SELF-LEARNING BRAIN ENGINE
  learnPappuFact(trigger, response, learnedFrom = 'User') {
    if (!userData.pappu_brain) userData.pappu_brain = { learned_qa: [] };
    const triggerLower = trigger.toLowerCase().trim();

    const existingIndex = userData.pappu_brain.learned_qa.findIndex(item => item.trigger_lower === triggerLower);
    const entry = {
      trigger_lower: triggerLower,
      trigger: trigger.trim(),
      response: response.trim(),
      learned_from: learnedFrom,
      created_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      userData.pappu_brain.learned_qa[existingIndex] = entry;
    } else {
      userData.pappu_brain.learned_qa.push(entry);
    }
    saveUserData();
    return { success: true, message: `Pappu learned: '${trigger}' ➔ '${response}'` };
  },

  getPappuLearnedFact(query) {
    if (!userData.pappu_brain || !userData.pappu_brain.learned_qa) return null;
    const queryLower = query.toLowerCase().trim();

    const found = userData.pappu_brain.learned_qa.find(item => queryLower.includes(item.trigger_lower) || item.trigger_lower.includes(queryLower));
    return found ? found.response : null;
  },

  getAllPappuLearnedFacts() {
    return (userData.pappu_brain && userData.pappu_brain.learned_qa) ? userData.pappu_brain.learned_qa : [];
  },

  // STEALTH /SHUN MANAGEMENT WITH TIMED EXPIRATION
  shunUser(target, reason = 'Shunned by IRCop', shunnedBy = 'Server', durationMs = 0) {
    const targetLower = target.toLowerCase();
    if (!userData.shuns) userData.shuns = [];

    userData.shuns = userData.shuns.filter(s => s.target_lower !== targetLower && s.target !== target);

    const expiresAt = durationMs > 0 ? Date.now() + durationMs : null;

    userData.shuns.push({
      id: Date.now(),
      target: target,
      target_lower: targetLower,
      reason: reason,
      shunned_by: shunnedBy,
      expires_at: expiresAt,
      created_at: new Date().toISOString()
    });
    saveUserData();
    return {
      success: true,
      message: `'${target}' has been STEALTH SHUNNED${durationMs > 0 ? ` for ${durationMs/1000}s` : ''}.`,
      expires_at: expiresAt
    };
  },

  unshunUser(target) {
    if (!userData.shuns) userData.shuns = [];
    const targetLower = target.toLowerCase();
    const initialLen = userData.shuns.length;
    userData.shuns = userData.shuns.filter(s => s.target_lower !== targetLower && s.target !== target);
    if (userData.shuns.length < initialLen) {
      saveUserData();
      return { success: true, message: `'${target}' has been un-shunned.` };
    }
    return { success: false, message: `'${target}' was not shunned.` };
  },

  isShunned(nick, ip) {
    if (!userData.shuns) return false;
    const nickLower = (nick || '').toLowerCase();
    const now = Date.now();

    userData.shuns = userData.shuns.filter(s => !s.expires_at || s.expires_at > now);

    return userData.shuns.some(s => s.target_lower === nickLower || s.target === ip);
  },

  // DCC DENY (/DCCDENY)
  addDCCDeny(mask, reason = 'DCC Deny mask', addedBy = 'Server') {
    if (!userData.dcc_deny) userData.dcc_deny = [];
    userData.dcc_deny.push({
      id: Date.now(),
      mask: mask,
      reason: reason,
      added_by: addedBy,
      created_at: new Date().toISOString()
    });
    saveUserData();
    return { success: true, message: `Added DCCDENY for '${mask}'.` };
  },

  removeDCCDeny(mask) {
    if (!userData.dcc_deny) userData.dcc_deny = [];
    const initialLen = userData.dcc_deny.length;
    userData.dcc_deny = userData.dcc_deny.filter(d => d.mask !== mask);
    if (userData.dcc_deny.length < initialLen) {
      saveUserData();
      return { success: true, message: `Removed DCCDENY for '${mask}'.` };
    }
    return { success: false, message: `DCCDENY mask '${mask}' not found.` };
  },

  getMOTD() {
    return sysConfig.motd || [];
  },

  getOperMOTD() {
    return sysConfig.opermotd || [];
  },

  addMOTD(text) {
    if (!sysConfig.motd) sysConfig.motd = [];
    sysConfig.motd.push(text);
    saveSysConfig();
  },

  addOperMOTD(text) {
    if (!sysConfig.opermotd) sysConfig.opermotd = [];
    sysConfig.opermotd.push(text);
    saveSysConfig();
  },

  reloadConfig() {
    initDatabases();
    return { success: true, message: 'Server configuration and decoupled databases rehashed successfully.' };
  },

  logUserIP(nick, ip, userAgent = '') {
    const existingIndex = userData.ip_history.findIndex(
      item => item.nick.toLowerCase() === nick.toLowerCase() && item.ip === ip
    );
    const now = new Date().toISOString();
    if (existingIndex >= 0) {
      userData.ip_history[existingIndex].last_seen = now;
      userData.ip_history[existingIndex].user_agent = userAgent;
    } else {
      userData.ip_history.push({
        id: Date.now() + Math.random(),
        nick: nick,
        ip: ip,
        user_agent: userAgent,
        last_seen: now
      });
    }
    saveUserData();
  },

  // Wildcard Mask Matcher (*@162.12.145.* or 162.12.*.*)
  maskToRegex(mask) {
    if (!mask) return null;
    let clean = mask.trim();
    if (clean.includes('@')) {
      clean = clean.split('@')[1]; // Extract IP portion from *@IP
    }
    const pattern = clean
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${pattern}$`, 'i');
  },

  isIPBanned(ip) {
    if (!ip || !userData.ip_bans) return false;
    return userData.ip_bans.some(b => {
      if (b.ip === ip) return true;
      const rx = this.maskToRegex(b.ip);
      return rx ? rx.test(ip) : false;
    });
  },

  getWhowas(nick) {
    if (!nick) return [];
    const nickLower = nick.toLowerCase().trim();
    if (!userData.ip_history) return [];

    const list = userData.ip_history.filter(h => h.nick.toLowerCase() === nickLower);
    list.sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
    return list;
  },

  // --- CHANNEL ANTI-SPAM & BAD WORDS FILTER ENGINE ---
  addSpamFilter(word, action = 'block', addedBy = 'Server') {
    if (!userData.spam_filters) userData.spam_filters = [];
    const wordLower = word.toLowerCase().trim();
    if (!wordLower) return { success: false, message: 'Word is required.' };

    const existingIndex = userData.spam_filters.findIndex(f => f.word_lower === wordLower);
    const entry = {
      id: Date.now() + Math.random(),
      word: word.trim(),
      word_lower: wordLower,
      action: action.toLowerCase(), // 'block'|'kick'|'ban'|'shun'
      added_by: addedBy,
      created_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      userData.spam_filters[existingIndex] = entry;
    } else {
      userData.spam_filters.push(entry);
    }
    saveUserData();
    return { success: true, message: `Spam filter for '${word}' [${action.toUpperCase()}] added successfully!` };
  },

  removeSpamFilter(id) {
    if (!userData.spam_filters) userData.spam_filters = [];
    const initialLen = userData.spam_filters.length;
    userData.spam_filters = userData.spam_filters.filter(f => String(f.id) !== String(id));
    if (userData.spam_filters.length < initialLen) {
      saveUserData();
      return { success: true, message: 'Spam filter removed.' };
    }
    return { success: false, message: 'Filter not found.' };
  },

  getSpamFilters() {
    if (!userData.spam_filters) userData.spam_filters = [];
    return userData.spam_filters;
  },

  checkSpamMatch(text) {
    if (!text || !userData.spam_filters || userData.spam_filters.length === 0) return null;
    const textLower = text.toLowerCase();

    for (const filter of userData.spam_filters) {
      if (textLower.includes(filter.word_lower)) {
        return filter;
      }
    }
    return null;
  },

  // --- DEVICE FINGERPRINT BAN ENGINE ---
  isDeviceBanned(deviceId) {
    if (!deviceId || !userData.device_bans) return false;
    return userData.device_bans.some(b => b.device_id === deviceId);
  },

  banDevice(deviceId, targetNick = 'Unknown', reason = 'Banned by operator', bannedBy = 'Server') {
    if (!userData.device_bans) userData.device_bans = [];
    if (!deviceId) return { success: false, message: 'Invalid Device ID.' };

    const existing = userData.device_bans.find(b => b.device_id === deviceId);
    if (existing) {
      return { success: false, message: `Device ${deviceId} is already banned.` };
    }

    userData.device_bans.push({
      id: Date.now() + Math.random(),
      device_id: deviceId,
      target_nick: targetNick,
      reason: reason,
      banned_by: bannedBy,
      created_at: new Date().toISOString()
    });
    saveUserData();
    return { success: true, message: `Device [${deviceId}] has been banned!` };
  },

  unbanDevice(deviceId) {
    if (!userData.device_bans) userData.device_bans = [];
    const initialLength = userData.device_bans.length;
    userData.device_bans = userData.device_bans.filter(b => b.device_id !== deviceId && String(b.id) !== String(deviceId));
    if (userData.device_bans.length < initialLength) {
      saveUserData();
      return { success: true, message: `Device [${deviceId}] unbanned successfully.` };
    }
    return { success: false, message: `Device [${deviceId}] was not found.` };
  },

  getDeviceBans() {
    if (!userData.device_bans) userData.device_bans = [];
    return userData.device_bans;
  },

  // --- WORD COUNT STATS ENGINE (!top5, !ttop5, !top10, !ttop10) ---
  trackWords(nick, wordCount) {
    if (!nick || !wordCount || wordCount <= 0) return;
    const nickLower = nick.toLowerCase().trim();
    const botList = ['pappu', 'chanserv', 'nickserv', 'auto-filter', 'server'];
    if (botList.includes(nickLower)) return; // Exclude bots from stats

    // Registered Users ONLY Guard
    if (!this.isRegistered(nickLower)) return;

    if (!userData.word_stats) userData.word_stats = {};
    const todayStr = new Date().toISOString().split('T')[0];

    if (!userData.word_stats[nickLower]) {
      userData.word_stats[nickLower] = {
        original_nick: nick,
        today_date: todayStr,
        today_words: wordCount,
        all_time_words: wordCount
      };
    } else {
      const rec = userData.word_stats[nickLower];
      rec.original_nick = nick; // Keep latest nick casing

      // Reset daily words if date changed
      if (rec.today_date !== todayStr) {
        rec.today_date = todayStr;
        rec.today_words = 0;
      }
      rec.today_words += wordCount;
      rec.all_time_words += wordCount;
    }
    saveUserData();
  },

  getTopChatters(limit = 5, timeframe = 'today') {
    if (!userData.word_stats) return [];
    const botList = ['pappu', 'chanserv', 'nickserv', 'auto-filter', 'server'];
    const todayStr = new Date().toISOString().split('T')[0];

    const list = Object.values(userData.word_stats).filter(item => {
      if (botList.includes(item.original_nick.toLowerCase())) return false;
      if (timeframe === 'today') {
        return item.today_date === todayStr && item.today_words > 0;
      }
      return item.all_time_words > 0;
    });

    list.sort((a, b) => {
      const valA = timeframe === 'today' ? a.today_words : a.all_time_words;
      const valB = timeframe === 'today' ? b.today_words : b.all_time_words;
      return valB - valA;
    });

    return list.slice(0, limit);
  },

  banIP(ip, reason = 'Banned by operator', bannedBy = 'Server') {
    const existing = userData.ip_bans.find(b => b.ip === ip);
    if (existing) {
      return { success: false, message: `IP/Mask ${ip} is already banned.` };
    }
    userData.ip_bans.push({
      id: Date.now(),
      ip: ip,
      reason: reason,
      banned_by: bannedBy,
      created_at: new Date().toISOString()
    });
    saveUserData();
    return { success: true, message: `IP/Mask ${ip} has been banned.` };
  },

  unbanIP(ip) {
    const initialLength = userData.ip_bans.length;
    userData.ip_bans = userData.ip_bans.filter(b => b.ip !== ip);
    if (userData.ip_bans.length < initialLength) {
      saveUserData();
      return { success: true, message: `IP ${ip} unbanned successfully.` };
    }
    return { success: false, message: `IP ${ip} was not found in ban list.` };
  },

  banNick(nick, reason = 'Banned by operator', bannedBy = 'Server') {
    const nickLower = nick.toLowerCase();
    const existing = userData.nick_bans.find(b => b.nick_lower === nickLower);
    if (existing) {
      return { success: false, message: `Nick '${nick}' is already banned.` };
    }
    userData.nick_bans.push({
      id: Date.now(),
      nick_lower: nickLower,
      original_nick: nick,
      reason: reason,
      banned_by: bannedBy,
      created_at: new Date().toISOString()
    });
    saveUserData();
    return { success: true, message: `Nick '${nick}' has been banned.` };
  },

  unbanNick(nick) {
    const nickLower = nick.toLowerCase();
    const initialLength = userData.nick_bans.length;
    userData.nick_bans = userData.nick_bans.filter(b => b.nick_lower !== nickLower);
    if (userData.nick_bans.length < initialLength) {
      saveUserData();
      return { success: true, message: `Nick '${nick}' unbanned successfully.` };
    }
    return { success: false, message: `Nick '${nick}' was not found in ban list.` };
  },

  isIPBanned(ip) {
    return userData.ip_bans.some(b => b.ip === ip);
  },

  isNickBanned(nick) {
    const nickLower = nick.toLowerCase();
    return userData.nick_bans.some(b => b.nick_lower === nickLower);
  },

  getBans() {
    return {
      ip_bans: userData.ip_bans,
      nick_bans: userData.nick_bans,
      shuns: userData.shuns || [],
      device_bans: userData.device_bans || [],
      dcc_deny: userData.dcc_deny || []
    };
  },

  logChat(channel, nick, ip, message) {
    userData.chat_logs.push({
      id: Date.now() + Math.random(),
      channel,
      nick,
      ip,
      message,
      timestamp: new Date().toISOString()
    });
    if (userData.chat_logs.length > 1000) {
      userData.chat_logs.shift();
    }
    saveUserData();
  },

  logUserIP(nick, ip, userAgent = '', deviceId = '') {
    if (!userData.ip_history) userData.ip_history = [];
    if (!userData.visitor_logs) userData.visitor_logs = [];

    const existingIndex = userData.ip_history.findIndex(item => item.nick.toLowerCase() === nick.toLowerCase() && item.ip === ip);
    const nowIso = new Date().toISOString();

    if (existingIndex >= 0) {
      userData.ip_history[existingIndex].last_seen = nowIso;
      userData.ip_history[existingIndex].user_agent = userAgent;
      if (deviceId) userData.ip_history[existingIndex].device_id = deviceId;
    } else {
      userData.ip_history.push({
        id: Date.now() + Math.random(),
        nick,
        ip,
        device_id: deviceId || 'DEV-GENERIC',
        user_agent: userAgent,
        last_seen: nowIso
      });
    }

    // Append to 3-day Visitor Log
    userData.visitor_logs.push({
      id: Date.now() + Math.random(),
      nick: nick,
      ip: ip,
      device_id: deviceId || 'DEV-GENERIC',
      user_agent: userAgent,
      timestamp: nowIso
    });

    this.purgeVisitorLogsOlderThan3Days();
    saveUserData();
  },

  purgeVisitorLogsOlderThan3Days() {
    if (!userData.visitor_logs) userData.visitor_logs = [];
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours
    const now = Date.now();
    const initialLen = userData.visitor_logs.length;

    userData.visitor_logs = userData.visitor_logs.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return (now - logTime) <= THREE_DAYS_MS;
    });

    if (userData.visitor_logs.length < initialLen) {
      saveUserData();
    }
  },

  getVisitorLogs() {
    this.purgeVisitorLogsOlderThan3Days();
    const logs = (userData.visitor_logs || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    const day1Logs = []; // Today (0 - 24h)
    const day2Logs = []; // Yesterday (24h - 48h)
    const day3Logs = []; // 2 Days Ago (48h - 72h)

    const todayIPs = new Set();
    const todayNicks = new Set();
    const todayDevices = new Set();

    logs.forEach(item => {
      const ageMs = now - new Date(item.timestamp).getTime();
      if (ageMs <= DAY_MS) {
        day1Logs.push(item);
        todayIPs.add(item.ip);
        todayNicks.add(item.nick);
        if (item.device_id) todayDevices.add(item.device_id);
      } else if (ageMs <= 2 * DAY_MS) {
        day2Logs.push(item);
      } else if (ageMs <= 3 * DAY_MS) {
        day3Logs.push(item);
      }
    });

    return {
      all_logs: logs,
      day1_logs: day1Logs,
      day2_logs: day2Logs,
      day3_logs: day3Logs,
      stats: {
        today_unique_ips: todayIPs.size,
        today_unique_nicks: todayNicks.size,
        today_unique_devices: todayDevices.size,
        total_3day_logs: logs.length
      }
    };
  },

  getAdminData() {
    this.purgeVisitorLogsOlderThan3Days();
    return {
      ip_history: userData.ip_history.sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen)),
      visitor_logs_summary: this.getVisitorLogs(),
      ip_bans: userData.ip_bans,
      nick_bans: userData.nick_bans,
      shuns: userData.shuns || [],
      dcc_deny: userData.dcc_deny || [],
      pappu_learned: (userData.pappu_brain && userData.pappu_brain.learned_qa) ? userData.pappu_brain.learned_qa : [],
      registered_nicks: Object.values(userData.registered_nicks).map(u => ({
        nick: u.nick,
        global_role: u.global_role || (u.is_admin ? 'admin' : 'user'),
        created_at: u.created_at
      })),
      registered_channels: Object.values(userData.registered_channels),
      channel_access: userData.channel_access || {},
      recent_logs: userData.chat_logs.slice(-200)
    };
  }
};

module.exports = Database;

