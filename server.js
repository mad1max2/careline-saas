const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const SECRET = "careline_secure_secret_key";
const USERS_FILE = "./users.json";
const AUDIT_LOG_FILE = "./hipaa-audit-log.json";
const ADMIN_ALERTS_FILE = "./admin-alerts.json";

/* ================================
   FILE HELPERS
================================ */

function readFileSafe(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
}

function writeFileSafe(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ================================
   AUTH MIDDLEWARE
================================ */

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ success: false, error: "No token" });

  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ success: false, error: "Invalid token" });
  }
}

function requireRole(roles = []) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      sendAdminAlert({
        type: "SECURITY_VIOLATION",
        user: req.user.email,
        reason: "Unauthorized Role Access"
      });
      return res.status(403).json({ success: false, error: "Unauthorized role" });
    }
    next();
  };
}

/* ================================
   HIPAA AUDIT LOGGING
================================ */

function writeAuditLog(entry) {
  const logs = readFileSafe(AUDIT_LOG_FILE);
  logs.push({ ...entry, timestamp: new Date().toISOString() });
  writeFileSafe(AUDIT_LOG_FILE, logs);
}

/* ================================
   ADMIN BREACH ALERT SYSTEM
================================ */

function sendAdminAlert(alert) {
  const alerts = readFileSafe(ADMIN_ALERTS_FILE);
  alerts.push({
    ...alert,
    timestamp: new Date().toISOString(),
    acknowledged: false
  });
  writeFileSafe(ADMIN_ALERTS_FILE, alerts);
}

/* ================================
   AUTH ROUTES
================================ */

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const users = readFileSafe(USERS_FILE);

  const user = users.find(u => u.email === email && u.password === password);
  if (!user) {
    sendAdminAlert({
      type: "FAILED_LOGIN",
      user: email
    });
    return res.status(401).json({ success: false, error: "Invalid login" });
  }

  const token = jwt.sign(
    { email: user.email, role: user.role },
    SECRET,
    { expiresIn: "8h" }
  );

  writeAuditLog({
    type: "LOGIN",
    user: user.email
  });

  res.json({
    success: true,
    token,
    role: user.role
  });
});

/* ================================
   LIVE AUDIT LOG RECEIVE
================================ */

app.post("/api/audit", requireAuth, (req, res) => {
  writeAuditLog({
    type: req.body.action,
    user: req.user.email,
    details: req.body.details
  });

  res.json({ success: true });
});

/* ================================
   DRIVER GPS TRACKING
================================ */

app.post("/api/driver/gps", requireAuth, requireRole(["driver", "admin"]), (req, res) => {
  writeAuditLog({
    type: "GPS_UPDATE",
    user: req.user.email,
    location: req.body
  });

  res.json({ success: true });
});

/* ================================
   ADMIN DASHBOARD APIs
================================ */

app.get("/api/audit-logs", requireAuth, requireRole(["admin"]), (req, res) => {
  const logs = readFileSafe(AUDIT_LOG_FILE);
  res.json({ success: true, logs });
});

app.get("/api/admin/alerts", requireAuth, requireRole(["admin"]), (req, res) => {
  const alerts = readFileSafe(ADMIN_ALERTS_FILE);
  res.json({ success: true, alerts });
});

/* ================================
   STATIC FILE SERVING
================================ */

app.use(express.static("public"));

/* ================================
   SERVER START
================================ */

const PORT = 3000;
app.listen(PORT, () => {
  console.log("✅ CareLine Enterprise Server Running on Port", PORT);
});
