const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// High Traffic Mode (HTM) State
let isHTM = false;
let htmNoisy = true;

app.get('/', (req, res) => {
  const ua = req.headers['user-agent'] || '';
  const isMobile = /mobile|iphone|ipad|android|blackberry|mini|windows\sce|palm/i.test(ua);
  if (isMobile && req.query.desktop !== '1') {
    return res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Active Sockets map: socket.id -> { nick, ip, identified, global_role, is_oper, vhost, ident, realname, channels: Set, user_agent, identify_timer }
const users = new Map();

// Active Channels map: channelName -> { topic, users: Set, owners: Set, admins: Set, ops: Set, halfops: Set, voices: Set, modes: {r, i, m, k}, invites: Set<socket.id> }
const channels = new Map();

// --- AI Chat Bot "Pappu" Virtual Registration ---
const BOT_NICK = 'Pappu';
const BOT_SOCKET_ID = 'bot_pappu_socket_id';

users.set(BOT_SOCKET_ID, {
  socketId: BOT_SOCKET_ID,
  nick: BOT_NICK,
  ip: '127.0.0.1 (BOT)',
  identified: true,
  global_role: 'oper',
  is_oper: true,
  is_admin: true,
  vhost: 'bot.pappu.ai',
  ident: 'pappu_bot',
  realname: 'Official #FunnyPaki AI Chat Bot',
  channels: new Set(),
  user_agent: 'PappuAI/2.0',
  identify_timer: null
});

// --- VIRTUAL PAKISTANI MALE & FEMALE ROOM USERS ROSTER ---
const VIRTUAL_USERS = [
  { nick: 'Abeera_32Khi', gender: 'F', city: 'Karachi', age: 32 },
  { nick: 'Ayesha_Lhr', gender: 'F', city: 'Lahore', age: 24 },
  { nick: 'Arooba', gender: 'F', city: 'Islamabad', age: 22 },
  { nick: 'Asmakhi', gender: 'F', city: 'Karachi', age: 26 },
  { nick: 'KIRAN', gender: 'F', city: 'Multan', age: 25 },
  { nick: 'Dear_Girl', gender: 'F', city: 'Rawalpindi', age: 23 },
  { nick: 'Sania_Sweet', gender: 'F', city: 'Faisalabad', age: 21 },
  { nick: 'Amna_Rwp', gender: 'F', city: 'Rawalpindi', age: 24 },
  { nick: 'Anum_Isb', gender: 'F', city: 'Islamabad', age: 27 },
  { nick: 'Aasif', gender: 'M', city: 'Peshawar', age: 29 },
  { nick: 'AdeelISL', gender: 'M', city: 'Islamabad', age: 28 },
  { nick: 'ArslanButt', gender: 'M', city: 'Lahore', age: 26 },
  { nick: 'Waheed_ISL', gender: 'M', city: 'Islamabad', age: 31 },
  { nick: 'Hamza_Khi', gender: 'M', city: 'Karachi', age: 25 }
];

const virtualUserSockets = new Map();

VIRTUAL_USERS.forEach((vu, index) => {
  const sId = `virtual_user_id_${index}_${vu.nick.toLowerCase()}`;
  users.set(sId, {
    socketId: sId,
    nick: vu.nick,
    ip: `192.168.1.${10 + index}`,
    identified: true,
    global_role: 'user',
    is_oper: false,
    is_admin: false,
    vhost: `${vu.city.toLowerCase()}.paki.chat`,
    ident: vu.nick.toLowerCase(),
    realname: `${vu.nick} (${vu.gender}, ${vu.city})`,
    channels: new Set(),
    user_agent: 'MibbitWeb/1.0',
    identify_timer: null
  });
  virtualUserSockets.set(vu.nick.toLowerCase(), sId);
});

const DEFAULT_MAIN_CHANNEL = '#FunnyPaki';
const mainChanUsers = new Set([BOT_SOCKET_ID, ...Array.from(virtualUserSockets.values())]);

const mainChanObj = {
  name: DEFAULT_MAIN_CHANNEL,
  topic: `Welcome to ${DEFAULT_MAIN_CHANNEL}! Official Paki Chat Room | AI Bot: @Pappu`,
  users: mainChanUsers,
  owners: new Set(),
  admins: new Set(),
  ops: new Set([BOT_SOCKET_ID]),
  halfops: new Set(),
  voices: new Set(),
  modes: { r: false, i: false, m: false, k: '', f: { enabled: true, lines: 10, seconds: 5 } },
  invites: new Set()
};
channels.set(DEFAULT_MAIN_CHANNEL.toLowerCase(), mainChanObj);

function normChan(ch) {
  if (!ch) return DEFAULT_MAIN_CHANNEL.toLowerCase();
  ch = ch.trim();
  if (!ch.startsWith('#')) ch = '#' + ch;
  return ch.toLowerCase();
}

function getChannel(chName) {
  const norm = normChan(chName);
  return channels.get(norm) || null;
}

// User rank calculator with HalfOp % support
function getUserRankInChannel(socketId, channelObj) {
  const u = users.get(socketId);
  if (!u) return { rank: 0, prefix: '', roleName: 'User' };

  if (socketId === BOT_SOCKET_ID) {
    return { rank: 3, prefix: '@', roleName: 'AI Bot' };
  }

  if (channelObj.owners.has(socketId) || u.global_role === 'owner' || u.is_oper) {
    return { rank: 5, prefix: '~', roleName: 'Owner' };
  }
  if (channelObj.admins.has(socketId) || u.global_role === 'admin') {
    return { rank: 4, prefix: '&', roleName: 'Admin' };
  }
  if (channelObj.ops.has(socketId)) {
    return { rank: 3, prefix: '@', roleName: 'Operator' };
  }
  if (channelObj.halfops.has(socketId)) {
    return { rank: 2, prefix: '%', roleName: 'Half-Op' };
  }
  if (channelObj.voices.has(socketId) || db.isRegistered(u.nick)) {
    return { rank: 1, prefix: '+', roleName: 'Voice' };
  }
  return { rank: 0, prefix: '', roleName: 'Guest' };
}

function checkAndGrantPersistentRank(socket, chanObj) {
  const u = users.get(socket.id);
  if (!u || !u.identified) return;

  const savedRole = db.getUserChannelRole(chanObj.name, u.nick);
  if (savedRole) {
    if (savedRole === 'owner') chanObj.owners.add(socket.id);
    else if (savedRole === 'admin') chanObj.admins.add(socket.id);
    else if (savedRole === 'op') chanObj.ops.add(socket.id);
    else if (savedRole === 'halfop') chanObj.halfops.add(socket.id);
    else if (savedRole === 'voice') chanObj.voices.add(socket.id);
  }
}

function broadcastChannelUserList(chName) {
  const norm = normChan(chName);
  const chanObj = channels.get(norm);
  if (!chanObj) return;

  const userList = Array.from(chanObj.users).map(sId => {
    const u = users.get(sId);
    if (!u) return null;
    const rankInfo = getUserRankInChannel(sId, chanObj);
    const isReg = db.isRegistered(u.nick);
    return {
      socketId: sId,
      nick: u.nick,
      ip: u.ip,
      rank: rankInfo.rank,
      prefix: rankInfo.prefix,
      roleName: rankInfo.roleName,
      isRegistered: isReg,
      identified: u.identified
    };
  }).filter(Boolean);

  userList.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return a.nick.localeCompare(b.nick);
  });

  const modeString = getModeString(chanObj.modes);

  io.to(chanObj.name).emit('channel_user_list', {
    channel: chanObj.name,
    topic: chanObj.topic,
    modes: modeString,
    users: userList
  });
}

function getModeString(modes) {
  let str = '+';
  if (modes.r) str += 'r';
  if (modes.i) str += 'i';
  if (modes.m) str += 'm';
  if (modes.k) str += 'k';
  if (modes.f && modes.f.enabled) str += `f [${modes.f.lines}:${modes.f.seconds}]`;
  return str === '+' ? '' : str;
}

function getClientIP(socket) {
  let ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  if (ip.includes('::ffff:')) {
    ip = ip.split('::ffff:')[1];
  }
  if (ip === '::1' || ip === '127.0.0.1') {
    ip = '127.0.0.1';
  }
  return ip;
}

function generateGuestNick() {
  let num;
  let nick;
  do {
    num = Math.floor(1000 + Math.random() * 9000);
    nick = `Guest_${num}`;
  } while (Array.from(users.values()).some(u => u.nick.toLowerCase() === nick.toLowerCase()));
  return nick;
}

function startNickIdentifyTimer(socket, registeredNick) {
  const u = users.get(socket.id);
  if (!u) return;

  if (u.identify_timer) clearTimeout(u.identify_timer);

  socket.emit('system_notice', {
    type: 'warning',
    message: `*** '${registeredNick}' is a REGISTERED nick! You have 30 SECONDS to identify using /identify <password> or you will be renamed to Guest.`
  });

  u.identify_timer = setTimeout(() => {
    const current = users.get(socket.id);
    if (current && !current.identified && current.nick.toLowerCase() === registeredNick.toLowerCase()) {
      const guestNick = generateGuestNick();
      const oldNick = current.nick;
      current.nick = guestNick;

      socket.emit('system_notice', {
        type: 'error',
        message: `*** Time expired (30s)! You failed to identify for registered nick '${oldNick}'. Renamed to '${guestNick}'.`
      });

      notifyNickUpdatedAcrossChannels(socket, oldNick, guestNick);
    }
  }, 30000);
}

// Duration Parser Helper: "10s", "30s", "10m", "1h", "1d" -> milliseconds
function parseDuration(str) {
  if (!str) return { ms: 0, text: '' };
  const match = str.trim().match(/^(\d+)([smhd])?$/i);
  if (!match) return { ms: 0, text: '' };

  const num = parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();

  let ms = 0;
  switch (unit) {
    case 's': ms = num * 1000; break;
    case 'm': ms = num * 60 * 1000; break;
    case 'h': ms = num * 60 * 60 * 1000; break;
    case 'd': ms = num * 24 * 60 * 60 * 1000; break;
    default: ms = num * 1000;
  }
  return { ms: ms, text: `${num}${unit}` };
}

// --- PAPPU AI CHAT BOT ENGINE ---

const recentPappuResponses = [];

function pickNonRepetitiveResponse(options) {
  if (!options || options.length === 0) return '';
  const filtered = options.filter(opt => !recentPappuResponses.includes(opt));
  const pool = filtered.length > 0 ? filtered : options;
  const picked = pool[Math.floor(Math.random() * pool.length)];

  recentPappuResponses.push(picked);
  if (recentPappuResponses.length > 20) {
    recentPappuResponses.shift();
  }
  return picked;
}

const WELCOME_TEMPLATES = [
  "Aoa @{NICK}! Welcome to {CHANNEL} chat room! 👋 Kaise ho aap?",
  "Walaikum Assalam & Welcome @{NICK} to {CHANNEL}! Enjoy your stay here 😊",
  "Heyy @{NICK}! Khush-Aamdeed {CHANNEL} me 🎉 Chill karo aur sab se dosti karo!",
  "AOA @{NICK}! Welcome bro! Koi bhi help chahiye ho toh mujhe tag kar lena (@Pappu) 👍",
  "Welcome @{NICK}! #FunnyPaki me aap ka swaggat hai 🎈",
  "Assalam-o-Alaikum @{NICK}! Welcome to the coolest Pakistani chat room! 🔥"
];

function sendPappuWelcomeMessage(targetNick, channelName) {
  setTimeout(() => {
    const template = pickNonRepetitiveResponse(WELCOME_TEMPLATES);
    const msg = template.replace('{NICK}', targetNick).replace('{CHANNEL}', channelName);

    io.to(channelName).emit('chat_message', {
      channel: channelName,
      nick: BOT_NICK,
      prefix: '@',
      roleName: 'AI Bot',
      message: msg,
      timestamp: new Date().toLocaleTimeString()
    });
  }, 800);
}

const PAPPU_DICTIONARY = {
  greetings: [
    "Walaikum Assalam @{NICK}! Kaise ho aap? Kya haal chaal hain?",
    "Aoa @{NICK}! Pappu hazir hai, bolo jani kya scene hai?",
    "Walaikum Assalam @{NICK}! Welcome bro, kya chal raha hai aaj kal?",
    "AOA @{NICK}! Kaha thay itne din? Aaj wapas room me aane ka mood bana?",
    "Walaikum Assalam jani! Dil khush ho gaya aap ko dekh kar @{NICK}! ❤️"
  ],
  status: [
    "Alhamdulillah @{NICK} bhai, bilkul fit fat! Aap batao aap kaise ho?",
    "Main mast hoon @{NICK}! Bas room me sab doston se chat chal rahi hai 😊",
    "Alhamdulillah 100% ok! Tum sunao kya chal raha hai life me?",
    "Bas jani thoda thak gaya hoon lekin aap se baat karke fresh ho gaya! 😃",
    "Zabardast yaar @{NICK}! Aap sunao, koi nayi taza khabar?"
  ],
  food: [
    "Maza aa gaya! Karachi ki Spicy Biryani aur sath me cold drink boht pasand hai mujhe @{NICK}! 🍛🥤",
    "Yaar @{NICK}, Lahore ki Siri Paye aur Garam Naan mil jayein toh maza hi aa jaye!",
    "Karachi ki Biryani vs Lahore ki Karahi... Mere khayal me dono hi lajawab hain @{NICK}! 😋",
    "Chai lover hoon main bro! Ek garam cup chai mil jaye toh din ban jaye ☕",
    "Mithai me Gulab Jamun aur Barfi boht pasand hai mujhe @{NICK}!"
  ],
  cricket: [
    "Bhai Pakistan Cricket Team ka kya kehna! Jab chal jayein toh No.1, jab na chalein toh Allah hi hafiz! 🇵🇰🏏",
    "Babar Azam ki cover drive dekh kar maza aa jata hai @{NICK}!",
    "Shaheen Afridi ki pehli over ki inswinger pe wicket... WOHOOOO! 🔥",
    "IPL vs PSL? PSL is absolute real fast bowling action @{NICK}!"
  ],
  jokes: [
    "Hahaha suno phir @{NICK}: Teacher: Pappu tum late kyu aaye? Pappu: Sir Mummy Papa ki larai ho rahi thi! Teacher: Kiu? Pappu: Sir mera aik joota mummy k haath me tha aur doosra papa k haath me! 🤣",
    "Ek aur suno @{NICK}: Pappu dukandar se: Bhai mobile ka cover hai? Dukandar: Konse model ka? Pappu: Nokia 3310! Dukandar: Bhai usko cover nahi, bulletproof jacket chahiye! 😂",
    "Doctor: Pappu tumhara wazan 10kg barh gaya hai! Pappu: Doctor saab woh kal main ne double roti khaye thi! Doctor: Double roti se 10kg? Pappu: Haan doctor saab wrapper samait khaye thi! 😜",
    "Pappu Pappi se: Tum mujhe kitna pyar karti ho? Pappi: Shahjahan jitna! Pappu: Toh phir Taj Mahal banwaon? Pappi: Pehle maro toh sahi! Hahaha 🤣🤣"
  ],
  shayari: [
    "Suno shayari @{NICK}: 'Pani me aks apna dekh kar muskura diye... Hum ne tumhare baad bhi jeena seekh liya!' ✨",
    "Ek aur sher @{NICK}: 'Hazaaron khwahishein aisi ke har khwahish pe dam nikle... Boht nikle mere armaan lekin phir bhi kam nikle!' 📜",
    "Wahat @{NICK}: 'Chandni raat me taare chamakte hain... Jab hum chat par aate hain toh dost mehakte hain!' 🌟"
  ],
  owner: [
    "Is channel ({CHANNEL}) ka Founder / Owner **PrinCe** bhai hain! Aur main Pappu is room ka AI Bot hoon 🤖",
    "Room lead PrinCe bhai kar rahe hain, aur Ops/Admins sab room ki dekh bhal karte hain @{NICK}!"
  ],
  love: [
    "Aww thank you so much @{NICK}! Aap bhi boht pyare aur zabardast insaan ho bro! ❤️",
    "Love you too jani! Aap jaise doston ki wajah se hi room me rounaq hai @{NICK}! 🤗",
    "Boht shukriya @{NICK}! Aap hamesha muskurate raho!"
  ],
  slang: [
    "Chill karo jani! Koi tension nahi leni @{NICK} 😎",
    "Ohohh zabardast scene hai phir toh @{NICK}! 🔥",
    "Kya baat hai aap ki @{NICK}! Full hero mood me ho aaj!",
    "Bhai jan halka phulka mazaq chalta rehta hai room me 😂"
  ],
  help: [
    "@{NICK} IRC & ChanServ commands ke liye chat me `/help` likhein! `/cs register` se channel register hota hai aur `/cs aop` se ops add hotay hain.",
    "Bhai koi masla ho toh `/help` daba kar check kar lo ya Admin/Ops ko msg karo!"
  ],
  fallback: [
    "Sahi baat hai @{NICK}! Aur batao kya chal raha hai aaj kal?",
    "Ji bilkul @{NICK}! Pappu aap ki baat se 100% agree karta hai 👍",
    "Hahaha sach me @{NICK}? Zabardast yaar!",
    "Achaa @{NICK}! Aur sunao baqi sab khairiyat hai na?",
    "Aap ki yeh baat boht pasand aayi mujhe @{NICK}! 👌",
    "Wah yaar @{NICK}! Kya baat kar di aap ne!"
  ]
};

function generatePappuAIResponse(senderNick, userMessage, channelName) {
  const text = (userMessage || '').toLowerCase();

  if (text.includes('learn:') || text.includes('seekho:') || text.includes('teach:')) {
    let cleanText = userMessage.replace(/@?Pappu/gi, '').replace(/learn:/gi, '').replace(/seekho:/gi, '').replace(/teach:/gi, '').trim();
    if (cleanText.includes('=')) {
      const parts = cleanText.split('=');
      const trigger = parts[0].trim();
      const response = parts.slice(1).join('=').trim();
      if (trigger && response) {
        db.learnPappuFact(trigger, response, senderNick);
        return `@${senderNick} Wahh zabardast! Main ne seekh liya: Jab koi **"${trigger}"** poochega toh main bolunga **"${response}"**! 🧠⚡`;
      }
    }
  }

  const learnedFact = db.getPappuLearnedFact(text);
  if (learnedFact) {
    return `@${senderNick} ${learnedFact}`;
  }

  let categoryPool = PAPPU_DICTIONARY.fallback;

  if (text.includes('aoa') || text.includes('assalam') || text.includes('salam') || text.includes('hi') || text.includes('hello') || text.includes('hey')) {
    categoryPool = PAPPU_DICTIONARY.greetings;
  } else if (text.includes('kaise') || text.includes('kaisa') || text.includes('kya haal') || text.includes('kaisi') || text.includes('kya scene')) {
    categoryPool = PAPPU_DICTIONARY.status;
  } else if (text.includes('khana') || text.includes('biryani') || text.includes('food') || text.includes('chai') || text.includes('khao') || text.includes('bhook')) {
    categoryPool = PAPPU_DICTIONARY.food;
  } else if (text.includes('cricket') || text.includes('match') || text.includes('psl') || text.includes('babar') || text.includes('shaheen')) {
    categoryPool = PAPPU_DICTIONARY.cricket;
  } else if (text.includes('joke') || text.includes('funny') || text.includes('latifa') || text.includes('latafa') || text.includes('haso')) {
    categoryPool = PAPPU_DICTIONARY.jokes;
  } else if (text.includes('song') || text.includes('gaana') || text.includes('music') || text.includes('sing') || text.includes('poetry') || text.includes('sher') || text.includes('shayari')) {
    categoryPool = text.includes('sher') || text.includes('shayari') ? PAPPU_DICTIONARY.shayari : [ "Dil Dil Pakistan, Jan Jan Pakistan! 🇵🇰🎶 Hamesha zindabad! Aur batao kaunsa gaana pasand hai @" + senderNick + "?" ];
  } else if (text.includes('owner') || text.includes('admin') || text.includes('malik') || text.includes('boss')) {
    categoryPool = PAPPU_DICTIONARY.owner;
  } else if (text.includes('love') || text.includes('pyar') || text.includes('nice') || text.includes('good') || text.includes('sweet') || text.includes('thanks')) {
    categoryPool = PAPPU_DICTIONARY.love;
  } else if (text.includes('help') || text.includes('command') || text.includes('rule')) {
    categoryPool = PAPPU_DICTIONARY.help;
  }

  const rawChoice = pickNonRepetitiveResponse(categoryPool);
  return rawChoice.replace('{NICK}', senderNick).replace('{CHANNEL}', channelName);
}

function handlePappuAIResponse(socket, channelName, userMessage) {
  const u = users.get(socket.id);
  if (!u) return;

  const textLower = userMessage.toLowerCase();
  const isTagged = textLower.includes('pappu') || textLower.includes('@pappu') || textLower.includes('papu');

  if (isTagged) {
    const delay = 600 + Math.floor(Math.random() * 600);
    setTimeout(() => {
      const reply = generatePappuAIResponse(u.nick, userMessage, channelName);
      io.to(channelName).emit('chat_message', {
        channel: channelName,
        nick: BOT_NICK,
        prefix: '@',
        roleName: 'AI Bot',
        message: reply,
        timestamp: new Date().toLocaleTimeString()
      });
    }, delay);
  }
}

// --- SUBTLE OCCASIONAL MAIN CHAT ENGINE & VIRTUAL PM RESPONDER ---

const SUBTLE_MAIN_MESSAGES = [
  "Aoa g sab ko 👋",
  "Walaikum Assalam 😊",
  "Karachi me aaj garmi boht zyada hai ☀️",
  "Lahore ka mausam aaj mazaidar hai 🌧️",
  "Kaun kaun online hai yahan?",
  "Chai ka time ho gaya! ☕",
  "Hahaha lol 🤣",
  "Sahi baat hai 👍",
  "Aaj PSL ka match kaun jeete ga?",
  "Khush raho sab dosto! ✨",
  "Arooba: Haan ji bilkul!",
  "Ayesha_Lhr: Sahi kaha aap ne!"
];

function startSubtleVirtualChatter() {
  setInterval(() => {
    const randomUserObj = VIRTUAL_USERS[Math.floor(Math.random() * VIRTUAL_USERS.length)];
    const randomMsg = SUBTLE_MAIN_MESSAGES[Math.floor(Math.random() * SUBTLE_MAIN_MESSAGES.length)];

    io.to(DEFAULT_MAIN_CHANNEL).emit('chat_message', {
      channel: DEFAULT_MAIN_CHANNEL,
      nick: randomUserObj.nick,
      prefix: '+',
      roleName: 'Voice',
      message: randomMsg,
      timestamp: new Date().toLocaleTimeString()
    });
  }, 90000 + Math.floor(Math.random() * 60000));
}

startSubtleVirtualChatter();

function handleVirtualUserPMResponse(socket, targetNick, message) {
  const targetObj = VIRTUAL_USERS.find(vu => vu.nick.toLowerCase() === targetNick.toLowerCase());
  if (!targetObj) return;

  const u = users.get(socket.id);
  if (!u) return;

  const textLower = message.toLowerCase();
  let reply = '';

  if (textLower.includes('aoa') || textLower.includes('salam') || textLower.includes('hi') || textLower.includes('hello') || textLower.includes('hey')) {
    if (targetObj.gender === 'F') {
      reply = `Walaikum Assalam! Aoa ${u.nick}, main ${targetObj.city} se hoon, aap batao kaise ho? 😊`;
    } else {
      reply = `Walaikum Assalam brother! Aoa, main ${targetObj.city} se ${targetObj.nick} baat kar rha hoon. Sunao kya haal hain?`;
    }
  } else if (textLower.includes('kaise') || textLower.includes('kya haal') || textLower.includes('kaisi')) {
    reply = `Alhamdulillah bilkul thik thak hoon! Aap sunao aap ka kya scene hai?`;
  } else if (textLower.includes('kaha') || textLower.includes('city') || textLower.includes('rehte')) {
    reply = `Main ${targetObj.city} se hoon, aap konse shahar se ho?`;
  } else if (textLower.includes('age') || textLower.includes('umar')) {
    reply = `Meri age ${targetObj.age} hai! Aap ki kitni hai?`;
  } else if (textLower.includes('name') || textLower.includes('naam')) {
    reply = `Mera naam ${targetObj.nick} hai 😊`;
  } else {
    const pmReplies = [
      `Achaa sahi! Aur sunao baqi sab khairiyat?`,
      `Zabardast! Main abhi free hui hoon chat karne k liye 😊`,
      `Hmm sahi baat hai, aap ki hobbies kya hain?`,
      `Ji bilkul! Room me kafi acche log hain na?`
    ];
    reply = pmReplies[Math.floor(Math.random() * pmReplies.length)];
  }

  setTimeout(() => {
    socket.emit('private_message', {
      from: targetObj.nick,
      to: u.nick,
      message: reply,
      timestamp: new Date().toLocaleTimeString()
    });
  }, 1000 + Math.floor(Math.random() * 1000));
}

// Socket Connection Events

io.on('connection', (socket) => {
  const clientIP = getClientIP(socket);
  const userAgent = socket.handshake.headers['user-agent'] || '';

  if (db.isIPBanned(clientIP)) {
    socket.emit('banned', { reason: 'Your IP address has been banned from this server.' });
    socket.disconnect(true);
    return;
  }

  let initialNick = generateGuestNick();

  users.set(socket.id, {
    socketId: socket.id,
    nick: initialNick,
    ip: clientIP,
    identified: false,
    global_role: 'user',
    is_oper: false,
    is_admin: false,
    vhost: '',
    ident: 'guest',
    realname: 'PakiChat Guest User',
    channels: new Set(),
    user_agent: userAgent,
    connectedAt: Date.now(),
    lastActive: Date.now(),
    identify_timer: null
  });

  db.logUserIP(initialNick, clientIP, userAgent);

  socket.emit('system_notice', {
    type: 'welcome',
    message: `*** Welcome to #FunnyPaki Chat Room Server! IP: ${clientIP}`
  });
  socket.emit('system_notice', {
    type: 'info',
    message: `*** Connected as '${initialNick}'. Type /help for commands. Welcome to #FunnyPaki!`
  });
  socket.emit('user_init', {
    nick: initialNick,
    ip: clientIP,
    channels: Array.from(channels.values()).map(c => c.name)
  });

  joinChannel(socket, DEFAULT_MAIN_CHANNEL);

  socket.on('set_device_id', ({ deviceId }) => {
    if (!deviceId) return;
    socket.deviceId = deviceId;
    const u = users.get(socket.id);
    if (u) {
      u.deviceId = deviceId;
      db.logUserIP(u.nick, u.ip, socket.handshake.headers['user-agent'] || '', deviceId);
    }
    if (db.isDeviceBanned(deviceId)) {
      socket.emit('you_were_banned', {
        channel: DEFAULT_MAIN_CHANNEL,
        bannedBy: 'Operator',
        reason: `Your Physical Device [${deviceId}] is BANNED from #FunnyPaki!`
      });
      socket.disconnect(true);
    }
  });

  socket.on('change_nick', async ({ newNick, deviceId }) => {
    if (deviceId) {
      socket.deviceId = deviceId;
      const u = users.get(socket.id);
      if (u) u.deviceId = deviceId;
    }
    handleNickChange(socket, newNick);
  });

  socket.on('register', async ({ nick, password }) => {
    const res = await db.registerNick(nick || users.get(socket.id).nick, password);
    if (res.success) {
      const u = users.get(socket.id);
      u.identified = true;
      u.nick = nick || u.nick;
      if (u.identify_timer) clearTimeout(u.identify_timer);

      socket.emit('system_notice', { type: 'success', message: res.message });
      notifyNickUpdatedAcrossChannels(socket);
    } else {
      socket.emit('system_notice', { type: 'error', message: res.message });
    }
  });

  socket.on('identify', async ({ nick, password }) => {
    const u = users.get(socket.id);
    const targetNick = nick || u.nick;
    const res = await db.verifyNick(targetNick, password);
    if (res.success) {
      u.nick = res.user.nick;
      u.identified = true;
      u.global_role = res.user.global_role || (res.user.is_admin ? 'admin' : 'user');
      u.is_admin = u.global_role === 'admin' || u.global_role === 'owner' || u.global_role === 'oper';
      u.is_oper = u.global_role === 'oper' || u.global_role === 'owner';
      u.vhost = res.user.vhost || '';
      u.ident = res.user.ident || 'user';
      u.realname = res.user.realname || 'PakiChat User';

      if (u.identify_timer) clearTimeout(u.identify_timer);
      db.logUserIP(u.nick, u.ip, u.user_agent);

      socket.emit('system_notice', { type: 'success', message: `*** Identified successfully as '${u.nick}'` });

      u.channels.forEach(chName => {
        const chanObj = channels.get(normChan(chName));
        if (chanObj) {
          checkAndGrantPersistentRank(socket, chanObj);
          broadcastChannelUserList(chanObj.name);
        }
      });

      notifyNickUpdatedAcrossChannels(socket);
    } else {
      socket.emit('system_notice', { type: 'error', message: res.message });
    }
  });

  socket.on('join_channel', ({ channel, key }) => {
    joinChannel(socket, channel, key);
  });

  socket.on('part_channel', ({ channel }) => {
    partChannel(socket, channel);
  });

  socket.on('chanserv_command', async ({ command, args }) => {
    handleChanServCommand(socket, command, args);
  });

  socket.on('unreal_command', async ({ command, args }) => {
    handleUnrealCommand(socket, command, args);
  });

  socket.on('register_channel', async ({ channel, password, description }) => {
    const u = users.get(socket.id);
    if (!u) return;

    u.lastActive = Date.now();
    const res = await db.registerChannel(channel, u.nick, password, description);
    if (res.success) {
      socket.emit('system_notice', { type: 'success', message: `*** [ChanServ] ${res.message}` });
      const chanObj = channels.get(normChan(channel));
      if (chanObj) {
        checkAndGrantPersistentRank(socket, chanObj);
        broadcastChannelUserList(chanObj.name);
      }
    } else {
      socket.emit('system_notice', { type: 'error', message: `*** [ChanServ] ${res.message}` });
    }
  });

  socket.on('manage_access', ({ channel, action, nick, role }) => {
    handleManageAccess(socket, channel, action, nick, role);
  });

  socket.on('set_channel_mode', ({ channel, modeString, keyArg }) => {
    handleSetChannelMode(socket, channel, modeString, keyArg);
  });

  socket.on('invite_user', ({ targetNick, channel }) => {
    handleInviteUser(socket, targetNick, channel);
  });

  socket.on('send_message', (data) => {
    const u = users.get(socket.id);
    if (!u || !data) return;
    const target = data.target || data.channel || DEFAULT_MAIN_CHANNEL;
    let message = data.message;
    const textColor = data.textColor;
    const bgColor = data.bgColor;
    if (!message || !message.trim()) return;
    message = message.trim();

    if (db.isNickBanned(u.nick) || db.isIPBanned(u.ip)) {
      socket.emit('system_notice', { type: 'error', message: '*** You are banned from sending messages.' });
      return;
    }

    // Real-Time Anti-Spam / Forbidden Word Filter Engine
    const spamMatch = db.checkSpamMatch(message);
    if (spamMatch && !u.is_oper && !u.is_admin && u.global_role !== 'owner') {
      const act = spamMatch.action;
      const word = spamMatch.word;

      if (act === 'block') {
        socket.emit('system_notice', {
          type: 'error',
          message: `*** Message blocked: Contains forbidden word/phrase '${word}'.`
        });
        return;
      }

      if (act === 'kick') {
        socket.emit('you_were_kicked', {
          channel: target.startsWith('#') ? target : DEFAULT_MAIN_CHANNEL,
          kickedBy: 'Auto-Filter',
          reason: `Forbidden word detected: '${word}'`
        });
        if (target.startsWith('#')) {
          const chanObj = channels.get(normChan(target));
          if (chanObj) {
            io.to(chanObj.name).emit('system_notice', {
              type: 'warning',
              message: `*** ${u.nick} was kicked by Auto-Filter (Forbidden word: '${word}')`
            });
            partChannel(socket, chanObj.name);
          }
        }
        return;
      }

      if (act === 'ban') {
        db.banIP(u.ip, `Auto-Filter: Forbidden word '${word}'`, 'Auto-Filter');
        db.banNick(u.nick, `Auto-Filter: Forbidden word '${word}'`, 'Auto-Filter');

        socket.emit('you_were_banned', {
          channel: target.startsWith('#') ? target : DEFAULT_MAIN_CHANNEL,
          bannedBy: 'Auto-Filter',
          reason: `Forbidden word detected: '${word}'`
        });

        if (target.startsWith('#')) {
          const chanObj = channels.get(normChan(target));
          if (chanObj) {
            io.to(chanObj.name).emit('system_notice', {
              type: 'error',
              message: `*** [BAN] ${u.nick} was BANNED by Auto-Filter (Forbidden word: '${word}')`
            });
            setTimeout(() => {
              partChannel(socket, chanObj.name);
            }, 3000);
          }
        }
        return;
      }

      if (act === 'shun') {
        db.shunUser(u.nick, `Auto-Filter: '${word}'`, 'Auto-Filter', 600000); // 10m
        socket.emit('system_notice', {
          type: 'warning',
          message: `*** [SHUN] You have been stealth shunned for 10 minutes (Forbidden word: '${word}').`
        });
        socket.emit('chat_message', {
          channel: target,
          nick: u.nick,
          prefix: '',
          roleName: 'User',
          message: message,
          timestamp: new Date().toLocaleTimeString()
        });
        return;
      }
    }

    // Track word count stats for top chatters (excluding bots)
    const wordsCount = message.trim().split(/\s+/).filter(Boolean).length;
    if (wordsCount > 0) {
      db.trackWords(u.nick, wordsCount);
    }

    // Dynamic Channel Anti-Flood Engine (+f mode)
    if (target.startsWith('#')) {
      const norm = normChan(target);
      const chanObj = channels.get(norm);
      if (chanObj && chanObj.modes.f && chanObj.modes.f.enabled) {
        const isStaff = getUserRankInChannel(socket.id, chanObj).rank >= 2 || u.is_oper || u.is_admin || u.global_role === 'owner';

        if (!isStaff) {
          const fLimit = chanObj.modes.f;
          const limitMs = fLimit.seconds * 1000;
          const now = Date.now();

          if (!u.msgTimestamps) u.msgTimestamps = [];
          u.msgTimestamps = u.msgTimestamps.filter(t => (now - t) <= limitMs);
          u.msgTimestamps.push(now);

          if (u.msgTimestamps.length >= fLimit.lines) {
            const floodReason = `Channel flood triggered: ${fLimit.lines} lines in ${fLimit.seconds}s`;
            socket.emit('you_were_kicked', {
              channel: chanObj.name,
              kickedBy: 'Flood-Guard',
              reason: floodReason
            });

            io.to(chanObj.name).emit('system_notice', {
              type: 'warning',
              message: `*** ${u.nick} was kicked by Flood-Guard (${floodReason})`
            });

            partChannel(socket, chanObj.name);
            return;
          }
        }
      }
    }

    if (message.startsWith('.') || message.startsWith('!') || message.startsWith('!seen') || message.startsWith('!SEEN')) {
      const handled = handleDotCommand(socket, target.startsWith('#') ? target : DEFAULT_MAIN_CHANNEL, message);
      if (handled) return;
    }

    const isUserShunned = db.isShunned(u.nick, u.ip);

    if (target.startsWith('#')) {
      const norm = normChan(target);
      const chanObj = channels.get(norm);
      if (!chanObj || !chanObj.users.has(socket.id)) {
        socket.emit('system_notice', { type: 'error', message: `*** You are not in ${target}` });
        return;
      }

      const rankInfo = getUserRankInChannel(socket.id, chanObj);

      if (isUserShunned) {
        socket.emit('chat_message', {
          channel: chanObj.name,
          nick: u.nick,
          prefix: rankInfo.prefix,
          roleName: rankInfo.roleName,
          message: message,
          textColor: textColor || null,
          bgColor: bgColor || null,
          timestamp: new Date().toLocaleTimeString()
        });
        return;
      }

      if (chanObj.modes.m && rankInfo.rank < 1) {
        socket.emit('system_notice', {
          type: 'error',
          message: `*** Cannot send message: ${chanObj.name} is moderated (+m). You need Voice (+) rank or higher.`
        });
        return;
      }

      db.logChat(chanObj.name, u.nick, u.ip, message);

      io.to(chanObj.name).emit('chat_message', {
        channel: chanObj.name,
        nick: u.nick,
        prefix: rankInfo.prefix,
        roleName: rankInfo.roleName,
        message: message,
        textColor: textColor || null,
        bgColor: bgColor || null,
        timestamp: new Date().toLocaleTimeString()
      });

      handlePappuAIResponse(socket, chanObj.name, message);

    } else {
      const targetUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === target.toLowerCase());

      if (isUserShunned) {
        socket.emit('private_message', {
          from: u.nick,
          to: target || 'User',
          message: message,
          textColor: textColor || null,
          bgColor: bgColor || null,
          timestamp: new Date().toLocaleTimeString()
        });
        return;
      }

      if (!targetUser) {
        socket.emit('system_notice', { type: 'error', message: `*** No user online with nick '${target}'` });
        return;
      }

      const pmPayload = {
        from: u.nick,
        to: targetUser.nick,
        message: message,
        textColor: textColor || null,
        bgColor: bgColor || null,
        timestamp: new Date().toLocaleTimeString()
      };

      io.to(targetUser.socketId).emit('private_message', pmPayload);
      socket.emit('private_message', pmPayload);

      if (target.toLowerCase() === BOT_NICK.toLowerCase()) {
        setTimeout(() => {
          const reply = generatePappuAIResponse(u.nick, message, DEFAULT_MAIN_CHANNEL);
          const botPmPayload = {
            from: BOT_NICK,
            to: u.nick,
            message: reply,
            timestamp: new Date().toLocaleTimeString()
          };
          socket.emit('private_message', botPmPayload);
        }, 800);
      }

      handleVirtualUserPMResponse(socket, target, message);
    }
  });

  socket.on('send_action', ({ target, action }) => {
    const u = users.get(socket.id);
    if (!u || !action) return;

    if (db.isShunned(u.nick, u.ip)) {
      return;
    }

    if (target.startsWith('#')) {
      const norm = normChan(target);
      const chanObj = channels.get(norm);
      if (chanObj && chanObj.users.has(socket.id)) {
        io.to(chanObj.name).emit('chat_action', {
          channel: chanObj.name,
          nick: u.nick,
          action: action,
          timestamp: new Date().toLocaleTimeString()
        });
      }
    }
  });

  socket.on('set_role', ({ channel, targetNick, role, active }) => {
    handleSetRole(socket, channel, targetNick, role, active);
  });

  socket.on('kick_user', ({ channel, targetNick, reason }) => {
    handleKick(socket, channel, targetNick, reason);
  });

  socket.on('ban_user', ({ targetNick, banType, reason }) => {
    handleBan(socket, targetNick, banType, reason);
  });

  socket.on('unban_user', ({ target, banType }) => {
    handleUnban(socket, target, banType);
  });

  socket.on('set_topic', ({ channel, topic }) => {
    const norm = normChan(channel);
    const chanObj = channels.get(norm);
    if (!chanObj) return;

    const rankInfo = getUserRankInChannel(socket.id, chanObj);
    if (rankInfo.rank < 3) {
      socket.emit('system_notice', { type: 'error', message: '*** You need Operator (@) or higher rank to set channel topic.' });
      return;
    }

    chanObj.topic = topic;
    const u = users.get(socket.id);
    io.to(chanObj.name).emit('topic_changed', {
      channel: chanObj.name,
      topic: topic,
      setBy: u.nick
    });
    broadcastChannelUserList(chanObj.name);
  });

  socket.on('get_admin_data', () => {
    const u = users.get(socket.id);
    if (u && (u.is_admin || u.is_oper || u.global_role === 'owner')) {
      const data = db.getAdminData();
      data.online_users = Array.from(users.values()).map(usr => ({
        nick: usr.nick,
        ip: usr.ip,
        identified: usr.identified,
        global_role: usr.global_role,
        is_oper: usr.is_oper,
        channels: Array.from(usr.channels)
      }));
      socket.emit('admin_data_res', data);
    } else {
      socket.emit('system_notice', { type: 'error', message: '*** Admin or Oper permission required.' });
    }
  });

  socket.on('disconnect', () => {
    const u = users.get(socket.id);
    if (u) {
      if (u.identify_timer) clearTimeout(u.identify_timer);
      u.channels.forEach(chName => {
        const chanObj = channels.get(normChan(chName));
        if (chanObj) {
          chanObj.users.delete(socket.id);
          chanObj.owners.delete(socket.id);
          chanObj.admins.delete(socket.id);
          chanObj.ops.delete(socket.id);
          chanObj.halfops.delete(socket.id);
          chanObj.voices.delete(socket.id);

          io.to(chanObj.name).emit('user_part', {
            channel: chanObj.name,
            nick: u.nick,
            reason: 'Quit'
          });
          broadcastChannelUserList(chanObj.name);
        }
      });
      users.delete(socket.id);
    }
  });
});

