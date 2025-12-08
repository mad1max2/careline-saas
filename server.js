// server.js
// CareLine Medical Logistics — Express server + CareLine AI Bus (Levels A + B)

'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();
const OpenAI = require('openai');

// ---------- OpenAI client (SAFE: key only from .env) ----------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();
const PORT = process.env.PORT || 10000;

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve all static files (HTML, CSS, JS, images) from this folder
app.use(express.static(__dirname));

// ---------- File paths ----------
const ROUTES_FILE = path.join(__dirname, 'routes.json');
const DELIVERIES_FILE = path.join(__dirname, 'deliveries.json');
const NOTIFICATIONS_FILE = path.join(__dirname, 'notifications.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// ensure uploads folder
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

// ---------- Helpers ----------
function safeReadJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading JSON from', filePath, err);
    return fallback;
  }
}

function safeWriteJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing JSON to', filePath, err);
  }
}

// simple notification logger so notifications.html & facility-summary.html can read
function logNotification(event) {
  const now = new Date().toISOString();
  const data = safeReadJSON(NOTIFICATIONS_FILE, { events: [] });
  data.events.push({
    id: 'evt_' + Date.now(),
    time: now,
    ...event
  });
  safeWriteJSON(NOTIFICATIONS_FILE, data);
}

// ---------- Multer for proof uploads ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${ts}_${safeName}`);
  }
});
const upload = multer({ storage });

// ======================================================
// BASIC API: routes, stops, tracking, notifications
// ======================================================

// Get all routes (driver + stops) for driver screens + map
app.get('/api/routes', (req, res) => {
  const data = safeReadJSON(ROUTES_FILE, { drivers: [], routes: [] });
  res.json({ success: true, ...data });
});

// Update a stop status (driver-stops, proof-upload, control-center)
app.post('/api/update-stop', (req, res) => {
  const { routeId, stopId, status } = req.body || {};
  if (!routeId || !stopId || !status) {
    return res.status(400).json({ success: false, error: 'routeId, stopId, status required' });
  }

  const data = safeReadJSON(ROUTES_FILE, { drivers: [], routes: [] });
  const route = data.routes.find(r => r.id === routeId);
  if (!route) {
    return res.status(404).json({ success: false, error: 'Route not found' });
  }

  const stop = route.stops.find(s => s.stopId === stopId);
  if (!stop) {
    return res.status(404).json({ success: false, error: 'Stop not found' });
  }

  stop.status = status;

  safeWriteJSON(ROUTES_FILE, data);

  // log notification event
  logNotification({
    type: 'stop_status',
    channel: 'system',
    facility: stop.location || null,
    routeId,
    stopId,
    status
  });

  res.json({ success: true, routeId, stopId, status });
});

// Proof upload from proof-upload.html
app.post('/proof-upload', upload.single('proof'), (req, res) => {
  const { routeId, stopId } = req.body || {};
  if (!routeId || !stopId || !req.file) {
    return res.status(400).send('Missing routeId, stopId or file');
  }

  const data = safeReadJSON(ROUTES_FILE, { drivers: [], routes: [] });
  const route = data.routes.find(r => r.id === routeId);
  if (!route) return res.status(404).send('Route not found');

  const stop = route.stops.find(s => s.stopId === stopId);
  if (!stop) return res.status(404).send('Stop not found');

  stop.status = 'Delivered';
  stop.proofFile = req.file.filename;

  safeWriteJSON(ROUTES_FILE, data);

  logNotification({
    type: 'proof_upload',
    channel: 'system',
    facility: stop.location || null,
    routeId,
    stopId,
    file: req.file.filename
  });

  res.redirect(`/route-report.html?routeId=${encodeURIComponent(routeId)}`);
});

// Tracking endpoint for public track.html links (patients / facilities)
app.get('/api/track/:stopId', (req, res) => {
  const { stopId } = req.params;
  const data = safeReadJSON(ROUTES_FILE, { drivers: [], routes: [] });

  let foundRoute = null;
  let foundStop = null;
  let driver = null;

  for (const route of data.routes) {
    const s = route.stops.find(st => st.stopId === stopId);
    if (s) {
      foundRoute = route;
      foundStop = s;
      driver = (data.drivers || []).find(d => d.id === route.driverId) || null;
      break;
    }
  }

  if (!foundRoute || !foundStop) {
    return res.status(404).json({ success: false, error: 'Stop not found' });
  }

  res.json({
    success: true,
    stop: foundStop,
    route: {
      id: foundRoute.id,
      name: foundRoute.name || '',
      driverId: foundRoute.driverId
    },
    driver
  });
});

