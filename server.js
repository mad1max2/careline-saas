const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

// ----------------------------------------------------
// BASIC MIDDLEWARE
// ----------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----------------------------------------------------
// FILE PATHS
// ----------------------------------------------------
const BASE_DIR = __dirname;
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');
const DB_FILE = path.join(BASE_DIR, 'deliveries.json');
const ROUTE_FILE = path.join(BASE_DIR, 'routes.json');

// Ensure uploads folder exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

// ----------------------------------------------------
// IN-MEMORY DATA LOADERS
// ----------------------------------------------------
let deliveries = { deliveries: [] };
let routes = { drivers: [], routes: [] };

function loadDeliveriesFromDisk() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE);
            const parsed = JSON.parse(raw);
            deliveries = parsed || { deliveries: [] };
        } else {
            deliveries = { deliveries: [] };
        }
    } catch (err) {
        console.error('Error loading deliveries.json, resetting file:', err);
        deliveries = { deliveries: [] };
    }
}

function loadRoutesFromDisk() {
    try {
        if (fs.existsSync(ROUTE_FILE)) {
            const raw = fs.readFileSync(ROUTE_FILE);
            const parsed = JSON.parse(raw);
            routes = parsed || { drivers: [], routes: [] };
        } else {
            routes = { drivers: [], routes: [] };
        }
    } catch (err) {
        console.error('Error loading routes.json, resetting file:', err);
        routes = { drivers: [], routes: [] };
    }
}

loadDeliveriesFromDisk();
loadRoutesFromDisk();

// ----------------------------------------------------
// STATIC FILE HOSTING (HTML, JSON, JS, CSS, IMAGES)
// ----------------------------------------------------

// Serve everything in the project folder (index.html, driver-route.html, etc.)
app.use('/', express.static(BASE_DIR));

// Serve uploads as static files
app.use('/uploads', express.static(UPLOAD_DIR));

// Explicit routes.json (so fetch('/routes.json') is clean JSON)
app.get('/routes.json', (req, res) => {
    res.sendFile(ROUTE_FILE);
});

// ----------------------------------------------------
// MULTER STORAGE FOR PROOF OF DELIVERY PHOTOS
// ----------------------------------------------------
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const unique =
            Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
        cb(null, unique);
    },
});

const upload = multer({ storage });

// Helper to handle forms that might use different field names
function handleUploadField(req, res, callback) {
    const tryProof = upload.single('proof');
    const tryPhoto = upload.single('photo');

    tryProof(req, res, function (err) {
        if (!err && req.file) {
            return callback(null);
        }
        // Try "photo" field name if "proof" didn't work
        tryPhoto(req, res, function (err2) {
            if (!err2 && req.file) return callback(null);
            callback(err2 || err || new Error('No file uploaded'));
        });
    });
}

// ----------------------------------------------------
// API: GET DELIVERIES (for tracking pages)
// ----------------------------------------------------
app.get('/api/deliveries', (req, res) => {
    res.json(deliveries);
});

app.get('/api/deliveries/:stopId', (req, res) => {
    const { stopId } = req.params;
    const matches = deliveries.deliveries.filter(
        (d) => d.stopId === stopId
    );
    res.json({ deliveries: matches });
});

// ----------------------------------------------------
// API: UPLOAD PROOF OF DELIVERY
// ----------------------------------------------------
app.post('/upload-proof', (req, res) => {
    handleUploadField(req, res, (err) => {
        if (err || !req.file) {
            console.error('Upload error:', err);
            return res
                .status(400)
                .json({ success: false, message: 'Upload failed' });
        }

        const { stopId } = req.body;
        const timestamp = new Date().toISOString();
        const fileUrl = `/uploads/${req.file.filename}`;

        const entry = {
            stopId: stopId || null,
            timestamp,
            lat: null,
            lng: null,
            fileUrl,
        };

        deliveries.deliveries.push(entry);
        fs.writeFileSync(DB_FILE, JSON.stringify(deliveries, null, 2));

        console.log('Saved proof for stop:', stopId, fileUrl);
        res.json({ success: true, entry });
    });
});

// ----------------------------------------------------
// API: UPDATE STOP STATUS (Mark Complete)
// ----------------------------------------------------
app.post('/update-stop', (req, res) => {
    const { stopId } = req.body;

    if (!stopId) {
        return res
            .status(400)
            .json({ success: false, message: 'stopId required' });
    }

    let updated = false;

    // Look through all routes and all stops
    routes.routes.forEach((route) => {
        route.stops.forEach((stop) => {
            if (stop.stopId === stopId) {
                stop.status = 'Completed';
                updated = true;
            }
        });
    });

    if (!updated) {
        return res
            .status(404)
            .json({ success: false, message: 'Stop not found' });
    }

    try {
        fs.writeFileSync(ROUTE_FILE, JSON.stringify(routes, null, 2));
        console.log('Updated stop to Completed:', stopId);
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving routes.json:', err);
        res.status(500).json({ success: false, message: 'Save failed' });
    }
});

// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`CareLine server running on port ${PORT}`);
});