// Helper Core Functions

function joinChannel(socket, channelName, keyArg = '') {
  const u = users.get(socket.id);
  if (!u) return;

  const norm = normChan(channelName);
  let chanObj = channels.get(norm);

  if (!chanObj) {
    const canCreate = u.global_role === 'owner' || u.global_role === 'admin' || u.is_admin || u.is_oper;
    if (!canCreate) {
      socket.emit('system_notice', {
        type: 'error',
        message: `*** Access Denied: Only Channel Owners or Server Admins can create new channels.`
      });
      return;
    }
    const displayName = channelName.startsWith('#') ? channelName : '#' + channelName;
    chanObj = {
      name: displayName,
      topic: `Topic for ${displayName}`,
      users: new Set([BOT_SOCKET_ID, ...Array.from(virtualUserSockets.values())]),
      owners: new Set(),
      admins: new Set(),
      ops: new Set([BOT_SOCKET_ID]),
      halfops: new Set(),
      voices: new Set(),
      modes: { r: false, i: false, m: false, k: '' },
      invites: new Set()
    };
    channels.set(norm, chanObj);
  } else {
    chanObj.users.add(BOT_SOCKET_ID);
    chanObj.ops.add(BOT_SOCKET_ID);
    virtualUserSockets.forEach(sId => chanObj.users.add(sId));
  }

  if (chanObj.modes.r && !u.identified) {
    socket.emit('system_notice', {
      type: 'error',
      message: `*** Cannot join ${chanObj.name}: Channel mode is +r (Registered & Identified users only).`
    });
    return;
  }

  if (chanObj.modes.i && !chanObj.invites.has(socket.id) && u.global_role !== 'owner' && !u.is_admin && !u.is_oper) {
    socket.emit('system_notice', {
      type: 'error',
      message: `*** Cannot join ${chanObj.name}: Channel mode is +i (Invite-Only). You must be invited.`
    });
    return;
  }

  if (chanObj.modes.k && chanObj.modes.k !== keyArg && u.global_role !== 'owner' && !u.is_admin && !u.is_oper) {
    socket.emit('system_notice', {
      type: 'error',
      message: `*** Cannot join ${chanObj.name}: Incorrect channel key/password (+k).`
    });
    return;
  }

  if (chanObj.users.has(socket.id)) {
    socket.emit('system_notice', { type: 'info', message: `*** You are already in ${chanObj.name}` });
    return;
  }

  socket.join(chanObj.name);
  chanObj.users.add(socket.id);
  u.channels.add(chanObj.name);

  checkAndGrantPersistentRank(socket, chanObj);

  io.to(chanObj.name).emit('user_joined', {
    channel: chanObj.name,
    nick: u.nick,
    ip: u.ip
  });

  broadcastChannelUserList(chanObj.name);

  sendPappuWelcomeMessage(u.nick, chanObj.name);
}