// Simple ETA calculator placeholder
app.get('/api/eta/:stopId', (req, res) => {
  // For now, just a fake ETA. Later you can plug in real distance matrix APIs.
  res.json({
    success: true,
    etaMinutes: 18,
    note: 'Sample ETA — plug in real mapping API later.'
  });
});

// Notifications API (timeline + filters)
app.get('/api/notifications', (req, res) => {
  const { facility, type, from, to } = req.query || {};
  let data = safeReadJSON(NOTIFICATIONS_FILE, { events: [] });
  let events = data.events;

  if (facility) {
    events = events.filter(e =>
      (e.facility || '').toLowerCase().includes(facility.toLowerCase())
    );
  }
  if (type) {
    events = events.filter(e => (e.type || '') === type);
  }
  if (from) {
    events = events.filter(e => e.time >= from);
  }
  if (to) {
    events = events.filter(e => e.time <= to);
  }

  res.json({ success: true, events });
});

// ======================================================
// AI BUS BRAIN — Levels A & B (identity + smart replies)
// ======================================================

// Voice identity: called by admin-voice.html after speech-to-text on browser
app.post('/api/ai/identify-admin', async (req, res) => {
  try {
    const { transcript } = req.body || {};
    if (!transcript) {
      return res.status(400).json({ success: false, error: 'transcript required' });
    }

    // VERY SIMPLE matcher — you already control who the 3 admins are
    const lowered = transcript.toLowerCase();

    let admin = {
      id: 'unknown',
      name: 'Admin',
      role: 'admin'
    };

    if (lowered.includes('keith') || lowered.includes('max') || lowered.includes('mad max')) {
      admin = { id: 'keith', name: 'Keith Worthington', role: 'owner' };
    } else if (lowered.includes('lena')) {
      admin = { id: 'lena', name: 'Lena Horton', role: 'admin' };
    } else if (lowered.includes('nyjhai') || lowered.includes('nyghai') || lowered.includes('jy')) {
      admin = { id: 'nyjhai', name: 'Nyjhai Worthington', role: 'junior_admin' };
    }

    // Friendly greeting text (front-end will speak it out loud)
    const greeting = `Hey ${admin.name}, your CareLine bus is online and ready. What do you want to check — routes, facilities, or notifications?`;

    res.json({
      success: true,
      admin,
      greeting
    });
  } catch (err) {
    console.error('identify-admin error', err);
    res.status(500).json({ success: false, error: 'AI identify error' });
  }
});

// General admin assistant chat (text) — control-center.html or admin console
app.post('/api/ai/admin-chat', async (req, res) => {
  try {
    const { admin, message } = req.body || {};
    if (!message) {
      return res.status(400).json({ success: false, error: 'message required' });
    }

    const name = admin?.name || 'Admin';
    const role = admin?.role || 'admin';

    const systemPrompt = `
You are the CareLine AI Bus, an assistant for CareLine Medical Logistics in Maryland.
Speak like a smart, friendly operations partner. You help with:

- wound-care & incontinence delivery operations,
- driver performance and routes,
- facility communication,
- HIPAA-aware logistics (NO PHI in answers),
- LLC + small business structure basics (NOT legal or tax advice).

You are currently talking to: ${name} (${role}).

Rules:
- Keep answers short, clear, and practical.
- If question sounds like legal/tax/medical advice, remind them to talk to a professional.
- You can reference "drivers", "routes.json", "notifications.html" and "CareLine app" as tools they use.
    `.trim();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 400
    });

    const reply = completion.choices?.[0]?.message?.content || "I'm not sure, but let's check your dashboard and routes.";

    res.json({
      success: true,
      reply
    });
  } catch (err) {
    console.error('admin-chat error', err);
    res.status(500).json({ success: false, error: 'AI chat error' });
  }
});

// ======================================================
// USERS (simple admin list — future expansion)
// ======================================================
app.get('/api/users', (req, res) => {
  const data = safeReadJSON(USERS_FILE, { users: [] });
  res.json({ success: true, users: data.users });
});

// ======================================================
// 404 FALLBACK (NO wildcard path — avoids path-to-regexp bug)
// ======================================================
app.use((req, res) => {
  res.status(404).send('Not Found');
});

// ======================================================
// START SERVER
// ======================================================
app.listen(PORT, () => {
  console.log(`CareLine server running on port ${PORT}`);
});
