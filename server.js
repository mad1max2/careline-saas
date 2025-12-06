// ================================
// CareLine Medical Logistics Server
// ================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;

// -------------------------------
// MIDDLEWARE
// -------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// -------------------------------
// STATIC HOSTING
// Serves ALL .html, .css, .js files
// -------------------------------
app.use(express.static(path.join(__dirname)));


// ===========================
// ROUTES.JSON SAFE LOADING
// ===========================
const ROUTES_FILE = path.join(__dirname, 'routes.json');

function loadRoutes() {
  try {
    if (fs.existsSync(ROUTES_FILE)) {
      const raw = fs.readFileSync(ROUTES_FILE, 'utf8');
      if (raw.trim().length > 0) {
        return JSON.parse(raw);
      }
    }
  } catch (err) {
    console.error("Error loading routes.json:", err);
  }
  return { drivers: [], routes: [] };
}

function saveRoutes(data) {
  try {
    fs.writeFileSync(ROUTES_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error saving routes.json:", err);
  }
}


// ===============================
// UPDATE STOP STATUS (MARK COMPLETE)
// ===============================
app.post('/update-stop', (req, res) => {
  const { driverId, stopId, status } = req.body;

  if (!driverId || !stopId) {
    return res.status(400).json({ success: false, message: "Missing driverId or stopId" });
  }

  try {
    const data = loadRoutes();

    data.routes.forEach(route => {
      if (route.driverId === driverId) {
        route.stops.forEach(stop => {
          if (stop.stopId === stopId) {
            stop.status = status || "Completed";
          }
        });
      }
    });

    saveRoutes(data);
    res.json({ success: true });

  } catch (err) {
    console.error("Stop update error:", err);
    res.status(500).json({ success: false });
  }
});


// ===============================
// PROOF UPLOAD HANDLING
// ===============================
const upload = multer({ dest: path.join(__dirname, 'uploads') });

app.post('/upload-proof', upload.single('proof'), (req, res) => {
  try {
    const stopId = req.body.stopId || "unknown_stop";
    const filePath = path.join(__dirname, 'uploads', `${stopId}.jpg`);

    fs.renameSync(req.file.path, filePath);

    res.send(`
      <h2>Upload successful</h2>
      <p>Proof saved for stop ${stopId}</p>
      <a href="/driver-route.html">Back to Route</a>
    `);

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).send("Upload failed");
  }
});


// ===============================
// LIVE GPS TRACKING STORAGE
// ===============================
const LOCATIONS_FILE = path.join(__dirname, 'locations.json');

function loadLocations() {
  try {
    if (fs.existsSync(LOCATIONS_FILE)) {
      const raw = fs.readFileSync(LOCATIONS_FILE, 'utf8');
      if (raw.trim().length > 0) return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error loading locations.json:", err);
  }
  return { locations: [] };
}

function saveLocations(data) {
  try {
    fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error saving locations.json:", err);
  }
}


// ===============================
// DRIVER POSTS GPS → SERVER
// ===============================
app.post('/api/location', (req, res) => {
  const { driverId, lat, lng, speed, heading } = req.body || {};

  if (!driverId || typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({
      success: false,
      message: "driverId, lat, and lng required"
    });
  }

  const data = loadLocations();
  const now = new Date().toISOString();

  const record = {
    driverId,
    lat,
    lng,
    speed: speed || null,
    heading: heading || null,
    updatedAt: now
  };

  const index = data.locations.findIndex(l => l.driverId === driverId);
  if (index === -1) data.locations.push(record);
  else data.locations[index] = record;

  saveLocations(data);
  res.json({ success: true });
});


// ===============================
// CONTROL CENTER GETS LIVE GPS
// ===============================
app.get('/api/location/:driverId', (req, res) => {
  const driverId = req.params.driverId;

  const data = loadLocations();
  const found = data.locations.find(l => l.driverId === driverId);

  if (!found) {
    return res.status(404).json({
      success: false,
      message: "No live location for this driver yet"
    });
  }

  res.json({ success: true, location: found });
});


// ===============================
// FALLBACK: SERVE ANY .html FILE
// ===============================
app.get('*', (req, res) => {
  const target = path.join(__dirname, req.path);

  if (fs.existsSync(target) && target.endsWith('.html')) {
    return res.sendFile(target);
  }

  res.status(404).send(`Cannot GET ${req.path}`);
});


// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`🚚 CareLine server running on port ${PORT}`);
});
