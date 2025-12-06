// ---------------------------------------------------------------
// CareLine Medical Logistics - CLEAN SERVER.JS
// Static hosting + routes.json API + proof upload
// ---------------------------------------------------------------

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

// ---------------------------------------------------------------
// MIDDLEWARE
// ---------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve ALL static files (HTML, CSS, JS, images)
app.use(express.static(__dirname));

// Serve uploaded proof images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---------------------------------------------------------------
// LOAD ROUTES.JSON API ENDPOINT
// ---------------------------------------------------------------
app.get("/routes", (req, res) => {
  try {
    const filePath = path.join(__dirname, "routes.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    res.json(data);
  } catch (err) {
    console.error("Error reading routes.json:", err);
    res.status(500).json({ error: "Cannot load routes.json" });
  }
});

// ---------------------------------------------------------------
// UPDATE STOP STATUS
// ---------------------------------------------------------------
app.post("/update-stop", (req, res) => {
  const { stopId, status } = req.body;

  try {
    const filePath = path.join(__dirname, "routes.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);

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
    console.error("Error updating stop:", err);
    res.status(500).json({ success: false });
  }
});

// ---------------------------------------------------------------
// FILE UPLOAD (Proof of delivery)
// ---------------------------------------------------------------
const upload = multer({ dest: "uploads/" });

app.post("/upload-proof", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ success: true, filename: req.file.filename });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ success: false });
  }
});

// ---------------------------------------------------------------
// FALLBACK for unknown routes
// ---------------------------------------------------------------
app.use((req, res) => {
  res.status(404).send(`Cannot GET ${req.path}`);
});

// ---------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🔥 CareLine server running on port ${PORT}`);
});
