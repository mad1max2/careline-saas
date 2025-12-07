/* ==========================================
   CARELINE UNIVERSAL ENTERPRISE SECURITY
========================================== */

/* TOKEN + ROLE HELPERS */

function getToken() {
  return localStorage.getItem("careline_token");
}

function getUserRole() {
  return localStorage.getItem("careline_role");
}

function requireAuth() {
  const token = getToken();
  if (!token) {
    alert("Access Denied: Login Required");
    window.location.href = "/login.html";
  }
}

function requireRole(allowedRoles = []) {
  const role = getUserRole();
  if (!allowedRoles.includes(role)) {
    alert("Security Violation: Unauthorized Access");
    window.location.href = "/dashboard.html";
  }
}

/* ==========================================
   AUTO PAGE SECURITY
========================================== */

document.addEventListener("DOMContentLoaded", () => {
  const page = window.location.pathname.toLowerCase();

  const protectedPages = [
    "dashboard",
    "driver",
    "routes",
    "notifications",
    "analytics",
    "users",
    "admin"
  ];

  if (protectedPages.some(p => page.includes(p))) {
    requireAuth();
  }

  if (page.includes("admin") || page.includes("users") || page.includes("analytics")) {
    requireRole(["admin"]);
  }

  if (page.includes("driver")) {
    requireRole(["driver", "admin"]);
  }

  logAudit("PAGE_ACCESS", { page });
  startDriverGPS();
});

/* ==========================================
   HIPAA AUDIT LOGGING
========================================== */

function logAudit(action, details = {}) {
  const token = getToken();

  fetch("/api/audit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ action, details })
  }).catch(() => {});
}

/* ==========================================
   DRIVER GPS ENFORCEMENT
========================================== */

function startDriverGPS() {
  const role = getUserRole();
  if (role !== "driver") return;

  if (!navigator.geolocation) {
    logAudit("GPS_UNSUPPORTED");
    alert("GPS is required for all drivers.");
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      const location = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };

      logAudit("GPS_UPDATE", location);

      fetch("/api/driver/gps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify(location)
      });
    },
    () => {
      alert("GPS disabled. This is a security violation.");
      logAudit("GPS_DISABLED");
    },
    { enableHighAccuracy: true }
  );
}

/* ==========================================
   LOGOUT
========================================== */

function logout() {
  localStorage.removeItem("careline_token");
  localStorage.removeItem("careline_role");
  window.location.href = "/login.html";
}
