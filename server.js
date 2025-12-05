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
const LOCATION_FILE = path.join(BASE_DIR, 'locations.json');

// Ensure uploads folder exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR);
}

// ----------------------------------------------------
// IN-MEMORY DATA LOADERS
// ----------------------------------------------------
let deliveries = { deliveries: [] };
let routes = { drivers: [], routes: [] };
let locations = { drivers: {} }; // { drivers: { driverId: { lat, lng, timestamp } } }

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

function loadLocationsFromDisk() {
    try {
        if (fs.existsSync(LOCATION_FILE)) {
            const raw = fs.readFileSync(LOCATION_FILE);
            const parsed = JSON.parse(raw);
            locations = parsed || { drivers: {} };
        } else {
            locations = { drivers: {} };
        }
    } catch (err) {
        console.error('Error loading locations.json, resetting file:', err);
        locations = { drivers: {} };
    }
}

loadDeliveriesFromDisk();
loadRoutesFromDisk();
loadLocationsFromDisk();

// ----------------------------------------------------
// STATIC FILE HOSTING (HTML, JSON, JS, CSS, IMAGES)
// ----------------------------------------------------

// Serve everything in the project folder (index.html, driver-route.html, etc.)
app.use('/', express.static(BASE_DIR));

// Serve uploads as static files
app.use('/uploads', express.static(UPLOAD_DIR));

// Explicit routes.json
app.get('/routes.json', (req, res) => {
    res.sendFile(ROUTE_FILE);
});

// Optional: locations.json (for debugging from browser)
app.get('/locations.json', (req, res) => {
    res.sendFile(LOCATION_FILE);
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

// Helper for field name
function handleUploadField(req, res, callback) {
    const tryProof = upload.single('proof');
    const tryPhoto = upload.single('photo');

    tryProof(req, res, function (err) {
        if (!err && req.file) {
            return callback(null);
        }
        tryPhoto(req, res, function (err2) {
            if (!err2 && req.file) return callback(null);
            callback(err2 || err || new Error('No file uploaded'));
        });
    });
}

// ----------------------------------------------------
// API: GET DELIVERIES
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
// API: DRIVER LOCATION (LIVE GPS PINGS)
// ----------------------------------------------------

// Driver sends location
app.post('/api/location', (req, res) => {
    const { driverId, lat, lng } = req.body;

    if (!driverId || lat == null || lng == null) {
        return res
            .status(400)
            .json({ success: false, message: 'driverId, lat, lng required' });
    }

    const entry = {
        lat,
        lng,
        timestamp: new Date().toISOString(),
    };

    if (!locations.drivers) locations.drivers = {};
    locations.drivers[driverId] = entry;

    try {
        fs.writeFileSync(LOCATION_FILE, JSON.stringify(locations, null, 2));
        console.log('Updated location for driver:', driverId, entry);
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving locations.json:', err);
        res.status(500).json({ success: false, message: 'Save failed' });
    }
});

// Get last location for one driver
app.get('/api/location/:driverId', (req, res) => {
    const { driverId } = req.params;
    const entry =
        locations.drivers && locations.drivers[driverId]
            ? locations.drivers[driverId]
            : null;
    res.json({ driverId, location: entry });
});

// Get all drivers’ locations (for dispatch board)
app.get('/api/locations', (req, res) => {
    res.json(locations);
});

// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`CareLine server running on port ${PORT}`);
});
