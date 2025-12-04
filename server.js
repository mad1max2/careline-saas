const express = require('express');
const multer  = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static files (HTML, routes.json, etc.)
app.use(express.static(__dirname));

// Serve uploads
app.use('/uploads', express.static('uploads'));

// Make sure uploads/ exists
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// ------------------------------
// Load deliveries.json
// ------------------------------
const DB_FILE = './deliveries.json';

let db = { deliveries: [] };

if (fs.existsSync(DB_FILE)) {
  try {
    const raw = fs.readFileSync(DB_FILE);
    db = JSON.parse(raw);
    if (!db.deliveries) db = { deliveries: [] };
  } catch (err) {
    console.error("❌ Error loading JSON, resetting file.");
    db = { deliveries: [] };
  }
}

// ------------------------------
// Multer Storage
// ------------------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Helper: make a tracking code like CL-7F2K9Q
function generateTrackingCode() {
  return 'CL-' + Date.now().toString(36).toUpperCase().slice(-6);
}

// ------------------------------
// Upload Proof API
// ------------------------------
app.post('/uploadProof', upload.single('photo'), (req, res) => {
  const trackingCode = generateTrackingCode();

  const entry = {
    stopId: req.body.stopId,
    trackingCode,
    timestamp: req.body.timestamp,
    lat: req.body.lat,
    lng: req.body.lng,
    driverName: req.body.driverName || 'CareLine Driver',
    facilityName: req.body.facilityName || '',
    status: req.body.status || 'Delivered',
    unableReason: req.body.unableReason || '', // 🔹 NEW: store unableReason
    fileUrl: `http://localhost:3000/uploads/${req.file.filename}`
  };

  db.deliveries.push(entry);
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

  console.log("📸 Saved Proof:", entry);

  res.json(entry);
});

// Get proof by stop ID (internal/debug)
app.get('/getProof/:stopId', (req, res) => {
  const stopId = req.params.stopId;
  const results = db.deliveries.filter(p => p.stopId === stopId);
  res.json(results);
});

// Get proof by tracking code (customer/clinic view)
app.get('/getProofByCode/:code', (req, res) => {
  const code = req.params.code;
  const results = db.deliveries.filter(p => p.trackingCode === code);
  res.json(results);
});

// Get all deliveries (for route report / dashboard)
app.get('/getAllDeliveries', (req, res) => {
  const sorted = [...db.deliveries].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime() || 0;
    const tb = new Date(b.timestamp).getTime() || 0;
    return tb - ta;
  });
  res.json(sorted);
});

// ------------------------------
// Start Server
// ------------------------------
app.listen(3000, () => {
  console.log("🚀 CareLine server running at http://localhost:3000");
});
