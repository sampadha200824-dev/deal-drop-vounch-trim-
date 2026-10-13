import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ----------------------------------------------------
// Persistent In-Memory State & Real-Time Sync Registry
// ----------------------------------------------------
let systemSettings = {
  storeOpen: true,
  maintenanceMode: false,
  allowDemoLogin: true,
  autoApproval: false,
  captchaSize: 'small',
  customLogo: null,
  gstType: 'percent',
  gstValue: 5,
  platformFeeType: 'fixed',
  platformFeeValue: 10,
  supportEmail: 'support@vouchtrim.app',
  contactEmail: 'contact@vouchtrim.app',
  supportWhatsapp: '+91 90000 12345',
  appTitle: 'VouchTrim',
  appTagline: 'MORE DEALS. MORE SAVINGS.',
  heroHeadline: 'Gift Cards Delivered in Minutes',
  heroSubtitle: 'Instant checkout, zero payment failures & 100% verified codes',
  liveDeliveryText: '1,840 gift cards delivered today — avg. speed 4 mins',
  walletPromoText: 'Add funds to your wallet for instantaneous 1-click checkout',
  termsNoticeText: 'By placing an order, you agree to digital voucher terms & instantaneous delivery policy.',
};

// Global Transactions store for platform-wide real-time tracking
let globalTransactions = [
  {
    id: 'TXN-90214',
    userId: '202600001',
    userEmail: 'rahul.demo@gmail.com',
    userName: 'Rahul Sharma',
    amt: 5000,
    type: 'credit',
    method: 'UPI',
    label: 'Wallet Top-up',
    status: 'Success',
    time: 'Today, 02:40 PM',
    timestamp: Date.now() - 3600000 * 2,
  },
  {
    id: 'TXN-90213',
    userId: '202600001',
    userEmail: 'rahul.demo@gmail.com',
    userName: 'Rahul Sharma',
    amt: 1500,
    type: 'debit',
    method: 'Order Checkout',
    label: 'Amazon Shopping Voucher',
    status: 'Success',
    time: 'Today, 11:15 AM',
    timestamp: Date.now() - 3600000 * 5,
  },
  {
    id: 'TXN-90212',
    userId: '202600002',
    userEmail: 'priya.rao@gmail.com',
    userName: 'Priya Rao',
    amt: 1000,
    type: 'credit',
    method: 'PhonePe',
    label: 'Wallet Top-up',
    status: 'Success',
    time: 'Yesterday, 04:20 PM',
    timestamp: Date.now() - 86400000,
  },
  {
    id: 'TXN-90211',
    userId: '202600001',
    userEmail: 'rahul.demo@gmail.com',
    userName: 'Rahul Sharma',
    amt: 500,
    type: 'credit',
    method: 'Admin Credit',
    label: 'Promotional Reward Credit',
    status: 'Success',
    time: '12 Aug 2026, 06:30 PM',
    timestamp: Date.now() - 86400000 * 6,
  }
];

// Real user accounts store
let users = [
  {
    id: 1,
    uid: 'ADMIN',
    name: 'Platform Administrator',
    email: 'admin@gmail.com',
    role: 'admin',
    phone: '+91 90000 12345',
    whatsapp: '+91 90000 12345',
    gender: 'Other',
    dob: '1990-01-01',
    displayMode: 'dark',
    lang: 'en',
    profileCompleted: true,
    status: 'active',
    balance: 100000,
    registeredIp: '127.0.0.1',
    lastIp: '127.0.0.1',
    deviceFp: 'fp_admin_master',
    joinedDate: '01 Jan 2026',
    joinedAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    isImmutable: true,
  },
  {
    id: 2,
    uid: '202600001',
    name: 'Rahul Sharma',
    email: 'rahul.demo@gmail.com',
    role: 'customer',
    phone: '+91 98765 43210',
    whatsapp: '+91 98765 43210',
    gender: 'Male',
    dob: '15 Jan 1999',
    displayMode: 'dark',
    lang: 'en',
    profileCompleted: true,
    status: 'active',
    balance: 47260,
    registeredIp: '127.0.0.1',
    lastIp: '127.0.0.1',
    deviceFp: 'fp_rahul_demo',
    joinedDate: '02 Jan 2026',
    joinedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    isImmutable: true,
  },
  {
    id: 3,
    uid: '202600002',
    name: 'Priya Rao',
    email: 'priya.rao@gmail.com',
    role: 'customer',
    phone: '+91 98111 22334',
    whatsapp: '+91 98111 22334',
    gender: 'Female',
    dob: '22 Aug 1997',
    displayMode: 'light',
    lang: 'te',
    profileCompleted: true,
    status: 'suspended',
    balance: 0,
    registeredIp: '49.36.128.9',
    lastIp: '49.36.128.9',
    deviceFp: 'DEV-2F98B110',
    joinedDate: '18 Mar 2026',
    joinedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    isImmutable: true,
  },
  {
    id: 4,
    uid: '202600003',
    name: 'Sneha K',
    email: 'sneha.k@gmail.com',
    role: 'customer',
    phone: '+91 97333 44556',
    whatsapp: '+91 97333 44556',
    gender: 'Female',
    dob: '05 Nov 2001',
    displayMode: 'dark',
    lang: 'hi',
    profileCompleted: true,
    status: 'suspended',
    balance: 0,
    registeredIp: '103.21.58.14',
    lastIp: '103.21.58.14',
    deviceFp: 'DEV-7C21A93F',
    joinedDate: '05 Jun 2026',
    joinedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    isImmutable: true,
  }
];

