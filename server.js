const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// ---------- STATIC HOSTING ----------
app.use(express.static(path.join(__dirname)));

// ---------- JSON BODY PARSING ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- ROUTES.JSON ENDPOINT ----------
app.get('/routes', (req, res) => {
    const data = fs.readFileSync(path.join(__dirname, 'routes.json'), 'utf8');
    res.json(JSON.parse(data));
});

// ---------- UPDATE STOP STATUS ----------
app.post('/update-stop', (req, res) => {
    try {
        const { stopId, status } = req.body;
        const filePath = path.join(__dirname, 'routes.json');

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

// ---------- PROOF UPLOAD ----------
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.post('/upload-proof', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
    try {
        const stopId = req.query.stopId || 'unknown';
        const filePath = path.join(uploadDir, `${stopId}.jpg`);
        fs.writeFileSync(filePath, req.body);
        res.send('Proof uploaded');
    } catch (err) {
        console.error(err);
        res.status(500).send('Upload failed');
    }
});

// ---------- FALLBACK – Serve ANY .html file ----------
app.get('*', (req, res) => {
    const target = path.join(__dirname, req.path);

    if (fs.existsSync(target) && target.endsWith('.html')) {
        return res.sendFile(target);
    }

    return res.status(404).send(`Cannot GET ${req.path}`);
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
    console.log(`CareLine server running on port ${PORT}`);
});
