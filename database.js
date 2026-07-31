const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'mirc_database.json');

let dbData = {
  registered_nicks: {},     // nick_lower -> { nick, password_hash, global_role: 'user'|'admin'|'owner'|'oper', vhost, ident, realname, created_at }
  registered_channels: {},  // channel_lower -> { name, founder_nick, password_hash, description, modes: { r: false, i: false, m: false, k: '' }, created_at }
  channel_access: {},       // channel_lower -> [ { nick_lower, original_nick, role: 'owner'|'admin'|'op'|'halfop'|'voice', added_by, created_at } ]
  ip_bans: [],              // [{ id, ip, reason, banned_by, created_at }]
  nick_bans: [],            // [{ id, nick_lower, original_nick, reason, banned_by, created_at }]
  shuns: [],                // [{ id, target, target_lower, reason, shunned_by, expires_at, created_at }]
  dcc_deny: [],             // [{ id, mask, reason, added_by, created_at }]
  pappu_brain: {
    learned_qa: []          // [{ trigger_lower, trigger, response, learned_from, created_at }]
  },
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
  ],
  ip_history: [],           // [{ id, nick, ip, user_agent, last_seen }]
  chat_logs: []             // [{ id, channel, nick, ip, message, timestamp }]
};

function initDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const loaded = JSON.parse(raw);
      dbData = {
        registered_nicks: loaded.registered_nicks || {},
        registered_channels: loaded.registered_channels || {},
        channel_access: loaded.channel_access || {},
        ip_bans: loaded.ip_bans || [],
        nick_bans: loaded.nick_bans || [],
        shuns: loaded.shuns || [],
        dcc_deny: loaded.dcc_deny || [],
        pappu_brain: loaded.pappu_brain || { learned_qa: [] },
        motd: loaded.motd || dbData.motd,
        opermotd: loaded.opermotd || dbData.opermotd,
        ip_history: loaded.ip_history || [],
        chat_logs: loaded.chat_logs || []
      };
    } else {
      saveDatabase();
    }
  } catch (err) {
    console.error('Error initializing database file:', err);
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

initDatabase();

const Database = {
  // Register Nick
  async registerNick(nick, password, globalRole = 'user') {
    const nickLower = nick.toLowerCase();
    if (dbData.registered_nicks[nickLower]) {
      return { success: false, message: `Nick '${nick}' is already registered.` };
    }
    const hash = await bcrypt.hash(password, 10);
    dbData.registered_nicks[nickLower] = {
      nick: nick,
      password_hash: hash,
      global_role: globalRole,
      is_admin: globalRole === 'admin' || globalRole === 'owner' || globalRole === 'oper' ? 1 : 0,
      vhost: '',
      ident: 'user',
      realname: 'PakiChat User',
      created_at: new Date().toISOString()
    };
    saveDatabase();
    return { success: true, message: `Nick '${nick}' registered successfully!` };
  },

  async verifyNick(nick, password) {
    const nickLower = nick.toLowerCase();
    const user = dbData.registered_nicks[nickLower];
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
    return !!dbData.registered_nicks[nickLower];
  },

  getUser(nick) {
    const nickLower = nick.toLowerCase();
    return dbData.registered_nicks[nickLower] || null;
  },

  // Register Channel (Founder)
  async registerChannel(chName, founderNick, password, description = 'Official Channel') {
    const chLower = chName.toLowerCase();
    if (dbData.registered_channels[chLower]) {
      return { success: false, message: `Channel '${chName}' is already registered to Founder '${dbData.registered_channels[chLower].founder_nick}'.` };
    }

    if (!this.isRegistered(founderNick)) {
      return { success: false, message: `Nick '${founderNick}' is NOT registered. You must register your nick first using /register <password>.` };
    }

    const hash = await bcrypt.hash(password, 10);
    dbData.registered_channels[chLower] = {
      name: chName,
      founder_nick: founderNick,
      password_hash: hash,
      description: description,
      modes: { r: false, i: false, m: false, k: '' },
      created_at: new Date().toISOString()
    };

    // Add Founder as permanent Owner in access list
    this.addChannelAccess(chName, founderNick, 'owner', founderNick);

    saveDatabase();
    return { success: true, message: `Channel '${chName}' registered successfully to Founder '${founderNick}'!` };
  },

  dropChannel(chName, requestingNick) {
    const chLower = chName.toLowerCase();
    const reg = dbData.registered_channels[chLower];
    if (!reg) {
      return { success: false, message: `Channel '${chName}' is not registered.` };
    }

    if (reg.founder_nick.toLowerCase() !== requestingNick.toLowerCase()) {
      return { success: false, message: `Permission Denied: Only Founder '${reg.founder_nick}' can drop ${chName}.` };
    }

    delete dbData.registered_channels[chLower];
    delete dbData.channel_access[chLower];
    saveDatabase();
    return { success: true, message: `Channel '${chName}' registration has been dropped.` };
  },

  getRegisteredChannel(chName) {
    const chLower = chName.toLowerCase();
    return dbData.registered_channels[chLower] || null;
  },

  saveChannelModes(chName, modesObj) {
    const chLower = chName.toLowerCase();
    if (!dbData.registered_channels[chLower]) {
      dbData.registered_channels[chLower] = {
        name: chName,
        founder_nick: 'Server',
        password_hash: '',
        description: 'Default Room',
        modes: modesObj,
        created_at: new Date().toISOString()
      };
    } else {
      dbData.registered_channels[chLower].modes = modesObj;
    }
    saveDatabase();
  },

  addChannelAccess(chName, nick, role, addedBy) {
    const chLower = chName.toLowerCase();
    const nickLower = nick.toLowerCase();

    if (!this.isRegistered(nick)) {
      return { success: false, message: `Nick '${nick}' is NOT registered. Only registered nicks can be added to the channel access list.` };
    }

    if (!dbData.channel_access) dbData.channel_access = {};
    if (!dbData.channel_access[chLower]) {
      dbData.channel_access[chLower] = [];
    }

    const existingIndex = dbData.channel_access[chLower].findIndex(item => item.nick_lower === nickLower);
    const entry = {
      nick_lower: nickLower,
      original_nick: nick,
      role: role.toLowerCase(),
      added_by: addedBy,
      created_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      dbData.channel_access[chLower][existingIndex] = entry;
    } else {
      dbData.channel_access[chLower].push(entry);
    }

    saveDatabase();
    return { success: true, message: `Added '${nick}' as [${role.toUpperCase()}] to ${chName} access list.` };
  },

  removeChannelAccess(chName, nick) {
    const chLower = chName.toLowerCase();
    const nickLower = nick.toLowerCase();

    if (!dbData.channel_access) dbData.channel_access = {};
    if (!dbData.channel_access[chLower]) {
      return { success: false, message: `No access list found for ${chName}.` };
    }

    const initialLen = dbData.channel_access[chLower].length;
    dbData.channel_access[chLower] = dbData.channel_access[chLower].filter(item => item.nick_lower !== nickLower);

    if (dbData.channel_access[chLower].length < initialLen) {
      saveDatabase();
      return { success: true, message: `Removed '${nick}' from ${chName} access list.` };
    }
    return { success: false, message: `'${nick}' was not in ${chName} access list.` };
  },

  getChannelAccessList(chName) {
    const chLower = chName.toLowerCase();
    if (!dbData.channel_access) dbData.channel_access = {};
    return dbData.channel_access[chLower] || [];
  },

  getUserChannelRole(chName, nick) {
    const chLower = chName.toLowerCase();
    const nickLower = nick.toLowerCase();

    const regChan = this.getRegisteredChannel(chName);
    if (regChan && regChan.founder_nick.toLowerCase() === nickLower) {
      return 'owner';
    }

    if (!dbData.channel_access) dbData.channel_access = {};
    const list = dbData.channel_access[chLower] || [];
    const entry = list.find(item => item.nick_lower === nickLower);
    return entry ? entry.role : null;
  },

  // PAPPU AI SELF-LEARNING BRAIN ENGINE
  learnPappuFact(trigger, response, learnedFrom = 'User') {
    if (!dbData.pappu_brain) dbData.pappu_brain = { learned_qa: [] };
    const triggerLower = trigger.toLowerCase().trim();

    const existingIndex = dbData.pappu_brain.learned_qa.findIndex(item => item.trigger_lower === triggerLower);
    const entry = {
      trigger_lower: triggerLower,
      trigger: trigger.trim(),
      response: response.trim(),
      learned_from: learnedFrom,
      created_at: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      dbData.pappu_brain.learned_qa[existingIndex] = entry;
    } else {
      dbData.pappu_brain.learned_qa.push(entry);
    }
    saveDatabase();
    return { success: true, message: `Pappu learned: '${trigger}' ➔ '${response}'` };
  },

  getPappuLearnedFact(query) {
    if (!dbData.pappu_brain || !dbData.pappu_brain.learned_qa) return null;
    const queryLower = query.toLowerCase().trim();

    const found = dbData.pappu_brain.learned_qa.find(item => queryLower.includes(item.trigger_lower) || item.trigger_lower.includes(queryLower));
    return found ? found.response : null;
  },

  getAllPappuLearnedFacts() {
    return (dbData.pappu_brain && dbData.pappu_brain.learned_qa) ? dbData.pappu_brain.learned_qa : [];
  },

  // STEALTH /SHUN MANAGEMENT WITH TIMED EXPIRATION
  shunUser(target, reason = 'Shunned by IRCop', shunnedBy = 'Server', durationMs = 0) {
    const targetLower = target.toLowerCase();
    if (!dbData.shuns) dbData.shuns = [];

    // Remove existing if any
    dbData.shuns = dbData.shuns.filter(s => s.target_lower !== targetLower && s.target !== target);

    const expiresAt = durationMs > 0 ? Date.now() + durationMs : null;

    dbData.shuns.push({
      id: Date.now(),
      target: target,
      target_lower: targetLower,
      reason: reason,
      shunned_by: shunnedBy,
      expires_at: expiresAt,
      created_at: new Date().toISOString()
    });
    saveDatabase();
    return {
      success: true,
      message: `'${target}' has been STEALTH SHUNNED${durationMs > 0 ? ` for ${durationMs/1000}s` : ''}.`,
      expires_at: expiresAt
    };
  },

  unshunUser(target) {
    if (!dbData.shuns) dbData.shuns = [];
    const targetLower = target.toLowerCase();
    const initialLen = dbData.shuns.length;
    dbData.shuns = dbData.shuns.filter(s => s.target_lower !== targetLower && s.target !== target);
    if (dbData.shuns.length < initialLen) {
      saveDatabase();
      return { success: true, message: `'${target}' has been un-shunned.` };
    }
    return { success: false, message: `'${target}' was not shunned.` };
  },

  isShunned(nick, ip) {
    if (!dbData.shuns) return false;
    const nickLower = (nick || '').toLowerCase();
    const now = Date.now();

    // Cleanup expired shuns
    dbData.shuns = dbData.shuns.filter(s => !s.expires_at || s.expires_at > now);

    return dbData.shuns.some(s => s.target_lower === nickLower || s.target === ip);
  },

  // DCC DENY (/DCCDENY)
  addDCCDeny(mask, reason = 'DCC Deny mask', addedBy = 'Server') {
    if (!dbData.dcc_deny) dbData.dcc_deny = [];
    dbData.dcc_deny.push({
      id: Date.now(),
      mask: mask,
      reason: reason,
      added_by: addedBy,
      created_at: new Date().toISOString()
    });
    saveDatabase();
    return { success: true, message: `Added DCCDENY for '${mask}'.` };
  },

  removeDCCDeny(mask) {
    if (!dbData.dcc_deny) dbData.dcc_deny = [];
    const initialLen = dbData.dcc_deny.length;
    dbData.dcc_deny = dbData.dcc_deny.filter(d => d.mask !== mask);
    if (dbData.dcc_deny.length < initialLen) {
      saveDatabase();
      return { success: true, message: `Removed DCCDENY for '${mask}'.` };
    }
    return { success: false, message: `DCCDENY mask '${mask}' not found.` };
  },

  getMOTD() {
    return dbData.motd || [];
  },

  getOperMOTD() {
    return dbData.opermotd || [];
  },

  addMOTD(text) {
    if (!dbData.motd) dbData.motd = [];
    dbData.motd.push(text);
    saveDatabase();
  },

  addOperMOTD(text) {
    if (!dbData.opermotd) dbData.opermotd = [];
    dbData.opermotd.push(text);
    saveDatabase();
  },

  reloadConfig() {
    initDatabase();
    return { success: true, message: 'Server configuration and database rehashed successfully.' };
  },

  logUserIP(nick, ip, userAgent = '') {
    const existingIndex = dbData.ip_history.findIndex(
      item => item.nick.toLowerCase() === nick.toLowerCase() && item.ip === ip
    );
    const now = new Date().toISOString();
    if (existingIndex >= 0) {
      dbData.ip_history[existingIndex].last_seen = now;
      dbData.ip_history[existingIndex].user_agent = userAgent;
    } else {
      dbData.ip_history.push({
        id: Date.now() + Math.random(),
        nick: nick,
        ip: ip,
        user_agent: userAgent,
        last_seen: now
      });
    }
    saveDatabase();
  },

  banIP(ip, reason = 'Banned by operator', bannedBy = 'Server') {
    const existing = dbData.ip_bans.find(b => b.ip === ip);
    if (existing) {
      return { success: false, message: `IP ${ip} is already banned.` };
    }
    dbData.ip_bans.push({
      id: Date.now(),
      ip: ip,
      reason: reason,
      banned_by: bannedBy,
      created_at: new Date().toISOString()
    });
    saveDatabase();
    return { success: true, message: `IP ${ip} has been banned.` };
  },

  unbanIP(ip) {
    const initialLength = dbData.ip_bans.length;
    dbData.ip_bans = dbData.ip_bans.filter(b => b.ip !== ip);
    if (dbData.ip_bans.length < initialLength) {
      saveDatabase();
      return { success: true, message: `IP ${ip} unbanned successfully.` };
    }
    return { success: false, message: `IP ${ip} was not found in ban list.` };
  },

  banNick(nick, reason = 'Banned by operator', bannedBy = 'Server') {
    const nickLower = nick.toLowerCase();
    const existing = dbData.nick_bans.find(b => b.nick_lower === nickLower);
    if (existing) {
      return { success: false, message: `Nick '${nick}' is already banned.` };
    }
    dbData.nick_bans.push({
      id: Date.now(),
      nick_lower: nickLower,
      original_nick: nick,
      reason: reason,
      banned_by: bannedBy,
      created_at: new Date().toISOString()
    });
    saveDatabase();
    return { success: true, message: `Nick '${nick}' has been banned.` };
  },

  unbanNick(nick) {
    const nickLower = nick.toLowerCase();
    const initialLength = dbData.nick_bans.length;
    dbData.nick_bans = dbData.nick_bans.filter(b => b.nick_lower !== nickLower);
    if (dbData.nick_bans.length < initialLength) {
      saveDatabase();
      return { success: true, message: `Nick '${nick}' unbanned successfully.` };
    }
    return { success: false, message: `Nick '${nick}' was not found in ban list.` };
  },

  isIPBanned(ip) {
    return dbData.ip_bans.some(b => b.ip === ip);
  },

  isNickBanned(nick) {
    const nickLower = nick.toLowerCase();
    return dbData.nick_bans.some(b => b.nick_lower === nickLower);
  },

  getBans() {
    return {
      ip_bans: dbData.ip_bans,
      nick_bans: dbData.nick_bans,
      shuns: dbData.shuns || [],
      dcc_deny: dbData.dcc_deny || []
    };
  },

  logChat(channel, nick, ip, message) {
    dbData.chat_logs.push({
      id: Date.now() + Math.random(),
      channel,
      nick,
      ip,
      message,
      timestamp: new Date().toISOString()
    });
    if (dbData.chat_logs.length > 1000) {
      dbData.chat_logs.shift();
    }
    saveDatabase();
  },

  getAdminData() {
    return {
      ip_history: dbData.ip_history.sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen)),
      ip_bans: dbData.ip_bans,
      nick_bans: dbData.nick_bans,
      shuns: dbData.shuns || [],
      dcc_deny: dbData.dcc_deny || [],
      pappu_learned: (dbData.pappu_brain && dbData.pappu_brain.learned_qa) ? dbData.pappu_brain.learned_qa : [],
      registered_nicks: Object.values(dbData.registered_nicks).map(u => ({
        nick: u.nick,
        global_role: u.global_role || (u.is_admin ? 'admin' : 'user'),
        created_at: u.created_at
      })),
      registered_channels: Object.values(dbData.registered_channels),
      channel_access: dbData.channel_access || {},
      recent_logs: dbData.chat_logs.slice(-200)
    };
  }
};

module.exports = Database;