let suspendedUsers = new Map(); // email/uid -> { reason, suspendedAt, until }
let liveSessions = new Map(); // socket.id -> session data
let securityViolations = [];
let vpnAuditLogs = [];

// Helper to extract client IP accurately
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

// ----------------------------------------------------
// Socket.IO Real-Time Management & Customer-Admin Live Link
// ----------------------------------------------------
io.on('connection', (socket) => {
  const clientIp = socket.handshake.headers['x-forwarded-for']
    ? socket.handshake.headers['x-forwarded-for'].split(',')[0].trim()
    : socket.handshake.address || '127.0.0.1';

  // Record initial session
  liveSessions.set(socket.id, {
    socketId: socket.id,
    ip: clientIp,
    user: null,
    currentPage: 'Home',
    connectedAt: new Date().toISOString(),
    lastActive: Date.now(),
    device: socket.handshake.headers['user-agent'] || 'Web Browser',
  });

  broadcastLiveSessions();

  // Client identifies itself
  socket.on('user:identify', (data) => {
    const session = liveSessions.get(socket.id);
    if (session && data) {
      session.user = {
        name: data.name || 'Guest User',
        email: data.email || 'guest@vouchtrim.app',
        role: data.role || 'customer',
        uid: data.userId || 'GUEST',
      };
      session.currentPage = data.currentPage || session.currentPage;
      session.deviceFp = data.deviceFp || 'DEV-FP';
      session.isVpn = false;
      liveSessions.set(socket.id, session);
      broadcastLiveSessions();

      // Check if this identified user is suspended
      const emailLower = (data.email || '').toLowerCase();
      if (suspendedUsers.has(emailLower) || suspendedUsers.has(data.userId)) {
        const susp = suspendedUsers.get(emailLower) || suspendedUsers.get(data.userId);
        socket.emit('user:banned', {
          email: data.email,
          userId: data.userId,
          reason: susp.reason || 'Account suspended by Administrator',
          ip: clientIp,
        });
      }
    }
  });

  // User navigates views
  socket.on('user:page_change', (page) => {
    const session = liveSessions.get(socket.id);
    if (session) {
      session.currentPage = page;
      session.lastActive = Date.now();
      broadcastLiveSessions();
    }
  });

  // Customer activity event (cart, wallet, orders) for real-time analysis
  socket.on('customer:activity', (activity) => {
    io.emit('admin:customer_activity', {
      ...activity,
      timestamp: new Date().toISOString(),
    });
  });

  // Admin config update broadcast
  socket.on('admin:update_config', (config) => {
    systemSettings = { ...systemSettings, ...config };
    io.emit('system:config_changed', systemSettings);
  });

  // Admin updates editable app texts & contact info
  socket.on('admin:update_texts', (texts) => {
    systemSettings = { ...systemSettings, ...texts };
    io.emit('system:config_changed', systemSettings);
    io.emit('system:texts_updated', texts);
  });

  // Admin edits customer profile details
  socket.on('admin:edit_customer', (data) => {
    if(!data || !data.uid) return;
    let u = users.find(x => x.uid === data.uid || x.email?.toLowerCase() === (data.email || '').toLowerCase());
    if(u) {
      if(data.name !== undefined) u.name = data.name;
      if(data.email !== undefined) u.email = data.email;
      if(data.phone !== undefined) u.phone = data.phone;
      if(data.whatsapp !== undefined) u.whatsapp = data.whatsapp;
      if(data.gender !== undefined) u.gender = data.gender;
      if(data.dob !== undefined) u.dob = data.dob;
      if(data.joinedDate !== undefined) u.joinedDate = data.joinedDate;
      if(data.balance !== undefined) u.balance = Number(data.balance);
      if(data.status !== undefined) u.status = data.status;
      
      // Broadcast profile update to the user and to admin lists
      io.emit('user:profile_updated', u);
      io.emit('admin:users_updated', { users });
      broadcastLiveSessions();
    }
  });

  // Real-time Transaction broadcast
  socket.on('transaction:create', (txnData) => {
    if(!txnData) return;
    const newTxn = {
      id: 'TXN-' + Math.floor(100000 + Math.random() * 900000),
      userId: txnData.userId || '202600001',
      userEmail: txnData.userEmail || 'rahul.demo@gmail.com',
      userName: txnData.userName || 'Rahul Sharma',
      amt: Number(txnData.amt) || 0,
      type: txnData.type || 'credit',
      method: txnData.method || 'UPI',
      label: txnData.label || 'Wallet Transaction',
      status: txnData.status || 'Success',
      time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now()
    };
    globalTransactions.unshift(newTxn);
    if(globalTransactions.length > 200) globalTransactions.pop();
    
    // Broadcast transaction in real-time to everyone (Admin live feed & Customer wallet)
    io.emit('transaction:new', newTxn);
  });

  // Admin suspends user
  socket.on('admin:suspend_user', (data) => {
    if (data && data.email) {
      const emailLower = data.email.toLowerCase();
      suspendedUsers.set(emailLower, {
        reason: data.reason || 'Account access suspended by Administrator.',
        until: data.until || 'permanent',
        suspendedAt: new Date().toISOString(),
      });
      if (data.userId) {
        suspendedUsers.set(data.userId, suspendedUsers.get(emailLower));
      }
      // Broadcast ban notice to the suspended user
      io.emit('user:banned', {
        email: data.email,
        userId: data.userId,
        reason: data.reason || 'Account access suspended by Administrator.',
        ip: clientIp,
      });
      broadcastLiveSessions();
    }
  });

  // Admin reactivates user
  socket.on('admin:reactivate_user', (data) => {
    if (data && data.email) {
      const emailLower = data.email.toLowerCase();
      suspendedUsers.delete(emailLower);
      if (data.userId) suspendedUsers.delete(data.userId);
      io.emit('user:reactivated', {
        email: data.email,
        userId: data.userId,
      });
      broadcastLiveSessions();
    }
  });

  socket.on('disconnect', () => {
    liveSessions.delete(socket.id);
    broadcastLiveSessions();
  });
});

