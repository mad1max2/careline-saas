/*****************************************************************
 CARELINE ENTERPRISE UNIVERSAL SYSTEM
 All Pages • All Users • Full Protection + Live UX
******************************************************************/

// ================= TOKEN + USER HELPERS =================
function getToken() {
  return localStorage.getItem("careline_token");
}
function getUser() {
  return JSON.parse(localStorage.getItem("careline_user") || "{}");
}
function logout() {
  localStorage.clear();
  window.location.href = "/login.html";
}

// ================= ROLE-BASED PAGE ACCESS =================
const pageRoles = {
  "/admin.html": ["admin"],
  "/users.html": ["admin"],
  "/analytics.html": ["admin"],
  "/notifications.html": ["admin", "driver"],
  "/driver.html": ["driver"],
  "/routes.html": ["driver"],
  "/dashboard.html": ["admin", "driver"]
};

const currentPath = window.location.pathname;
const allowedRoles = pageRoles[currentPath];

// --- HARD SECURITY BLOCK ---
if (!getToken()) {
  if (!currentPath.includes("login")) {
    window.location.href = "/login.html";
  }
} else if (allowedRoles) {
  const user = getUser();
  if (!allowedRoles.includes(user.role)) {
    window.location.href = "/unauthorized.html";
  }
}

// ================= NAV ACTIVE + ANIMATED =================
function activateNav() {
  const links = document.querySelectorAll(".nav-link");
  links.forEach(link => {
    if (link.href.includes(currentPath)) {
      link.classList.add("active");
    }
  });
}

// ================= MOBILE SLIDE NAV ANIMATION =================
function toggleMobileNav() {
  document.body.classList.toggle("nav-open");
}

// ================= DYNAMIC STYLES =================
const style = document.createElement("style");
style.innerHTML = `
.nav-link {
  position: relative;
  padding: 12px 16px;
  transition: all 0.2s ease;
}

.nav-link.active {
  color: #0ea5e9;
  font-weight: bold;
}

.nav-link.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  width: 100%;
  background: #0ea5e9;
  animation: slide 0.3s ease;
}

@keyframes slide {
  from { width: 0; }
  to { width: 100%; }
}

.badge {
  background: red;
  color: white;
  font-size: 11px;
  border-radius: 50%;
  padding: 3px 7px;
  margin-left: 6px;
  animation: pop 0.3s ease;
}

@keyframes pop {
  from { transform: scale(0); }
  to { transform: scale(1); }
}

/* Bell Shake */
.shake {
  animation: shake 0.5s;
}

@keyframes shake {
  0% { transform: rotate(0deg); }
  25% { transform: rotate(10deg); }
  50% { transform: rotate(-10deg); }
  75% { transform: rotate(6deg); }
  100% { transform: rotate(0deg); }
}

/* Mobile Nav */
.nav-open nav {
  transform: translateX(0);
}
nav {
  transition: transform 0.3s ease;
}
`;
document.head.appendChild(style);

// ================= NOTIFICATION SOUND =================
const notifySound = new Audio("/sounds/notify.mp3");

// ================= LIVE NOTIFICATION BADGES =================
let lastCount = 0;

async function loadBadges() {
  try {
    const res = await fetch("/api/notifications/unread-count", {
      headers: { Authorization: "Bearer " + getToken() }
    });

    const data = await res.json();
    const badge = document.getElementById("notificationBadge");
    const bell = document.getElementById("notificationBell");

    if (!badge) return;

    const count = data.count || 0;
    badge.innerText = count;
    badge.style.display = count > 0 ? "inline-block" : "none";

    // ✅ NEW NOTIFICATION TRIGGERS
    if (count > lastCount) {
      if (bell) bell.classList.add("shake");
      notifySound.play().catch(() => {});
      setTimeout(() => bell && bell.classList.remove("shake"), 600);
    }

    lastCount = count;

  } catch (err) {
    console.log("Badge Error:", err);
  }
}

// ================= USER ONLINE STATUS =================
function setOnlineStatus(status) {
  fetch("/api/users/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + getToken()
    },
    body: JSON.stringify({ status })
  }).catch(() => {});
}

window.addEventListener("beforeunload", () => setOnlineStatus("offline"));

// ================= AUTO INIT SYSTEM =================
document.addEventListener("DOMContentLoaded", () => {
  activateNav();
  loadBadges();
  setOnlineStatus("online");
  setInterval(loadBadges, 10000); // refresh every 10 seconds
});