// Official Geekshed ChanServ Command Processor (/cs)
async function handleChanServCommand(socket, subCmd, args) {
  const u = users.get(socket.id);
  if (!u) return;

  subCmd = (subCmd || '').toLowerCase();

  switch (subCmd) {
    case 'register':
      if (!args[0] || !args[1]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /cs register #channel <password> [description]' });
        return;
      }
      const regRes = await db.registerChannel(args[0], u.nick, args[1], args.slice(2).join(' ') || 'Official Channel');
      if (regRes.success) {
        socket.emit('system_notice', { type: 'success', message: `*** [ChanServ] ${regRes.message}` });
        const chanObj = channels.get(normChan(args[0]));
        if (chanObj) {
          checkAndGrantPersistentRank(socket, chanObj);
          broadcastChannelUserList(chanObj.name);
        }
      } else {
        socket.emit('system_notice', { type: 'error', message: `*** [ChanServ] ${regRes.message}` });
      }
      break;

    case 'info':
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /cs info #channel' });
        return;
      }
      const chInfo = db.getRegisteredChannel(args[0]);
      if (!chInfo) {
        socket.emit('system_notice', { type: 'error', message: `*** [ChanServ] Channel '${args[0]}' is NOT registered.` });
      } else {
        const accessList = db.getChannelAccessList(args[0]);
        socket.emit('system_notice', { type: 'info', message: `*** ========================================================` });
        socket.emit('system_notice', { type: 'info', message: `*** Information for channel ${chInfo.name}:` });
        socket.emit('system_notice', { type: 'info', message: `*** Founder      : ${chInfo.founder_nick}` });
        socket.emit('system_notice', { type: 'info', message: `*** Registered   : ${new Date(chInfo.created_at).toLocaleString()}` });
        socket.emit('system_notice', { type: 'info', message: `*** Description  : ${chInfo.description || 'N/A'}` });
        socket.emit('system_notice', { type: 'info', message: `*** Modes        : ${getModeString(chInfo.modes || {}) || 'none'}` });
        socket.emit('system_notice', { type: 'info', message: `*** Access List  : ${accessList.length} user(s) entries` });
        socket.emit('system_notice', { type: 'info', message: `*** ========================================================` });
      }
      break;

    case 'drop':
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /cs drop #channel' });
        return;
      }
      const dropRes = db.dropChannel(args[0], u.nick);
      if (dropRes.success) {
        socket.emit('system_notice', { type: 'success', message: `*** [ChanServ] ${dropRes.message}` });
      } else {
        socket.emit('system_notice', { type: 'error', message: `*** [ChanServ] ${dropRes.message}` });
      }
      break;

    case 'sop':
    case 'aop':
    case 'hop':
    case 'vop':
      const roleMap = { sop: 'admin', aop: 'op', hop: 'halfop', vop: 'voice' };
      const roleName = roleMap[subCmd];
      const chan = args[0];
      const action = (args[1] || '').toLowerCase();
      const targetNick = args[2];

      if (!chan || !action) {
        socket.emit('system_notice', { type: 'error', message: `Usage: /cs ${subCmd} #channel add|del|list [nick]` });
        return;
      }

      if (action === 'list') {
        const fullList = db.getChannelAccessList(chan);
        const filtered = fullList.filter(item => item.role === roleName);
        socket.emit('system_notice', { type: 'info', message: `*** [ChanServ] ${subCmd.toUpperCase()} list for ${chan} (${filtered.length} entries):` });
        filtered.forEach(item => {
          socket.emit('system_notice', { type: 'info', message: `*** ${item.original_nick} (Added by ${item.added_by})` });
        });
      } else if (action === 'add' && targetNick) {
        handleManageAccess(socket, chan, 'add', targetNick, roleName);
      } else if (action === 'del' && targetNick) {
        handleManageAccess(socket, chan, 'del', targetNick, roleName);
      } else {
        socket.emit('system_notice', { type: 'error', message: `Usage: /cs ${subCmd} #channel add|del|list [nick]` });
      }
      break;

    case 'access':
      const accessChan = args[0];
      const accessAct = (args[1] || '').toLowerCase();
      const accessNick = args[2];
      const accessRole = args[3] || 'op';

      if (!accessChan || !accessAct) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /cs access #channel add|del|list [nick] [role]' });
        return;
      }

      handleManageAccess(socket, accessChan, accessAct, accessNick, accessRole);
      break;

    default:
      socket.emit('system_notice', { type: 'error', message: '*** Unknown ChanServ command. Usage: /cs register | info | drop | sop | aop | hop | vop | access' });
  }
}