function broadcastLiveSessions() {
  const sessionList = Array.from(liveSessions.values()).map((s) => ({
    socketId: s.socketId,
    ip: s.ip,
    name: s.user?.name || 'Active User',
    email: s.user?.email || '',
    role: s.user?.role || 'customer',
    userId: s.user?.uid || '',
    user: s.user,
    currentPage: s.currentPage,
    connectedAt: s.connectedAt,
    deviceFp: s.deviceFp,
    device: s.device,
    isVpn: false,
    isSuspended: s.user?.email ? suspendedUsers.has(s.user.email.toLowerCase()) : false,
  }));
  io.emit('admin:live_sessions', { sessions: sessionList, count: sessionList.length });
}

// ----------------------------------------------------
// API Endpoints: System & Configuration
// ----------------------------------------------------

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET system settings
app.get('/api/system/settings', (req, res) => {
  res.json({
    settings: systemSettings,
    clientIp: getClientIp(req),
    timestamp: new Date().toISOString(),
  });
});

// POST toggle demo login (Admin action)
app.post('/api/admin/toggle-demo-login', (req, res) => {
  const { enabled } = req.body;
  systemSettings.allowDemoLogin = Boolean(enabled);
  io.emit('system:config_changed', systemSettings);
  res.json({ success: true, allowDemoLogin: systemSettings.allowDemoLogin });
});

// POST update system settings (Admin only - broadcast to all devices)
app.post('/api/system/settings', (req, res) => {
  const newSettings = req.body;
  systemSettings = { ...systemSettings, ...newSettings };
  io.emit('system:config_changed', systemSettings);
  res.json({ success: true, settings: systemSettings });
});

// GET client IP & network diagnostics
app.get('/api/security/client-ip', (req, res) => {
  const ip = getClientIp(req);
  res.json({
    ip,
    isVpn: false,
    timestamp: new Date().toISOString(),
  });
});

// POST simulated VPN violation
app.post('/api/security/vpn-test-simulation', (req, res) => {
  const { email, name, uid, deviceFp, reason, ip } = req.body;
  const clientIp = ip || getClientIp(req);

  const attemptLog = {
    id: 'VPN-' + Date.now(),
    timestamp: new Date().toISOString(),
    ip: clientIp,
    email: email || 'test@vpn.com',
    name: name || 'Test User',
    uid: uid || 'GUEST',
    deviceFp: deviceFp || 'DEV-TEST',
    reason: reason || 'Simulated Test VPN / Proxy Violation',
    actionTaken: 'FLAGGED_TEST',
  };

  vpnAuditLogs.unshift(attemptLog);
  io.emit('security:vpn_alert', attemptLog);
  res.json({ success: true, logged: attemptLog });
});

