// =======================================
// CARELINE MEDICAL LOGISTICS — SERVER.JS
// Live GPS + ETA + Notifications + SMS Hooks
// =======================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;
const BASE_URL = process.env.BASE_URL || 'https://careline-api-1.onrender.com';

// -------------------------------
// MIDDLEWARE
// -------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// -------------------------------
// STATIC HOSTING (HTML, CSS, JS)
// -------------------------------
app.use(express.static(__dirname));

// -------------------------------
// FILE PATHS
// -------------------------------
const ROUTES_FILE = path.join(__dirname, 'routes.json');
const GPS_FILE = path.join(__dirname, 'gps.json');
const NOTIFY_FILE = path.join(__dirname, 'notifications.json');

// -------------------------------
// SAFE JSON HELPERS
// -------------------------------
function safeLoadJSON(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (raw.trim().length > 0) {
        return JSON.parse(raw);
      }
    }
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err);
  }
  return fallback;
}

function safeSaveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error saving ${filePath}:`, err);
  }
}

// -------------------------------
// LOAD / SAVE SPECIFIC FILES
// -------------------------------
function loadRoutes() {
  return safeLoadJSON(ROUTES_FILE, { drivers: [], routes: [] });
}
function saveRoutes(data) {
  safeSaveJSON(ROUTES_FILE, data);
}

function loadGps() {
  return safeLoadJSON(GPS_FILE, { drivers: {} });
}
function saveGps(data) {
  safeSaveJSON(GPS_FILE, data);
}

function loadNotifications() {
  return safeLoadJSON(NOTIFY_FILE, { notifications: [] });
}
function saveNotifications(data) {
  safeSaveJSON(NOTIFY_FILE, data);
}

// -------------------------------
// HELPERS: FIND STOP, DISTANCE, ETA
// -------------------------------
function findStopById(stopId) {
  const routes = loadRoutes();
  for (const route of routes.routes) {
    for (const stop of route.stops) {
      if (stop.stopId === stopId) {
        const driver = routes.drivers.find((d) => d.id === route.driverId);
        return { stop, driver, route, routes };
      }
    }
  }
  return null;
}

// Haversine distance (km)
function haversineKm(lat1, lon1, lat2, lon2) {
  function toRad(v) { return (v * Math.PI) / 180; }
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Compute ETA in minutes
function computeEtaMinutes(driverGps, stop, avgKmh = 40) {
  if (!driverGps || typeof stop.lat !== 'number' || typeof stop.lng !== 'number') return null;
  const distKm = haversineKm(driverGps.lat, driverGps.lng, stop.lat, stop.lng);
  if (!distKm || !isFinite(distKm)) return null;
  const hours = distKm / avgKmh;
  return Math.max(1, Math.round(hours * 60));
}

// =======================================
// NOTIFICATION TEMPLATES
// =======================================
function buildNotificationTemplates(eventType, driverId, stop, extra = {}) {
  const patientName = stop.patientName || 'the patient';
  const facilityName = stop.location || 'your facility';
  const trackingUrl = `${BASE_URL}/track.html?stopId=${encodeURIComponent(stop.stopId)}`;

  const base = {
    eventType,
    stopId: stop.stopId,
    driverId,
    patientName,
    facilityName,
    trackingUrl,
  };

  if (eventType === 'status_change') {
    const status = stop.status || 'Updated';

    return {
      ...base,
      subjectPatient: `CareLine update: your delivery is now "${status}"`,
      bodyPatient:
        `Hello ${patientName},\n\n` +
        `Your CareLine delivery for ${facilityName} is now "${status}".\n` +
        `You can track your driver in real time here:\n${trackingUrl}\n\n` +
        `CareLine Medical Logistics\n` +
        `"Care That Moves. Logistics That Deliver."`,

      subjectFacility: `CareLine status update for patient delivery (${status})`,
      bodyFacility:
        `Hello,\n\n` +
        `The CareLine delivery for ${patientName} at ${facilityName} is now "${status}".\n` +
        `Track this delivery here:\n${trackingUrl}\n\n` +
        `CareLine Medical Logistics`,

      subjectAdmin: `STATUS ${status} — ${stop.stopId}`,
      bodyAdmin:
        `Stop: ${stop.stopId}\n` +
        `Patient: ${patientName}\n` +
        `Facility: ${facilityName}\n` +
        `Status: ${status}\n` +
        `Tracking: ${trackingUrl}\n\n` +
        `(Logged in notifications.json)`,
    };
  }

  if (eventType === 'proof_uploaded') {
    const proofFile = extra.proofFile || '(file path unknown)';

    return {
      ...base,
      subjectPatient: `CareLine: your delivery has been completed`,
      bodyPatient:
        `Hello ${patientName},\n\n` +
        `Your CareLine delivery for ${facilityName} has been completed.\n` +
        `Thank you for choosing CareLine Medical Logistics.\n\n` +
        `Care That Moves. Logistics That Deliver.`,

      subjectFacility: `Proof of delivery available for ${patientName}`,
      bodyFacility:
        `Hello,\n\n` +
        `Proof of delivery has been uploaded for patient ${patientName} at ${facilityName}.\n` +
        `Internal file: ${proofFile}\n\n` +
        `CareLine Medical Logistics`,

      subjectAdmin: `POD UPLOADED — ${stop.stopId}`,
      bodyAdmin:
        `Stop: ${stop.stopId}\n` +
        `Patient: ${patientName}\n` +
        `Facility: ${facilityName}\n` +
        `Proof file: ${proofFile}\n\n` +
        `(Logged in notifications.json)`,
    };
  }

  // fallback
  return {
    ...base,
    subjectAdmin: `CareLine event: ${eventType}`,
    bodyAdmin: `Event ${eventType} for stop ${stop.stopId} at ${facilityName}.`,
  };
}

function registerNotification(eventType, driverId, stop, extra = {}) {
  const templates = buildNotificationTemplates(eventType, driverId, stop, extra);

  const logData = loadNotifications();
  logData.notifications.push({
    id: Date.now().toString(),
    eventType,
    driverId,
    stopId: stop.stopId,
    status: stop.status || null,
    extra,
    templates,
    createdAt: new Date().toISOString(),
  });
  saveNotifications(logData);
}

// =======================================
// 1) ROUTES & STOP STATUS
// =======================================

// Return routes.json
app.get('/routes.json', (req, res) => {
  const data = loadRoutes();
  res.json(data);
});

// Update stop status
app.post('/update-stop', (req, res) => {
  const { stopId, status } = req.body;

  if (!stopId || !status) {
    return res.status(400).json({ success: false, error: 'Missing stopId or status' });
  }

  const data = loadRoutes();
  let updatedStop = null;
  let driverId = null;

  try {
    data.routes.forEach((route) => {
      route.stops.forEach((stop) => {
        if (stop.stopId === stopId) {
          stop.status = status;
          updatedStop = stop;
          driverId = route.driverId;
        }
      });
    });

    if (!updatedStop) {
      return res.status(404).json({ success: false, error: 'Stop not found' });
    }

    saveRoutes(data);

    // Hook: log notification when status changes
    registerNotification('status_change', driverId, updatedStop);

    res.json({ success: true, stopId, status });
  } catch (err) {
    console.error('Error updating stop:', err);
    res.status(500).json({ success: false });
  }
});

// =======================================
// 2) PROOF OF DELIVERY UPLOAD
// =======================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });

app.post('/upload-proof', upload.single('file'), (req, res) => {
  const stopId = req.body.stopId;

  if (!req.file || !stopId) {
    return res.status(400).json({ success: false, error: 'Missing file or stopId' });
  }

  const newFilePath = path.join(uploadDir, `${stopId}.jpg`);

  try {
    fs.renameSync(req.file.path, newFilePath);

    // Hook: log notification for proof uploaded
    const routes = loadRoutes();
    let stop = null;
    let driverId = null;

    routes.routes.forEach((route) => {
      route.stops.forEach((s) => {
        if (s.stopId === stopId) {
          stop = s;
          driverId = route.driverId;
        }
      });
    });

    if (stop) {
      registerNotification('proof_uploaded', driverId, stop, {
        proofFile: `/uploads/${stopId}.jpg`,
      });
    }

    res.json({ success: true, stopId });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false });
  }
});

// =======================================
// 3) REAL-TIME GPS ENDPOINTS
// =======================================

// Driver sends GPS
app.post('/api/location', (req, res) => {
  const { driverId, lat, lng } = req.body;

  if (!driverId || typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({
      success: false,
      error: 'driverId, lat, lng required',
    });
  }

  const gps = loadGps();
  gps.drivers[driverId] = {
    lat,
    lng,
    updated: new Date().toISOString(),
  };

  saveGps(gps);
  res.json({ success: true });
});

// All GPS data
app.get('/gps.json', (req, res) => {
  const gps = loadGps();
  res.json(gps);
});

// Single driver GPS
app.get('/api/location/:driverId', (req, res) => {
  const driverId = req.params.driverId;
  const gps = loadGps();

  if (!gps.drivers[driverId]) {
    return res.status(404).json({ success: false, error: 'No location for this driver' });
  }

  res.json({ success: true, location: gps.drivers[driverId] });
});

// =======================================
// 4) STOP DETAILS + ETA + SHARE LINK
// =======================================
app.get('/api/stop/:stopId', (req, res) => {
  const stopId = req.params.stopId;
  const found = findStopById(stopId);

  if (!found) {
    return res.status(404).json({ success: false, error: 'Stop not found' });
  }

  const gps = loadGps();
  const liveLocation =
    found.driver && gps.drivers[found.driver.id]
      ? gps.drivers[found.driver.id]
      : null;

  const etaMinutes = liveLocation
    ? computeEtaMinutes(liveLocation, found.stop)
    : null;

  const trackingUrl = `${BASE_URL}/track.html?stopId=${encodeURIComponent(stopId)}`;

  res.json({
    success: true,
    stop: found.stop,
    driver: found.driver || null,
    liveLocation,
    etaMinutes,
    trackingUrl,
  });
});

app.get('/api/share-link/:stopId', (req, res) => {
  const stopId = req.params.stopId;
  const found = findStopById(stopId);

  if (!found) {
    return res.status(404).json({ success: false, error: 'Stop not found' });
  }

  const trackingUrl = `${BASE_URL}/track.html?stopId=${encodeURIComponent(stopId)}`;
  res.json({ success: true, stopId, trackingUrl });
});

// =======================================
// 5) NOTIFICATIONS APIs + SMS/EMAIL HOOKS
// =======================================

// Full log (for admin)
app.get('/api/notifications', (req, res) => {
  const data = loadNotifications();
  res.json(data);
});

// Templates (status_change) for front-end use
app.get('/api/notify-templates/:stopId', (req, res) => {
  const stopId = req.params.stopId;
  const found = findStopById(stopId);
  if (!found) {
    return res.status(404).json({ success: false, error: 'Stop not found' });
  }
  const templates = buildNotificationTemplates('status_change', found.route.driverId, found.stop);
  res.json({ success: true, stopId, templates });
});

// "Pretend" send SMS to patient — Twilio-ready hook
app.post('/api/send-sms', (req, res) => {
  const { stopId, phone } = req.body;

  if (!stopId || !phone) {
    return res.status(400).json({ success: false, error: 'stopId and phone are required' });
  }

  const found = findStopById(stopId);
  if (!found) {
    return res.status(404).json({ success: false, error: 'Stop not found' });
  }

  const templates = buildNotificationTemplates('status_change', found.route.driverId, found.stop);
  const smsText = templates.bodyPatient.replace(/\n+/g, ' '); // flatten for SMS

  const logData = loadNotifications();
  logData.notifications.push({
    id: Date.now().toString(),
    eventType: 'sms_sent',
    driverId: found.route.driverId,
    stopId,
    phone,
    smsText,
    createdAt: new Date().toISOString(),
  });
  saveNotifications(logData);

  // THIS is where Twilio would actually send the SMS in the future.
  // For now, we just log & return.
  res.json({ success: true, phone, smsText });
});

// "Pretend" send facility email — SendGrid-ready hook
app.post('/api/send-facility-email', (req, res) => {
  const { stopId, email } = req.body;

  if (!stopId || !email) {
    return res.status(400).json({ success: false, error: 'stopId and email are required' });
  }

  const found = findStopById(stopId);
  if (!found) {
    return res.status(404).json({ success: false, error: 'Stop not found' });
  }

  const templates = buildNotificationTemplates('status_change', found.route.driverId, found.stop);

  const emailPayload = {
    to: email,
    subject: templates.subjectFacility,
    body: templates.bodyFacility,
  };

  const logData = loadNotifications();
  logData.notifications.push({
    id: Date.now().toString(),
    eventType: 'facility_email_sent',
    driverId: found.route.driverId,
    stopId,
    email,
    emailPayload,
    createdAt: new Date().toISOString(),
  });
  saveNotifications(logData);

  // THIS is where SendGrid / SMTP would send the email in the future.
  res.json({ success: true, email, emailPayload });
});

// =======================================
// 6) FALLBACK: SERVE HTML OR 404
// =======================================
app.use((req, res) => {
  const target = path.join(__dirname, req.path);

  if (fs.existsSync(target) && target.endsWith('.html')) {
    return res.sendFile(target);
  }

  res.status(404).send(`Cannot GET ${req.path}`);
});

// =======================================
// START SERVER
// =======================================
app.listen(PORT, () => {
  console.log(`🚚 CareLine server running on port ${PORT}`);
});