async function handleUnrealCommand(socket, cmd, args) {
  const u = users.get(socket.id);
  if (!u) return;

  cmd = (cmd || '').toLowerCase();

  const isOperOrAdmin = u.is_oper || u.is_admin || u.global_role === 'owner' || u.global_role === 'admin';

  switch (cmd) {
    case 'oper':
      if (!args[0] || !args[1]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /OPER <userid> <password>' });
        return;
      }
      if (args[1] === 'admin123' || args[1] === 'oper123' || args[1] === 'funnypaki') {
        u.is_oper = true;
        u.global_role = 'oper';
        u.is_admin = true;
        socket.emit('system_notice', { type: 'success', message: `*** [OPER] Authentication successful. You are now an IRC Operator (~/&).` });
        notifyNickUpdatedAcrossChannels(socket);
      } else {
        socket.emit('system_notice', { type: 'error', message: '*** [OPER] Invalid Oper password.' });
      }
      break;

    case 'wallops':
    case 'globops':
    case 'chatops':
    case 'locops':
    case 'adchat':
    case 'nachat':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: You must be an IRCop/Admin to send oper broadcasts.' });
        return;
      }
      const broadcastMsg = args.join(' ');
      if (!broadcastMsg) {
        socket.emit('system_notice', { type: 'error', message: `Usage: /${cmd.toUpperCase()} <message>` });
        return;
      }
      io.emit('system_notice', {
        type: 'warning',
        message: `*** [${cmd.toUpperCase()}] (${u.nick}): ${broadcastMsg}`
      });
      break;

    case 'sajoin':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /SAJOIN requires IRCop privileges.' });
        return;
      }
      if (!args[0] || !args[1]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /SAJOIN <nick> <#channel>' });
        return;
      }
      const saUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === args[0].toLowerCase());
      if (!saUser) {
        socket.emit('system_notice', { type: 'error', message: `*** User '${args[0]}' not found.` });
        return;
      }
      const saSocket = io.sockets.sockets.get(saUser.socketId);
      if (saSocket) {
        joinChannel(saSocket, args[1]);
        socket.emit('system_notice', { type: 'success', message: `*** [SAJOIN] Forced ${saUser.nick} to join ${args[1]}` });
      }
      break;

    case 'sapart':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /SAPART requires IRCop privileges.' });
        return;
      }
      if (!args[0] || !args[1]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /SAPART <nick> <#channel>' });
        return;
      }
      const sapUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === args[0].toLowerCase());
      if (!sapUser) {
        socket.emit('system_notice', { type: 'error', message: `*** User '${args[0]}' not found.` });
        return;
      }
      const sapSocket = io.sockets.sockets.get(sapUser.socketId);
      if (sapSocket) {
        partChannel(sapSocket, args[1]);
        socket.emit('system_notice', { type: 'success', message: `*** [SAPART] Forced ${sapUser.nick} to part ${args[1]}` });
      }
      break;

    case 'samode':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /SAMODE requires IRCop privileges.' });
        return;
      }
      if (!args[0] || !args[1]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /SAMODE <#channel> <mode>' });
        return;
      }
      handleSetChannelMode(socket, args[0], args[1], args[2] || '');
      socket.emit('system_notice', { type: 'success', message: `*** [SAMODE] Applied mode ${args[1]} to ${args[0]}` });
      break;

    case 'banlist':
      const targetChanName = args[0] || DEFAULT_MAIN_CHANNEL;
      const targetChanObj = channels.get(normChan(targetChanName));
      if (!targetChanObj) {
        socket.emit('system_notice', { type: 'error', message: `*** Channel '${targetChanName}' not found.` });
        return;
      }
      const senderRankInChan = getUserRankInChannel(socket.id, targetChanObj);
      if (senderRankInChan.rank < 3 && !isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: `*** You need Operator (@) rank or higher to view banlist for ${targetChanObj.name}.` });
        return;
      }
      const allBans = db.getBans();
      socket.emit('system_notice', { type: 'info', message: `*** [BANLIST] Active bans for ${targetChanObj.name}:` });
      let banCount = 0;
      allBans.ip_bans.forEach((b, idx) => {
        banCount++;
        socket.emit('system_notice', { type: 'info', message: `***   ${banCount}. IP: ${b.ip} (Banned by: ${b.banned_by}) - Reason: ${b.reason}` });
      });
      allBans.nick_bans.forEach((b, idx) => {
        banCount++;
        socket.emit('system_notice', { type: 'info', message: `***   ${banCount}. Nick: ${b.original_nick || b.nick_lower} (Banned by: ${b.banned_by}) - Reason: ${b.reason}` });
      });
      if (banCount === 0) {
        socket.emit('system_notice', { type: 'info', message: `***   (No active bans set for ${targetChanObj.name})` });
      }
      break;

    case 'stats':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /STATS requires IRCop privileges.' });
        return;
      }
      const bans = db.getBans();
      socket.emit('system_notice', { type: 'info', message: '*** ==================== ACTIVE BANS & SHUNS LIST ====================' });
      socket.emit('system_notice', { type: 'info', message: `*** IP Bans (${bans.ip_bans.length}):` });
      bans.ip_bans.forEach(b => {
        socket.emit('system_notice', { type: 'info', message: `***   - IP: ${b.ip} | Reason: ${b.reason} | By: ${b.banned_by}` });
      });
      socket.emit('system_notice', { type: 'info', message: `*** Nick Bans (${bans.nick_bans.length}):` });
      bans.nick_bans.forEach(b => {
        socket.emit('system_notice', { type: 'info', message: `***   - Nick: ${b.original_nick || b.nick_lower} | Reason: ${b.reason} | By: ${b.banned_by}` });
      });
      socket.emit('system_notice', { type: 'info', message: `*** Stealth Shuns (${bans.shuns.length}):` });
      bans.shuns.forEach(s => {
        const exp = s.expires_at ? `(Expires in ${Math.round((s.expires_at - Date.now())/1000)}s)` : '(Permanent)';
        socket.emit('system_notice', { type: 'info', message: `***   - Target: ${s.target} ${exp} | Reason: ${s.reason} | By: ${s.shunned_by}` });
      });
      socket.emit('system_notice', { type: 'info', message: '*** ====================================================================' });
      break;

    case 'kill':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /KILL requires IRCop privileges.' });
        return;
      }
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /KILL <nick> [reason]' });
        return;
      }
      const kUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === args[0].toLowerCase());
      if (!kUser) {
        socket.emit('system_notice', { type: 'error', message: `*** User '${args[0]}' not online.` });
        return;
      }
      const kSocket = io.sockets.sockets.get(kUser.socketId);
      if (kSocket) {
        const killReason = args.slice(1).join(' ') || 'Killed by IRCop';
        kSocket.emit('banned', { reason: `KILLED from network by ${u.nick}: ${killReason}` });
        kSocket.disconnect(true);
        io.emit('system_notice', { type: 'warning', message: `*** [KILL] ${kUser.nick} was killed by ${u.nick} (${killReason})` });
      }
      break;

    case 'shun':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /SHUN requires IRCop privileges.' });
        return;
      }
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /SHUN [+|-]<nick|ip> [duration: 10s|30s|1m|10m] [reason]' });
        return;
      }
      let shunTarget = args[0];
      let isUnshun = false;

      if (shunTarget.startsWith('+')) {
        shunTarget = shunTarget.substring(1);
      } else if (shunTarget.startsWith('-')) {
        shunTarget = shunTarget.substring(1);
        isUnshun = true;
      }

      if (isUnshun) {
        const unshunRes = db.unshunUser(shunTarget);
        socket.emit('system_notice', { type: unshunRes.success ? 'success' : 'error', message: `*** [SHUN] ${unshunRes.message}` });
      } else {
        const parsedTime = parseDuration(args[1]);
        const hasTime = parsedTime.ms > 0;
        const durationMs = hasTime ? parsedTime.ms : 0;
        const durationText = hasTime ? parsedTime.text : 'permanently';
        const reason = hasTime ? (args.slice(2).join(' ') || 'Stealth shunned by Oper') : (args.slice(1).join(' ') || 'Stealth shunned by Oper');

        db.shunUser(shunTarget, reason, u.nick, durationMs);
        socket.emit('system_notice', {
          type: 'success',
          message: `*** [SHUN] '${shunTarget}' has been STEALTH SHUNNED for ${durationText} (Reason: ${reason})`
        });

        if (durationMs > 0) {
          setTimeout(() => {
            db.unshunUser(shunTarget);
            socket.emit('system_notice', {
              type: 'info',
              message: `*** [SHUN] Auto-unshun timer expired for '${shunTarget}' (${durationText}). User is un-shunned.`
            });
          }, durationMs);
        }
      }
      break;

    case 'unshun':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /UNSHUN requires IRCop privileges.' });
        return;
      }
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /UNSHUN <nick|ip>' });
        return;
      }
      const unshunDirect = db.unshunUser(args[0]);
      socket.emit('system_notice', { type: unshunDirect.success ? 'success' : 'error', message: `*** [SHUN] ${unshunDirect.message}` });
      break;

    case 'kline':
    case 'zline':
    case 'gline':
    case 'gzline':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: `*** Permission Denied: /${cmd.toUpperCase()} requires IRCop privileges.` });
        return;
      }
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: `Usage: /${cmd.toUpperCase()} [+|-]<nick|ip> [reason]` });
        return;
      }
      let banArg = args[0];
      let isRemove = false;
      if (banArg.startsWith('-')) {
        isRemove = true;
        banArg = banArg.substring(1);
      } else if (banArg.startsWith('+')) {
        banArg = banArg.substring(1);
      }

      const banReason = args.slice(1).join(' ') || `${cmd.toUpperCase()} ban`;

      if (isRemove) {
        handleUnban(socket, banArg, banArg.includes('.') ? 'ip' : 'nick');
      } else {
        handleBan(socket, banArg, banArg.includes('.') ? 'ip' : 'nick', banReason);
      }
      break;

    case 'sethost':
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /SETHOST <newvhost>' });
        return;
      }
      u.vhost = args[0];
      socket.emit('system_notice', { type: 'success', message: `*** [SETHOST] Your vhost set to: ${u.vhost}` });
      notifyNickUpdatedAcrossChannels(socket);
      break;

    case 'setident':
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /SETIDENT <newident>' });
        return;
      }
      u.ident = args[0];
      socket.emit('system_notice', { type: 'success', message: `*** [SETIDENT] Your ident set to: ${u.ident}` });
      notifyNickUpdatedAcrossChannels(socket);
      break;

    case 'chghost':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /CHGHOST requires IRCop privileges.' });
        return;
      }
      if (!args[0] || !args[1]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /CHGHOST <nick> <newhost>' });
        return;
      }
      const chgHostUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === args[0].toLowerCase());
      if (chgHostUser) {
        chgHostUser.vhost = args[1];
        socket.emit('system_notice', { type: 'success', message: `*** [CHGHOST] Changed host for ${chgHostUser.nick} to ${args[1]}` });
      }
      break;

    case 'chgident':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /CHGIDENT requires IRCop privileges.' });
        return;
      }
      if (!args[0] || !args[1]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /CHGIDENT <nick> <newident>' });
        return;
      }
      const chgIdentUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === args[0].toLowerCase());
      if (chgIdentUser) {
        chgIdentUser.ident = args[1];
        socket.emit('system_notice', { type: 'success', message: `*** [CHGIDENT] Changed ident for ${chgIdentUser.nick} to ${args[1]}` });
      }
      break;

    case 'chgname':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /CHGNAME requires IRCop privileges.' });
        return;
      }
      if (!args[0] || !args[1]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /CHGNAME <nick> <newname>' });
        return;
      }
      const chgNameUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === args[0].toLowerCase());
      if (chgNameUser) {
        chgNameUser.realname = args.slice(1).join(' ');
        socket.emit('system_notice', { type: 'success', message: `*** [CHGNAME] Changed realname for ${chgNameUser.nick} to ${chgNameUser.realname}` });
      }
      break;

    case 'rehash':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /REHASH requires IRCop privileges.' });
        return;
      }
      const rehRes = db.reloadConfig();
      socket.emit('system_notice', { type: 'success', message: `*** [REHASH] ${rehRes.message}` });
      break;

    case 'opermotd':
      const operMotdLines = db.getOperMOTD();
      operMotdLines.forEach(line => {
        socket.emit('system_notice', { type: 'info', message: line });
      });
      break;

    case 'addmotd':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /ADDMOTD requires IRCop privileges.' });
        return;
      }
      db.addMOTD(args.join(' '));
      socket.emit('system_notice', { type: 'success', message: '*** Added line to MOTD.' });
      break;

    case 'addomotd':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /ADDOMOTD requires IRCop privileges.' });
        return;
      }
      db.addOperMOTD(args.join(' '));
      socket.emit('system_notice', { type: 'success', message: '*** Added line to OperMOTD.' });
      break;

    case 'mkpasswd':
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /MKPASSWD <password>' });
        return;
      }
      const encrypted = await bcrypt.hash(args[0], 10);
      socket.emit('system_notice', { type: 'info', message: `*** [MKPASSWD] Encrypted Hash: ${encrypted}` });
      break;

    case 'htm':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /HTM requires IRCop privileges.' });
        return;
      }
      const opt = (args[0] || '').toUpperCase();
      if (opt === 'ON') isHTM = true;
      else if (opt === 'OFF') isHTM = false;
      else if (opt === 'NOISY') htmNoisy = true;
      else if (opt === 'QUIET') htmNoisy = false;
      socket.emit('system_notice', { type: 'info', message: `*** High Traffic Mode (HTM): ${isHTM ? 'ON' : 'OFF'} (Notifications: ${htmNoisy ? 'NOISY' : 'QUIET'})` });
      break;

    case 'close':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /CLOSE requires IRCop privileges.' });
        return;
      }
      let count = 0;
      users.forEach((usr, sId) => {
        if (!usr.identified && sId !== BOT_SOCKET_ID && !sId.startsWith('virtual_user_id_')) {
          const s = io.sockets.sockets.get(sId);
          if (s) {
            s.emit('banned', { reason: 'Server /CLOSE issued by IRCop.' });
            s.disconnect(true);
            count++;
          }
        }
      });
      socket.emit('system_notice', { type: 'success', message: `*** [CLOSE] Closed ${count} un-identified connections.` });
      break;

    case 'dccdeny':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /DCCDENY requires IRCop privileges.' });
        return;
      }
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /DCCDENY <filemask> [reason]' });
        return;
      }
      const dccRes = db.addDCCDeny(args[0], args.slice(1).join(' ') || 'Blocked extension');
      socket.emit('system_notice', { type: 'success', message: `*** [DCCDENY] ${dccRes.message}` });
      break;

    case 'undccdeny':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /UNDCCDENY requires IRCop privileges.' });
        return;
      }
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /UNDCCDENY <filemask>' });
        return;
      }
      const undccRes = db.removeDCCDeny(args[0]);
      socket.emit('system_notice', { type: 'success', message: `*** [UNDCCDENY] ${undccRes.message}` });
      break;

    case 'seen':
      handleSeenInquiry(socket, args[0]);
      break;

    case 'whowas':
      handleWhowas(socket, args[0]);
      break;

    case 'devban':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /DEVBAN requires IRCop privileges.' });
        return;
      }
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /DEVBAN <nick|deviceId> [reason]' });
        return;
      }
      handleDeviceBanCommand(socket, args[0], args.slice(1).join(' '));
      break;

    case 'devunban':
      if (!isOperOrAdmin) {
        socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: /DEVUNBAN requires IRCop privileges.' });
        return;
      }
      if (!args[0]) {
        socket.emit('system_notice', { type: 'error', message: 'Usage: /DEVUNBAN <deviceId>' });
        return;
      }
      const undevRes = db.unbanDevice(args[0]);
      socket.emit('system_notice', { type: 'success', message: `*** [DEVUNBAN] ${undevRes.message}` });
      break;

    case 'whois':
      handleWhoisInquiry(socket, args[0]);
      break;

    default:
      socket.emit('system_notice', { type: 'error', message: `*** Unknown UnrealIRCd command /${cmd}.` });
  }
}