// ----------------------------------------------------
// API Endpoints: User Management & Mandatory Onboarding
// ----------------------------------------------------

// POST User Onboarding / Profile completion
app.post('/api/users/profile', (req, res) => {
  const { name, email, phone, whatsapp, gender, dob, displayMode, lang, deviceFp, role = 'customer' } = req.body;
  const ip = getClientIp(req);

  if (!email || !name) {
    return res.status(400).json({ error: 'Name and Email are required.' });
  }

  let user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (user) {
    user.name = name;
    user.phone = phone || user.phone;
    user.whatsapp = whatsapp || user.whatsapp;
    user.gender = gender || user.gender;
    user.dob = dob || user.dob;
    user.displayMode = displayMode || 'dark';
    user.lang = lang || 'en';
    user.profileCompleted = true;
    user.isImmutable = true;
    user.lastIp = ip;
  } else {
    // Register new user
    const nextUid = '2026' + String(users.length + 1).padStart(5, '0');
    user = {
      id: users.length + 1,
      uid: nextUid,
      name,
      email,
      role,
      phone: phone || '+91 98765 43210',
      whatsapp: whatsapp || '+91 98765 43210',
      gender: gender || 'Male',
      dob: dob || '1998-05-14',
      displayMode: displayMode || 'dark',
      lang: lang || 'en',
      profileCompleted: true,
      status: 'active',
      registeredIp: ip,
      lastIp: ip,
      deviceFp: deviceFp || 'fp_' + Date.now(),
      joinedAt: new Date().toISOString(),
      isImmutable: true,
    };
    users.push(user);
  }

  io.emit('admin:user_registered', user);
  res.json({ success: true, user });
});

// GET all users (Admin only)
app.get('/api/admin/users', (req, res) => {
  res.json({
    users,
    total: users.length,
    activeCount: users.filter((u) => u.status === 'active').length,
    bannedCount: users.filter((u) => u.status === 'permanently_banned').length,
  });
});

// POST edit user profile (Admin only)
app.post('/api/admin/users/:uid/edit', (req, res) => {
  const { uid } = req.params;
  const { name, email, phone, whatsapp, gender, dob, joinedDate, balance, status } = req.body;
  
  let user = users.find(u => u.uid === uid || u.id === Number(uid));
  if(!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if(name !== undefined) user.name = name;
  if(email !== undefined) user.email = email;
  if(phone !== undefined) user.phone = phone;
  if(whatsapp !== undefined) user.whatsapp = whatsapp;
  if(gender !== undefined) user.gender = gender;
  if(dob !== undefined) user.dob = dob;
  if(joinedDate !== undefined) user.joinedDate = joinedDate;
  if(balance !== undefined) user.balance = Number(balance);
  if(status !== undefined) user.status = status;

  io.emit('user:profile_updated', user);
  io.emit('admin:users_updated', { users });
  broadcastLiveSessions();

  res.json({ success: true, user });
});

// GET all transactions
app.get('/api/transactions', (req, res) => {
  res.json({
    transactions: globalTransactions,
    total: globalTransactions.length
  });
});

// POST new transaction (and broadcast in real-time)
app.post('/api/transactions', (req, res) => {
  const { userId, userEmail, userName, amt, type, method, label, status } = req.body;
  const newTxn = {
    id: 'TXN-' + Math.floor(100000 + Math.random() * 900000),
    userId: userId || '202600001',
    userEmail: userEmail || 'rahul.demo@gmail.com',
    userName: userName || 'Rahul Sharma',
    amt: Number(amt) || 0,
    type: type || 'credit',
    method: method || 'UPI',
    label: label || 'Wallet Transaction',
    status: status || 'Success',
    time: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    timestamp: Date.now()
  };

  globalTransactions.unshift(newTxn);
  if(globalTransactions.length > 200) globalTransactions.pop();

  // If user balance needs update
  const matchingUser = users.find(u => u.uid === newTxn.userId || u.email?.toLowerCase() === newTxn.userEmail.toLowerCase());
  if(matchingUser) {
    if(newTxn.type === 'credit') {
      matchingUser.balance = (matchingUser.balance || 0) + newTxn.amt;
    } else if(newTxn.type === 'debit') {
      matchingUser.balance = Math.max(0, (matchingUser.balance || 0) - newTxn.amt);
    }
    io.emit('wallet:balance_sync', { uid: matchingUser.uid, balance: matchingUser.balance });
  }

  io.emit('transaction:new', newTxn);
  res.json({ success: true, transaction: newTxn });
});

// GET security audit & VPN logs (Admin)
app.get('/api/admin/security-logs', (req, res) => {
  res.json({
    vpnLogs: vpnAuditLogs,
    violations: securityViolations,
    liveSessionsCount: liveSessions.size,
  });
});

// Serve static files
app.use(express.static(__dirname));

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
