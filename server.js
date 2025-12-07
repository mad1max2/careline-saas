// ==============================
// CARELINE MASTER SERVER.JS
// ==============================

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'careline_super_secret_key';

app.use(express.json());
app.use(express.static(__dirname));

// ==============================
// USER DATABASE STORAGE
// ==============================

const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// ==============================
// PASSWORD SECURITY
// ==============================

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
    .toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const verify = crypto
    .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
    .toString('hex');
  return verify === hash;
}

// ==============================
// AUTH MIDDLEWARE
// ==============================

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, error: 'No token' });

  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ success: false, error: 'Invalid token' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
}

// ==============================
// LOGIN API
// ==============================

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const data = loadUsers();
  const users = data.users || [];
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    return res.status(401).json({ success: false, error: 'Invalid login' });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    token,
    user: { id: user.id, email: user.email, role: user.role }
  });
});

// ==============================
// ✅ USER MANAGEMENT (Admin Only)
// ==============================

// LIST USERS
app.get('/api/users', requireAuth, requireRole(['admin']), (req, res) => {
  const data = loadUsers();
  const safeUsers = (data.users || []).map(u => ({
    id: u.id,
    email: u.email,
    role: u.role
  }));
  res.json({ success: true, users: safeUsers });
});

// CREATE USER
app.post('/api/users', requireAuth, requireRole(['admin']), (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password || !role) {
    return res.status(400).json({ success: false, error: 'email, password, role required' });
  }

  const data = loadUsers();
  const users = data.users || [];

  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ success: false, error: 'User already exists' });
  }

  const { salt, hash } = hashPassword(password);
  const newUser = {
    id: `user_${Date.now()}`,
    email,
    role,
    salt,
    hash
  };

  users.push(newUser);
  saveUsers({ users });

  res.json({
    success: true,
    user: { id: newUser.id, email: newUser.email, role: newUser.role }
  });
});

// UPDATE USER
app.put('/api/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const userId = req.params.id;
  const { role, password } = req.body || {};

  const data = loadUsers();
  const users = data.users || [];
  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  if (role) user.role = role;

  if (password) {
    const { salt, hash } = hashPassword(password);
    user.salt = salt;
    user.hash = hash;
  }

  saveUsers({ users });

  res.json({
    success: true,
    user: { id: user.id, email: user.email, role: user.role }
  });
});

// DELETE USER
app.delete('/api/users/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const userId = req.params.id;

  const data = loadUsers();
  const users = data.users || [];
  const filtered = users.filter(u => u.id !== userId);

  if (filtered.length === users.length) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  saveUsers({ users: filtered });
  res.json({ success: true, deletedId: userId });
});

// ==============================
// DEFAULT ROUTE
// ==============================

app.get('/', (req, res) => {
  res.send('CareLine API is running');
});

// ==============================
// START SERVER
// ==============================

app.listen(PORT, () => {
  console.log(`✅ CareLine API running on port ${PORT}`);
});