function partChannel(socket, channelName) {
  const u = users.get(socket.id);
  if (!u) return;

  const norm = normChan(channelName);
  const chanObj = channels.get(norm);
  if (!chanObj || !chanObj.users.has(socket.id)) return;

  socket.leave(chanObj.name);
  chanObj.users.delete(socket.id);
  chanObj.owners.delete(socket.id);
  chanObj.admins.delete(socket.id);
  chanObj.ops.delete(socket.id);
  chanObj.halfops.delete(socket.id);
  chanObj.voices.delete(socket.id);
  u.channels.delete(chanObj.name);

  io.to(chanObj.name).emit('user_part', {
    channel: chanObj.name,
    nick: u.nick,
    reason: 'Left channel'
  });

  broadcastChannelUserList(chanObj.name);
}

function handleNickChange(socket, newNick) {
  const u = users.get(socket.id);
  if (!u) return;

  newNick = (newNick || '').trim();
  if (!newNick || newNick.length < 2 || newNick.length > 20) {
    socket.emit('system_notice', { type: 'error', message: '*** Nickname must be 2-20 characters.' });
    return;
  }

  if (!/^[a-zA-Z0-9_\-\[\]\\^{}|]+$/.test(newNick)) {
    socket.emit('system_notice', { type: 'error', message: '*** Invalid nickname characters.' });
    return;
  }

  const oldNick = u.nick;
  const newNickLower = newNick.toLowerCase();

  if (db.isNickBanned(newNick)) {
    socket.emit('system_notice', { type: 'error', message: `*** Nickname '${newNick}' is banned.` });
    return;
  }

  const nickTaken = Array.from(users.values()).some(
    usr => usr.socketId !== socket.id && usr.nick.toLowerCase() === newNickLower
  );
  if (nickTaken) {
    socket.emit('system_notice', { type: 'error', message: `*** Nickname '${newNick}' is in use.` });
    return;
  }

  u.nick = newNick;
  u.identified = false;
  db.logUserIP(newNick, u.ip, u.user_agent);

  notifyNickUpdatedAcrossChannels(socket, oldNick, newNick);

  if (db.isRegistered(newNick)) {
    startNickIdentifyTimer(socket, newNick);
  } else {
    if (u.identify_timer) clearTimeout(u.identify_timer);
  }
}

