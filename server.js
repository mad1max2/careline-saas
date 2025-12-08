// server.js
// CareLine Medical Logistics — Express server + CareLine AI Bus

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

// ============================
// OPENAI CLIENT (AI BUS BRAIN)
// ============================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY || ''
});

// ============================
// BASIC EXPRESS SETUP
// ============================

const app = express();
const PORT = process.env.PORT || 10000;

// Body parsers
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve all static files (HTML, CSS, JS, images) from this folder
app.use(express.static(__dirname));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer for proof-of-delivery photos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const stopId = req.body.stopId || 'unknown';
    const time = Date.now();
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${stopId}_${time}_${safeName}`);
  }
});
const upload = multer({ storage });

// ============================
// FILE PATH HELPERS
// ============================

const ROUTES_FILE       = path.join(__dirname, 'routes.json');
const DELIVERIES_FILE   = path.join(__dirname, 'deliveries.json');
const NOTIFICATIONS_FILE = path.join(__dirname, 'notifications.json');

// generic JSON loader/saver
function loadJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw || 'null') || fallback;
    }
  } catch (err) {
    console.error('Error reading JSON file', filePath, err);
  }
  return fallback;
}

function saveJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing JSON file', filePath, err);
  }
}

// ============================
// SIMPLE AUTH PLACEHOLDER
// (real login/JWT can replace later)
// ============================

function requireUser(req, res, next) {
  // In the future this will come from a token
  const user = req.body && req.body.user ? req.body.user : null;

  if (!user) {
    req.user = { name: 'Guest', role: 'guest' };
  } else {
    req.user = {
      name: user.name || 'Unknown',
      role: user.role || 'guest'
    };
  }

  next();
}

// ============================
// ROUTES API
// ============================

// Get all routes
app.get('/api/routes', (req, res) => {
  const data = loadJson(ROUTES_FILE, { drivers: [], routes: [] });
  res.json(data);
});

// Update a stop status (e.g. Mark Complete)
app.post('/api/update-stop', (req, res) => {
  const { routeId, stopId, status } = req.body || {};

  if (!routeId || !stopId || !status) {
    return res.status(400).json({ success: false, error: 'Missing routeId, stopId, or status' });
  }

  const data = loadJson(ROUTES_FILE, { drivers: [], routes: [] });
  let updated = false;

  data.routes.forEach((route) => {
    if (route.id === routeId || route.routeId === routeId || route.driverId === routeId) {
      (route.stops || []).forEach((stop) => {
        if (stop.stopId === stopId || stop.id === stopId) {
          stop.status = status;
          updated = true;
        }
      });
    }
  });

  if (updated) {
    saveJson(ROUTES_FILE, data);

    // log a notification
    const notifications = loadJson(NOTIFICATIONS_FILE, []);
    notifications.push({
      type: 'stop-status',
      routeId,
      stopId,
      status,
      timestamp: new Date().toISOString()
    });
    saveJson(NOTIFICATIONS_FILE, notifications);

    return res.json({ success: true });
  }

  return res.status(404).json({ success: false, error: 'Stop not found' });
});

// ============================
// PROOF-OF-DELIVERY UPLOAD
// ============================

app.post('/upload-proof', upload.single('photo'), (req, res) => {
  const { stopId } = req.body || {};
  const file = req.file;

  if (!stopId || !file) {
    return res.status(400).json({ success: false, error: 'Missing stopId or file' });
  }

  const deliveries = loadJson(DELIVERIES_FILE, []);
  deliveries.push({
    stopId,
    file: file.filename,
    path: `/uploads/${file.filename}`,
    timestamp: new Date().toISOString()
  });

  saveJson(DELIVERIES_FILE, deliveries);

  // Also log notification
  const notifications = loadJson(NOTIFICATIONS_FILE, []);
  notifications.push({
    type: 'proof-upload',
    stopId,
    file: file.filename,
    timestamp: new Date().toISOString()
  });
  saveJson(NOTIFICATIONS_FILE, notifications);

  return res.json({ success: true, file: file.filename });
});

// ============================
// NOTIFICATION LOG API
// ============================

// Generic notification hook (SMS/email placeholder)
app.post('/api/notify', (req, res) => {
  const { kind, to, message, meta } = req.body || {};

  const notifications = loadJson(NOTIFICATIONS_FILE, []);
  notifications.push({
    type: kind || 'generic',
    to: to || null,
    message: message || '',
    meta: meta || {},
    timestamp: new Date().toISOString()
  });
  saveJson(NOTIFICATIONS_FILE, notifications);

  // This is where real SMS/email integrations (Twilio, SendGrid) would go.
  res.json({ success: true });
});

// Get notifications (for notifications.html + facility-summary.html)
app.get('/api/notifications', (req, res) => {
  const notifications = loadJson(NOTIFICATIONS_FILE, []);
  res.json({ success: true, notifications });
});

// ============================
// VOICE LOGIN API (AI BUS)
// ============================

app.post('/api/voice-login', (req, res) => {
  let name = (req.body.name || '').toLowerCase().trim();

  const admins = {
    'keith worthington': { role: 'admin', displayName: 'Keith' },
    'lena horton': { role: 'admin', displayName: 'Lena' },
    'nyjhai worthington': { role: 'admin', displayName: 'Nyjhai' }
  };

  const match = admins[name];
  if (!match) {
    return res.json({ success: false });
  }

  // In the future we will generate a JWT.
  const fakeToken = 'VOICE-' + Date.now();

  res.json({
    success: true,
    role: match.role,
    displayName: match.displayName,
    token: fakeToken
  });
});

// ============================
// SIMPLE AI ENDPOINT (OPTIONAL)
// CareLine bus can answer questions about routes / ops
// ============================

app.post('/api/ai-admin', async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ success: false, error: 'Missing prompt' });
  }

  if (!openai.apiKey) {
    return res.status(500).json({ success: false, error: 'AI not configured (no API key)' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are the CareLine Operations AI Bus. Be concise, friendly, and focused on logistics, wound-care delivery, and accountability.'
        },
        { role: 'user', content: prompt }
      ]
    });

    const answer = completion.choices[0].message.content;
    res.json({ success: true, answer });
  } catch (err) {
    console.error('AI error', err);
    res.status(500).json({ success: false, error: 'AI request failed' });
  }
});

// ============================
// ROOT ROUTE
// ============================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================
// START SERVER
// ============================

app.listen(PORT, () => {
  console.log(`CareLine server running on port ${PORT}`);
});
