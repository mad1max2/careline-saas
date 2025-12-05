// ------------------------------------------------------------
// CareLine Medical Logistics — Node/Express Server (Render Ready)
// ------------------------------------------------------------

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

// ------------------------------------------------------------
// STATIC FILE HOSTING (Required for Render)
// ------------------------------------------------------------
app.use('/', express.static(__dirname));

// Allow CORS for HTML pages calling APIs
app.use(cors());

// Parse JSON + form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------------------------
// UPLOADS FOLDER
// ------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

app.use('/uploads', express.static(UPLOAD_DIR));

// Configure Multer storage for photo uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// ------------------------------------------------------------
// LOAD deliveries.json
// ------------------------------------------------------------
const DB_FILE = './deliveries.json';
let deliveries = [];

function loadDeliveries() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE);
            deliveries = JSON.parse(raw);
        } else {
            deliveries = [];
        }
    } catch (err) {
        console.error("Error loading deliveries.json:", err);
        deliveries = [];
    }
}
loadDeliveries();

// Save deliveries.json
function saveDeliveries() {
    fs.writeFileSync(DB_FILE, JSON.stringify(deliveries, null, 2));
}

// ------------------------------------------------------------
// LOAD routes.json
// ------------------------------------------------------------
const ROUTE_FILE = './routes.json';
let routeData = {};

function loadRoutes() {
    try {
        if (fs.existsSync(ROUTE_FILE)) {
            const raw = fs.readFileSync(ROUTE_FILE);
            routeData = JSON.parse(raw);
        } else {
            routeData = { drivers: [], routes: [] };
        }
    } catch (err) {
        console.error("Error loading routes.json:", err);
        routeData = { drivers: [], routes: [] };
    }
}
loadRoutes();

// ------------------------------------------------------------
// API ENDPOINTS
// ------------------------------------------------------------

// Get all routes + drivers
app.get('/api/routes', (req, res) => {
    res.json(routeData);
});

// Get deliveries list
app.get('/api/deliveries', (req, res) => {
    res.json(deliveries);
});

// Upload proof-of-delivery
app.post('/api/upload', upload.single('photo'), (req, res) => {
    try {
        const { stopId } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: "No photo uploaded" });
        }

        // Store reference
        deliveries.push({
            stopId,
            file: req.file.filename,
            uploadedAt: new Date().toISOString()
        });

        saveDeliveries();

        return res.json({
            success: true,
            file: req.file.filename
        });
    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ error: "Server error during upload" });
    }
});

// ------------------------------------------------------------
// START SERVER ON RENDER
// ------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`CareLine server running on port ${PORT}`);
});