function notifyNickUpdatedAcrossChannels(socket, oldNick = null, newNick = null) {
  const u = users.get(socket.id);
  if (!u) return;

  const currentNick = newNick || u.nick;

  u.channels.forEach(chName => {
    const chanObj = channels.get(normChan(chName));
    if (chanObj) {
      if (oldNick) {
        io.to(chanObj.name).emit('nick_changed', {
          channel: chanObj.name,
          oldNick: oldNick,
          newNick: currentNick
        });
      }
      broadcastChannelUserList(chanObj.name);
    }
  });

  socket.emit('nick_updated', { nick: currentNick, identified: u.identified, is_admin: u.is_admin, global_role: u.global_role });
}

function handleManageAccess(socket, channelName, action, targetNick = '', role = 'op') {
  const u = users.get(socket.id);
  if (!u) return;

  const norm = normChan(channelName);
  const chanObj = channels.get(norm);
  if (!chanObj) return;

  const rankInfo = getUserRankInChannel(socket.id, chanObj);

  if (action === 'list') {
    const list = db.getChannelAccessList(chanObj.name);
    socket.emit('system_notice', { type: 'info', message: `*** Persistent Access List for ${chanObj.name} (${list.length} entries):` });
    if (list.length === 0) {
      socket.emit('system_notice', { type: 'info', message: '*** (No operators or roles saved in access list yet)' });
    } else {
      list.forEach(item => {
        socket.emit('system_notice', { type: 'info', message: `*** [${item.role.toUpperCase()}] ${item.original_nick} (Added by ${item.added_by})` });
      });
    }
    return;
  }

  if (rankInfo.rank < 4 && u.global_role !== 'owner' && !u.is_oper) {
    socket.emit('system_notice', { type: 'error', message: '*** You must be Channel Owner (~) or Admin (&) to manage the access list.' });
    return;
  }

  if (action === 'add') {
    const res = db.addChannelAccess(chanObj.name, targetNick, role, u.nick);
    if (res.success) {
      socket.emit('system_notice', { type: 'success', message: `*** [ChanServ] ${res.message}` });
      const targetUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === targetNick.toLowerCase());
      if (targetUser && chanObj.users.has(targetUser.socketId)) {
        checkAndGrantPersistentRank(io.sockets.sockets.get(targetUser.socketId), chanObj);
        broadcastChannelUserList(chanObj.name);
      }
    } else {
      socket.emit('system_notice', { type: 'error', message: `*** [ChanServ] ${res.message}` });
    }
  } else if (action === 'del') {
    const res = db.removeChannelAccess(chanObj.name, targetNick);
    if (res.success) {
      socket.emit('system_notice', { type: 'success', message: `*** [ChanServ] ${res.message}` });
    } else {
      socket.emit('system_notice', { type: 'error', message: `*** [ChanServ] ${res.message}` });
    }
  }
}

function handleSetChannelMode(socket, channelName, modeStr, keyArg = '') {
  const u = users.get(socket.id);
  if (!u) return;

  const norm = normChan(channelName);
  const chanObj = channels.get(norm);
  if (!chanObj) return;

  const rankInfo = getUserRankInChannel(socket.id, chanObj);
  if (rankInfo.rank < 3 && !u.is_oper) {
    socket.emit('system_notice', { type: 'error', message: '*** You need Operator (@) or higher rank to change channel modes.' });
    return;
  }

  if (!modeStr) {
    socket.emit('system_notice', { type: 'info', message: `*** Channel modes for ${chanObj.name}: ${getModeString(chanObj.modes) || 'none'}` });
    return;
  }

  let adding = true;
  for (let i = 0; i < modeStr.length; i++) {
    const char = modeStr[i];
    if (char === '+') adding = true;
    else if (char === '-') adding = false;
    else if (char === 'r') chanObj.modes.r = adding;
    else if (char === 'i') chanObj.modes.i = adding;
    else if (char === 'm') chanObj.modes.m = adding;
    else if (char === 'k') chanObj.modes.k = adding ? keyArg : '';
    else if (char === 'f') {
      if (adding) {
        let lines = 10;
        let seconds = 5;
        if (keyArg && keyArg.includes(':')) {
          const parts = keyArg.split(':').map(Number);
          if (parts[0] > 0) lines = parts[0];
          if (parts[1] > 0) seconds = parts[1];
        } else if (keyArg && !isNaN(Number(keyArg))) {
          lines = Number(keyArg);
        }
        chanObj.modes.f = { enabled: true, lines, seconds };
      } else {
        if (!chanObj.modes.f) chanObj.modes.f = { enabled: false, lines: 10, seconds: 5 };
        chanObj.modes.f.enabled = false;
      }
    }
  }

  db.saveChannelModes(chanObj.name, chanObj.modes);

  io.to(chanObj.name).emit('mode_change', {
    channel: chanObj.name,
    mode: `${modeStr} ${keyArg}`.trim(),
    setBy: u.nick
  });

  broadcastChannelUserList(chanObj.name);
}

function handleInviteUser(socket, targetNick, channelName) {
  const u = users.get(socket.id);
  if (!u) return;

  const norm = normChan(channelName);
  const chanObj = channels.get(norm);
  if (!chanObj) return;

  const rankInfo = getUserRankInChannel(socket.id, chanObj);
  if (rankInfo.rank < 2 && !u.is_oper) {
    socket.emit('system_notice', { type: 'error', message: '*** You need HalfOp (%) rank or higher to invite users.' });
    return;
  }

  const targetUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === targetNick.toLowerCase());
  if (!targetUser) {
    socket.emit('system_notice', { type: 'error', message: `*** No user online with nick '${targetNick}'` });
    return;
  }

  chanObj.invites.add(targetUser.socketId);

  const targetSocket = io.sockets.sockets.get(targetUser.socketId);
  if (targetSocket) {
    targetSocket.emit('system_notice', {
      type: 'info',
      message: `*** You have been invited to ${chanObj.name} by ${u.nick}. Type /join ${chanObj.name} to enter.`
    });
  }

  socket.emit('system_notice', { type: 'success', message: `*** Invited ${targetUser.nick} to ${chanObj.name}` });
}

function handleSetRole(socket, channelName, targetNick, role, active = true) {
  const u = users.get(socket.id);
  if (!u) return;

  const norm = normChan(channelName);
  const chanObj = channels.get(norm);
  if (!chanObj) return;

  const senderRank = getUserRankInChannel(socket.id, chanObj);

  const targetUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === targetNick.toLowerCase());
  if (!targetUser || !chanObj.users.has(targetUser.socketId)) {
    socket.emit('system_notice', { type: 'error', message: `*** User '${targetNick}' is not in ${chanObj.name}` });
    return;
  }

  if (role === 'owner') {
    if (senderRank.rank < 5 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** Only Channel Owner (~) can assign or remove Owner status.' });
      return;
    }
    if (active) chanObj.owners.add(targetUser.socketId);
    else chanObj.owners.delete(targetUser.socketId);
  } else if (role === 'admin') {
    if (senderRank.rank < 5 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** You must be Channel Owner (~) to assign or remove Admin status.' });
      return;
    }
    if (active) chanObj.admins.add(targetUser.socketId);
    else chanObj.admins.delete(targetUser.socketId);
  } else if (role === 'op') {
    if (senderRank.rank < 4 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** You must be Owner (~) or Admin (&) to grant/remove Op status.' });
      return;
    }
    if (active) chanObj.ops.add(targetUser.socketId);
    else chanObj.ops.delete(targetUser.socketId);
  } else if (role === 'halfop') {
    if (senderRank.rank < 3 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** You must be Operator (@) or higher to grant/remove HalfOp status.' });
      return;
    }
    if (active) chanObj.halfops.add(targetUser.socketId);
    else chanObj.halfops.delete(targetUser.socketId);
  } else if (role === 'voice') {
    if (senderRank.rank < 2 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** You must be HalfOp (%) or higher to grant/remove Voice status.' });
      return;
    }
    if (active) chanObj.voices.add(targetUser.socketId);
    else chanObj.voices.delete(targetUser.socketId);
  }

  const modeChar = role === 'owner' ? 'q' : (role === 'admin' ? 'a' : (role === 'op' ? 'o' : (role === 'halfop' ? 'h' : 'v')));
  const sign = active ? '+' : '-';

  io.to(chanObj.name).emit('mode_change', {
    channel: chanObj.name,
    mode: `${sign}${modeChar} ${targetUser.nick}`,
    setBy: u.nick
  });

  broadcastChannelUserList(chanObj.name);
}

function handleKick(socket, channelName, targetNick, reason = 'No reason specified') {
  const u = users.get(socket.id);
  if (!u) return;

  const norm = normChan(channelName);
  const chanObj = channels.get(norm);
  if (!chanObj) return;

  const senderRank = getUserRankInChannel(socket.id, chanObj);
  if (senderRank.rank < 3 && !u.is_oper) {
    socket.emit('system_notice', { type: 'error', message: '*** You need Operator (@) rank or higher to kick users.' });
    return;
  }

  const targetUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === targetNick.toLowerCase());
  if (!targetUser || !chanObj.users.has(targetUser.socketId)) {
    socket.emit('system_notice', { type: 'error', message: `*** User '${targetNick}' is not in ${chanObj.name}` });
    return;
  }

  const targetRank = getUserRankInChannel(targetUser.socketId, chanObj);

  if (senderRank.rank <= targetRank.rank && !u.is_oper) {
    socket.emit('system_notice', {
      type: 'error',
      message: `*** Cannot kick '${targetUser.nick}' because they have equal or higher rank (${targetRank.roleName}) than you.`
    });
    return;
  }

  const targetSocket = io.sockets.sockets.get(targetUser.socketId);
  if (targetSocket) {
    targetSocket.leave(chanObj.name);
  }
  chanObj.users.delete(targetUser.socketId);
  chanObj.owners.delete(targetUser.socketId);
  chanObj.admins.delete(targetUser.socketId);
  chanObj.ops.delete(targetUser.socketId);
  chanObj.halfops.delete(targetUser.socketId);
  chanObj.voices.delete(targetUser.socketId);
  targetUser.channels.delete(chanObj.name);

  io.to(chanObj.name).emit('user_kicked', {
    channel: chanObj.name,
    targetNick: targetUser.nick,
    kickedBy: u.nick,
    reason: reason
  });

  if (targetSocket) {
    targetSocket.emit('you_were_kicked', {
      channel: chanObj.name,
      kickedBy: u.nick,
      reason: reason
    });
  }

  broadcastChannelUserList(chanObj.name);
}

