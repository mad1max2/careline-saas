// =======================================
// CARELINE MEDICAL LOGISTICS — SERVER.JS
// =======================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;

// Allow JSON body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===============================
// STATIC HOSTING (Serve HTML/CSS)
// ===============================
app.use(express.static(__dirname));

// ===============================
// ROUTES.JSON ENDPOINTS
// ===============================

// Return routes.json
app.get('/routes.json', (req, res) => {
  const filePath = path.join(__dirname, 'routes.json');
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to load routes.json' });
  }
});

// Update stop status
app.post('/update-stop', (req, res) => {
  const { stopId, status } = req.body;
  if (!stopId || !status) {
    return res.status(400).json({ success: false, error: "Missing stopId or status" });
  }

  const filePath = path.join(__dirname, 'routes.json');

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    data.routes.forEach(route => {
      route.stops.forEach(stop => {
        if (stop.stopId === stopId) {
          stop.status = status;
        }
      });
    });

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true, stopId, status });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// ===============================
// PROOF OF DELIVERY UPLOAD
// ===============================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });

app.post('/upload-proof', upload.single('file'), (req, res) => {
  const stopId = req.body.stopId;

  if (!req.file || !stopId) {
    return res.status(400).json({ success: false, error: 'Missing file or stopId' });
  }

  // Rename file so it matches stopId
  const newFilePath = path.join(uploadDir, `${stopId}.jpg`);

  try {
    fs.renameSync(req.file.path, newFilePath);
    res.json({ success: true, stopId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// ===============================
// REAL-TIME GPS LOCATION ENDPOINT
// ===============================
// Frontend hits: POST /api/location  { driverId, lat, lng }

app.post('/api/location', (req, res) => {
  const { driverId, lat, lng } = req.body;

  if (!driverId || !lat || !lng) {
    return res.status(400).json({ success: false, error: "Missing GPS fields" });
  }

  const gpsFile = path.join(__dirname, 'gps.json');

  let data = { drivers: {} };
  if (fs.existsSync(gpsFile)) {
    data = JSON.parse(fs.readFileSync(gpsFile, 'utf8'));
  }

  data.drivers[driverId] = {
    lat,
    lng,
    updated: new Date().toISOString()
  };

  fs.writeFileSync(gpsFile, JSON.stringify(data, null, 2));

  res.json({ success: true });
});

// ===============================
// FALLBACK (Render-Safe)
// SERVE ANY .html FILE DIRECTLY
// ===============================

app.use((req, res) => {
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
  console.log(`CareLine server running on port ${PORT}`);
});