function handleBan(socket, targetNickOrIP, banType = 'nick', reason = 'Banned by operator') {
  const u = users.get(socket.id);
  if (!u) return;

  const isOpAny = u.is_admin || u.is_oper || Array.from(channels.values()).some(c => getUserRankInChannel(socket.id, c).rank >= 3);
  if (!isOpAny) {
    socket.emit('system_notice', { type: 'error', message: '*** You need Operator (@) or higher rank to ban users.' });
    return;
  }

  let targetUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === targetNickOrIP.toLowerCase() || usr.ip === targetNickOrIP);

  if (targetUser && !u.is_oper) {
    const senderMaxRank = Math.max(...Array.from(channels.values()).map(c => getUserRankInChannel(socket.id, c).rank));
    const targetMaxRank = Math.max(...Array.from(channels.values()).map(c => getUserRankInChannel(targetUser.socketId, c).rank));

    if (senderMaxRank <= targetMaxRank && !u.is_admin) {
      socket.emit('system_notice', {
        type: 'error',
        message: `*** Cannot ban '${targetUser.nick}' because they have higher or equal rank.`
      });
      return;
    }
  }

  let result;
  if (banType === 'ip' || targetNickOrIP.includes('.')) {
    const ipToBan = targetUser ? targetUser.ip : targetNickOrIP;
    result = db.banIP(ipToBan, reason, u.nick);

    if (result.success) {
      users.forEach((usr, sId) => {
        if (usr.ip === ipToBan) {
          const s = io.sockets.sockets.get(sId);
          if (s) {
            s.emit('banned', { reason: `You have been IP banned: ${reason}` });
            s.disconnect(true);
          }
        }
      });
    }
  } else {
    const nickToBan = targetUser ? targetUser.nick : targetNickOrIP;
    result = db.banNick(nickToBan, reason, u.nick);

    if (result.success && targetUser) {
      const s = io.sockets.sockets.get(targetUser.socketId);
      if (s) {
        s.emit('banned', { reason: `Your nick has been banned: ${reason}` });
        s.disconnect(true);
      }
    }
  }

  if (result.success) {
    io.emit('system_notice', { type: 'warning', message: `*** [BAN] ${targetNickOrIP} was banned by ${u.nick} (${reason})` });
  } else {
    socket.emit('system_notice', { type: 'error', message: result.message });
  }
}

function handleUnban(socket, target, banType = 'ip') {
  const u = users.get(socket.id);
  if (!u) return;

  const isOpAny = u.is_admin || u.is_oper || u.global_role === 'owner' || u.global_role === 'admin' || u.nick.toLowerCase() === 'prince' || Array.from(channels.values()).some(c => getUserRankInChannel(socket.id, c).rank >= 3);

  if (!isOpAny) {
    socket.emit('system_notice', { type: 'error', message: '*** You need Operator (@) rank or higher to unban.' });
    return;
  }

  let result;
  if (banType === 'ip' || target.includes('.')) {
    result = db.unbanIP(target);
  } else {
    result = db.unbanNick(target);
  }

  if (result.success) {
    socket.emit('system_notice', { type: 'success', message: `*** [UNBAN] ${result.message}` });
  } else {
    socket.emit('system_notice', { type: 'error', message: result.message });
  }
}

// --- !SEEN LAST ONLINE INQUIRY ENGINE ---
function formatRelativeTime(dateIsoStr) {
  if (!dateIsoStr) return 'some time ago';
  const past = new Date(dateIsoStr).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - past);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec} seconds ago`;

  const diffMin = Math.floor(diffSec / 60);
  const hours = Math.floor(diffMin / 60);
  const remainingMins = diffMin % 60;

  if (hours === 0) {
    return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
  } else if (remainingMins === 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  } else {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} and ${remainingMins} ${remainingMins === 1 ? 'minute' : 'minutes'} ago`;
  }
}

function handleSeenInquiry(socket, targetNick) {
  if (!targetNick || !targetNick.trim()) {
    socket.emit('system_notice', { type: 'error', message: 'Usage: !seen <nick>' });
    return;
  }
  targetNick = targetNick.trim();
  const targetLower = targetNick.toLowerCase();

  // 1. Check if user is currently online
  const onlineUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === targetLower);
  if (onlineUser) {
    socket.emit('system_notice', {
      type: 'info',
      message: `*** [SEEN] '${onlineUser.nick}' is currently ONLINE right now in ${DEFAULT_MAIN_CHANNEL}!`
    });
    return;
  }

  // 2. Check IP History DB
  const adminData = db.getAdminData();
  const historyList = (adminData.ip_history || []).filter(h => h.nick.toLowerCase() === targetLower);

  if (historyList.length > 0) {
    historyList.sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
    const lastRec = historyList[0];
    const relTime = formatRelativeTime(lastRec.last_seen);
    socket.emit('system_notice', {
      type: 'info',
      message: `*** [SEEN] '${lastRec.nick}' was last seen online ${relTime}.`
    });
  } else {
    socket.emit('system_notice', {
      type: 'info',
      message: `*** [SEEN] No login history found for nickname '${targetNick}'.`
    });
  }
}

// --- /WHOIS QUERY ENGINE WITH RANK-BASED IP PRIVACY ---
function handleWhoisInquiry(socket, targetNick) {
  if (!targetNick || !targetNick.trim()) {
    socket.emit('system_notice', { type: 'error', message: 'Usage: /whois <nick>' });
    return;
  }
  targetNick = targetNick.trim();
  const targetLower = targetNick.toLowerCase();
  const requester = users.get(socket.id);
  if (!requester) return;

  const targetUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === targetLower);
  if (!targetUser) {
    socket.emit('system_notice', { type: 'error', message: `*** [WHOIS] ${targetNick}: No such nick/channel` });
    return;
  }

  // Check if requester is Staff/Operator (HalfOp % or higher, Oper, Admin, Owner)
  const requesterMaxRank = Math.max(0, ...Array.from(channels.values()).map(c => getUserRankInChannel(socket.id, c).rank));
  const isStaff = requesterMaxRank >= 2 || requester.is_oper || requester.is_admin || requester.global_role === 'owner';

  // IP Privacy Rule: Staff sees real IP/VHost; Normal users see masked host
  const identStr = targetUser.ident || 'user';
  const realNameStr = targetUser.realname || 'PakiChat Member';
  const displayHost = isStaff ? (targetUser.vhost || targetUser.ip) : `${targetUser.nick.toLowerCase()}.funnypaki.user.cloak`;

  socket.emit('system_notice', {
    type: 'info',
    message: `*** ${targetUser.nick} is ~${identStr}@${displayHost} * ${realNameStr}`
  });

  // Collect channels target belongs to
  const memberChans = [];
  channels.forEach(chanObj => {
    const r = getUserRankInChannel(targetUser.socketId, chanObj);
    if (r.rank > 0) {
      memberChans.push(`${r.prefix}${chanObj.name}`);
    }
  });

  if (memberChans.length > 0) {
    socket.emit('system_notice', {
      type: 'info',
      message: `*** ${targetUser.nick} on ${memberChans.join(' ')}`
    });
  }

  socket.emit('system_notice', {
    type: 'info',
    message: `*** ${targetUser.nick} using irc.funnypaki.net (#FunnyPaki IRC Server Network)`
  });

  // Calculate idle minutes and sign-on time
  const lastActiveMs = targetUser.lastActive || targetUser.connectedAt || Date.now();
  const idleSec = Math.floor(Math.max(0, Date.now() - lastActiveMs) / 1000);
  const idleMins = Math.floor(idleSec / 60);

  const signOnDateStr = new Date(targetUser.connectedAt || Date.now()).toString().split(' GMT')[0];

  socket.emit('system_notice', {
    type: 'info',
    message: `*** ${targetUser.nick} has been idle ${idleMins} mins, signed on ${signOnDateStr}`
  });

  socket.emit('system_notice', {
    type: 'info',
    message: `*** ${targetUser.nick} End of /WHOIS list.`
  });
}

// --- /WHOWAS HISTORICAL IP LOOKUP ENGINE ---
function handleWhowas(socket, targetNick) {
  if (!targetNick || !targetNick.trim()) {
    socket.emit('system_notice', { type: 'error', message: 'Usage: /whowas <nick>' });
    return;
  }
  targetNick = targetNick.trim();
  const records = db.getWhowas(targetNick);

  if (records.length === 0) {
    socket.emit('system_notice', {
      type: 'info',
      message: `*** [WHOWAS] No historical IP records found for nick '${targetNick}'.`
    });
    return;
  }

  socket.emit('system_notice', {
    type: 'info',
    message: `*** [WHOWAS] Historical IP records for '${targetNick}' (${records.length} total entries):`
  });

  records.slice(0, 10).forEach((rec, idx) => {
    const relTime = formatRelativeTime(rec.last_seen);
    const exactDate = new Date(rec.last_seen).toLocaleString();
    socket.emit('system_notice', {
      type: 'info',
      message: `*** [${idx + 1}] IP: ${rec.ip} | Last Seen: ${relTime} (${exactDate})`
    });
  });
}

// --- DEVICE FINGERPRINT BAN COMMAND HANDLER ---
function handleDeviceBanCommand(socket, targetNickOrDevId, reason = 'Banned by operator') {
  const u = users.get(socket.id);
  if (!u) return;

  let targetDeviceId = null;
  let targetNick = targetNickOrDevId;

  if (targetNickOrDevId.startsWith('DEV-')) {
    targetDeviceId = targetNickOrDevId;
  } else {
    const onlineTarget = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === targetNickOrDevId.toLowerCase());
    if (onlineTarget && onlineTarget.deviceId) {
      targetDeviceId = onlineTarget.deviceId;
    } else {
      const history = db.getWhowas(targetNickOrDevId);
      if (history.length > 0 && history[0].device_id) {
        targetDeviceId = history[0].device_id;
      }
    }
  }

  if (!targetDeviceId) {
    socket.emit('system_notice', {
      type: 'error',
      message: `*** Could not resolve Device Signature for '${targetNickOrDevId}'. Target must be online or have logged in recently.`
    });
    return;
  }

  const result = db.banDevice(targetDeviceId, targetNick, reason, u.nick);
  if (!result.success) {
    socket.emit('system_notice', { type: 'error', message: `*** ${result.message}` });
    return;
  }

  socket.emit('system_notice', {
    type: 'success',
    message: `*** [DEVBAN] Target Device [${targetDeviceId}] (${targetNick}) has been physical DEVICE BANNED! (Reason: ${reason})`
  });

  users.forEach((usr, sId) => {
    if (usr.deviceId === targetDeviceId) {
      const s = io.sockets.sockets.get(sId);
      if (s) {
        s.emit('you_were_banned', {
          channel: DEFAULT_MAIN_CHANNEL,
          bannedBy: u.nick,
          reason: `Physical Device Banned: ${reason}`
        });
        s.disconnect(true);
      }
    }
  });
}

// --- QUICK DOT COMMANDS ENGINE (.aop, .hop, .vop, .admin, .owner, .kick, .ban, .whowas) ---
function handleDotCommand(socket, channelName, text) {
  const u = users.get(socket.id);
  if (!u) return false;

  const norm = normChan(channelName);
  const chanObj = channels.get(norm);
  if (!chanObj) return false;

  const parts = text.trim().split(' ');
  const cmd = parts[0].toLowerCase();
  const targetNick = parts[1];

  if (cmd === '!seen' || cmd === '.seen') {
    handleSeenInquiry(socket, targetNick);
    return true;
  }

  if (cmd === '!whowas' || cmd === '.whowas' || cmd === '/whowas') {
    handleWhowas(socket, targetNick);
    return true;
  }

  if (cmd === '!ttop5' || cmd === '!ttop10' || cmd === '!top5' || cmd === '!top10') {
    const isToday = cmd.startsWith('!ttop');
    const limit = cmd.endsWith('10') ? 10 : 5;
    const timeframe = isToday ? 'today' : 'all_time';

    const topList = db.getTopChatters(limit, timeframe);

    if (topList.length === 0) {
      socket.emit('system_notice', {
        type: 'info',
        message: `*** No word count statistics recorded for ${isToday ? "Today" : "All-Time"} yet.`
      });
      return false;
    }

    const formattedList = topList.map((item, idx) => {
      const count = isToday ? item.today_words : item.all_time_words;
      return `${idx + 1}.${item.original_nick}(${count})`;
    }).join(', ');

    const titleStr = isToday ? `Today's Top ${limit} User Word Count` : `All-Time Top ${limit} User Word Count`;
    socket.emit('system_notice', {
      type: 'info',
      message: `*** ${titleStr}: ${formattedList}`
    });
    return false; // Return false so command text is echoed publicly to room!
  }

  const dotRanks = ['.owner', '.admin', '.aop', '.op', '.hop', '.halfop', '.vop', '.voice', '.deop', '.dehop', '.devoice', '.kick', '.ban'];
  if (!dotRanks.includes(cmd)) return false;

  if (!targetNick) {
    socket.emit('system_notice', { type: 'error', message: `Usage: ${cmd} <nick> [reason]` });
    return true;
  }

  const senderRank = getUserRankInChannel(socket.id, chanObj);

  if (cmd === '.kick') {
    if (senderRank.rank < 3 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: Requires Operator (@) rank or higher to kick.' });
      return true;
    }
    const targetUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === targetNick.toLowerCase());
    if (!targetUser) {
      socket.emit('system_notice', { type: 'error', message: `*** User '${targetNick}' is not online in ${chanObj.name}.` });
      return true;
    }

    const targetRank = getUserRankInChannel(targetUser.socketId, chanObj);
    if (targetRank.rank >= senderRank.rank && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: `*** Permission Denied: You cannot kick equal or higher rank '${targetNick}'.` });
      return true;
    }

    const reason = parts.slice(2).join(' ') || 'No reason defined';
    io.to(chanObj.name).emit('system_notice', {
      type: 'warning',
      message: `*** ${targetUser.nick} was kicked by ${u.nick} (${reason})`
    });

    const targetSocket = io.sockets.sockets.get(targetUser.socketId);
    if (targetSocket) {
      targetSocket.emit('you_were_kicked', {
        channel: chanObj.name,
        kickedBy: u.nick,
        reason: reason
      });
      partChannel(targetSocket, chanObj.name);
    }
    return true;
  }

  if (cmd === '.ban') {
    if (senderRank.rank < 3 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: Requires Operator (@) rank or higher to ban.' });
      return true;
    }

    const reason = parts.slice(2).join(' ') || 'Banned by operator';
    const isMask = targetNick.includes('*') || targetNick.includes('@') || (targetNick.includes('.') && targetNick.split('.').length === 4);

    if (isMask) {
      const maskStr = targetNick.trim();
      const banRes = db.banIP(maskStr, reason, u.nick);

      if (!banRes.success) {
        socket.emit('system_notice', { type: 'error', message: `*** ${banRes.message}` });
        return true;
      }

      io.to(chanObj.name).emit('system_notice', {
        type: 'error',
        message: `*** [BAN] Mask '${maskStr}' was BANNED by ${u.nick} (Reason: ${reason})`
      });

      // Disconnect matching connected sockets after 3s buffer delay
      setTimeout(() => {
        users.forEach((usr, sId) => {
          if (db.isIPBanned(usr.ip)) {
            const s = io.sockets.sockets.get(sId);
            if (s) {
              s.emit('you_were_banned', { channel: chanObj.name, bannedBy: u.nick, reason: reason });
              partChannel(s, chanObj.name);
            }
          }
        });
      }, 3000);
      return true;
    }

    const targetUser = Array.from(users.values()).find(usr => usr.nick.toLowerCase() === targetNick.toLowerCase());

    if (targetUser) {
      const targetRank = getUserRankInChannel(targetUser.socketId, chanObj);
      if (targetRank.rank >= senderRank.rank && !u.is_oper) {
        socket.emit('system_notice', { type: 'error', message: `*** Permission Denied: You cannot ban equal or higher rank '${targetNick}'.` });
        return true;
      }

      // Step 1: Immediate Nick & IP ban
      db.banIP(targetUser.ip, reason, u.nick);
      db.banNick(targetUser.nick, reason, u.nick);

      io.to(chanObj.name).emit('system_notice', {
        type: 'error',
        message: `*** [BAN] '${targetUser.nick}' [IP: ${targetUser.ip}] was BANNED by ${u.nick} (Reason: ${reason})`
      });

      const targetSocket = io.sockets.sockets.get(targetUser.socketId);
      if (targetSocket) {
        targetSocket.emit('you_were_banned', {
          channel: chanObj.name,
          bannedBy: u.nick,
          reason: reason
        });
      }

      // Step 2: 3-Second Buffer Delay before kick
      setTimeout(() => {
        const checkTargetSocket = io.sockets.sockets.get(targetUser.socketId);
        if (checkTargetSocket) {
          io.to(chanObj.name).emit('system_notice', {
            type: 'warning',
            message: `*** ${targetUser.nick} was kicked by ${u.nick} (Banned: ${reason})`
          });
          partChannel(checkTargetSocket, chanObj.name);
        }
      }, 3000);

    } else {
      // Offline nick ban
      db.banNick(targetNick, reason, u.nick);
      io.to(chanObj.name).emit('system_notice', {
        type: 'error',
        message: `*** [BAN] Offline Nick '${targetNick}' was BANNED by ${u.nick} (Reason: ${reason})`
      });
    }
    return true;
  }

  if (cmd === '.owner') {
    if (senderRank.rank < 5 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: Only Channel Owner (~) can assign Owner status.' });
      return true;
    }
    handleSetRole(socket, chanObj.name, targetNick, 'owner', true);
    return true;
  }

  if (cmd === '.admin') {
    if (senderRank.rank < 5 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: Only Channel Owner (~) can assign Admin status.' });
      return true;
    }
    handleSetRole(socket, chanObj.name, targetNick, 'admin', true);
    return true;
  }

  if (cmd === '.aop' || cmd === '.op') {
    if (senderRank.rank < 4 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: Operators (@) cannot grant Op to others. Requires Owner (~) or Admin (&).' });
      return true;
    }
    handleSetRole(socket, chanObj.name, targetNick, 'op', true);
    return true;
  }

  if (cmd === '.hop' || cmd === '.halfop') {
    if (senderRank.rank < 3 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: HalfOps (%) cannot grant HalfOp to others. Requires Operator (@) or higher.' });
      return true;
    }
    handleSetRole(socket, chanObj.name, targetNick, 'halfop', true);
    return true;
  }

  if (cmd === '.vop' || cmd === '.voice') {
    if (senderRank.rank < 2 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: Requires HalfOp (%) rank or higher to grant Voice.' });
      return true;
    }
    handleSetRole(socket, chanObj.name, targetNick, 'voice', true);
    return true;
  }

  if (cmd === '.deop') {
    if (senderRank.rank < 4 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: Requires Admin (&) or Owner (~) to deop.' });
      return true;
    }
    handleSetRole(socket, chanObj.name, targetNick, 'op', false);
    return true;
  }

  if (cmd === '.dehop') {
    if (senderRank.rank < 3 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: Requires Operator (@) or higher to dehop.' });
      return true;
    }
    handleSetRole(socket, chanObj.name, targetNick, 'halfop', false);
    return true;
  }

  if (cmd === '.devoice') {
    if (senderRank.rank < 2 && !u.is_oper) {
      socket.emit('system_notice', { type: 'error', message: '*** Permission Denied: Requires HalfOp (%) or higher to devoice.' });
      return true;
    }
    handleSetRole(socket, chanObj.name, targetNick, 'voice', false);
    return true;
  }

  return false;
}

app.use(express.json());

const ADMIN_TOKEN = 'secret-shahzad-admin-token-998877';

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === 'shahzad' && password === 'Khanjee@123') {
    return res.json({ success: true, token: ADMIN_TOKEN, username: 'shahzad' });
  }
  return res.status(401).json({ success: false, message: 'Invalid Admin Username or Password!' });
});

app.get('/api/admin/bans', (req, res) => {
  const token = req.headers['authorization'] || req.query.token;
  if (token !== `Bearer ${ADMIN_TOKEN}` && token !== ADMIN_TOKEN) {
    return res.status(403).json({ success: false, message: 'Unauthorized access to Ban Management Console.' });
  }
  const bansData = db.getBans();
  return res.json({ success: true, bans: bansData });
});

app.post('/api/admin/unban', (req, res) => {
  const token = req.headers['authorization'] || req.body.token;
  if (token !== `Bearer ${ADMIN_TOKEN}` && token !== ADMIN_TOKEN) {
    return res.status(403).json({ success: false, message: 'Unauthorized action.' });
  }
  const { type, target } = req.body || {};
  if (!target) {
    return res.status(400).json({ success: false, message: 'Target is required.' });
  }

  let result;
  if (type === 'ip') {
    result = db.unbanIP(target);
  } else if (type === 'nick') {
    result = db.unbanNick(target);
  } else if (type === 'shun') {
    result = db.unshunUser(target);
  } else if (type === 'device') {
    result = db.unbanDevice(target);
  } else {
    result = target.startsWith('DEV-') ? db.unbanDevice(target) : (target.includes('.') ? db.unbanIP(target) : db.unbanNick(target));
  }

  return res.json(result);
});

app.get('/api/admin/spam-filters', (req, res) => {
  const token = req.headers['authorization'] || req.query.token;
  if (token !== `Bearer ${ADMIN_TOKEN}` && token !== ADMIN_TOKEN) {
    return res.status(403).json({ success: false, message: 'Unauthorized.' });
  }
  return res.json({ success: true, filters: db.getSpamFilters() });
});

app.post('/api/admin/spam-filters', (req, res) => {
  const token = req.headers['authorization'] || req.body.token;
  if (token !== `Bearer ${ADMIN_TOKEN}` && token !== ADMIN_TOKEN) {
    return res.status(403).json({ success: false, message: 'Unauthorized.' });
  }
  const { word, action } = req.body || {};
  const result = db.addSpamFilter(word, action || 'block', 'shahzad');
  return res.json(result);
});

app.delete('/api/admin/spam-filters/:id', (req, res) => {
  const token = req.headers['authorization'] || req.query.token;
  if (token !== `Bearer ${ADMIN_TOKEN}` && token !== ADMIN_TOKEN) {
    return res.status(403).json({ success: false, message: 'Unauthorized.' });
  }
  const result = db.removeSpamFilter(req.params.id);
  return res.json(result);
});

app.post('/api/admin/upload-sound', express.json({ limit: '10mb' }), (req, res) => {
  const token = req.headers['authorization'] || req.body.token;
  if (token !== `Bearer ${ADMIN_TOKEN}` && token !== ADMIN_TOKEN) {
    return res.status(403).json({ success: false, message: 'Unauthorized.' });
  }

  const { soundType, base64Data, extension } = req.body || {};
  if (!['newjoining', 'tagnick', 'private'].includes(soundType) || !base64Data) {
    return res.status(400).json({ success: false, message: 'Invalid sound type or payload.' });
  }

  try {
    const ext = (extension || 'wav').replace('.', '');
    const fs = require('fs');
    const soundsDir = path.join(__dirname, 'public', 'sounds');
    if (!fs.existsSync(soundsDir)) {
      fs.mkdirSync(soundsDir, { recursive: true });
    }

    const buffer = Buffer.from(base64Data.replace(/^data:audio\/\w+;base64,/, ''), 'base64');
    const targetFile = path.join(soundsDir, `${soundType}.${ext}`);
    fs.writeFileSync(targetFile, buffer);

    const altExt = ext === 'wav' ? 'mp3' : 'wav';
    fs.writeFileSync(path.join(soundsDir, `${soundType}.${altExt}`), buffer);

    return res.json({ success: true, message: `Sound '${soundType}' updated successfully.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/visitor-logs', (req, res) => {
  const token = req.headers['authorization'] || req.query.token;
  if (token !== `Bearer ${ADMIN_TOKEN}` && token !== ADMIN_TOKEN) {
    return res.status(403).json({ success: false, message: 'Unauthorized access.' });
  }
  return res.json({ success: true, data: db.getVisitorLogs() });
});

// Periodic log cleanup every 60 minutes
setInterval(() => {
  try {
    db.purgeVisitorLogsOlderThan3Days();
  } catch (err) {}
}, 60 * 60 * 1000);

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/admin/data', (req, res) => {
  res.json(db.getAdminData());
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  #FunnyPaki Server v10.0 Anti-Spam & Admin Console `);
  console.log(`  Access Chat: http://localhost:${PORT}             `);
  console.log(`  Admin Console: http://localhost:${PORT}/admin.html `);
  console.log(`====================================================`);
});
