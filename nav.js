// ===============================
// CARELINE ROLE-AWARE NAV SYSTEM
// ===============================

// Role-based navigation map
const roleNavMap = {
  admin: [
    { id: 'dashboard', href: 'dashboard.html', label: 'Dashboard' },
    { id: 'routes', href: 'routes.html', label: 'Routes' },
    { id: 'dispatch', href: 'dispatch.html', label: 'Dispatch' },
    { id: 'analytics', href: 'analytics.html', label: 'Analytics' },
    { id: 'notifications', href: 'notifications.html', label: 'Notifications' },
    { id: 'users', href: 'user-management.html', label: 'Users' },
    { id: 'pricing', href: 'pricing.html', label: 'Pricing' }
  ],

  dispatch: [
    { id: 'dashboard', href: 'dashboard.html', label: 'Dashboard' },
    { id: 'routes', href: 'routes.html', label: 'Routes' },
    { id: 'dispatch', href: 'dispatch.html', label: 'Dispatch' },
    { id: 'notifications', href: 'notifications.html', label: 'Notifications' }
  ],

  // ✅ UPDATED DRIVER NAV (DASHBOARD ADDED — NOTHING REMOVED)
  driver: [
    { id: 'driver-dashboard', href: 'driver-dashboard.html', label: 'Dashboard' },
    { id: 'driver-route', href: 'driver-route.html', label: 'My Route' },
    { id: 'driver-stops', href: 'driver-stops.html', label: 'My Stops' },
    { id: 'driver-map', href: 'driver-map.html', label: 'Live Map' }
  ],

  facility: [
    { id: 'facility-portal', href: 'facility-portal.html', label: 'Portal' },
    { id: 'facility-summary', href: 'facility-summary.html', label: 'Facility Summary' },
    { id: 'notifications', href: 'notifications.html', label: 'Notifications' },
    { id: 'pricing', href: 'pricing.html', label: 'Pricing' }
  ]
};

// ===============================
// BUILD NAV FUNCTION
// ===============================
function buildRoleAwareNav(activeId = '') {
  const nav = document.getElementById('mainNav');
  if (!nav) return;

  nav.innerHTML = '';

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('carelineUser'));
  } catch {}

  const role = user?.role || 'driver'; // Default to driver if missing
  const links = roleNavMap[role] || [];

  links.forEach(link => {
    const a = document.createElement('a');
    a.href = link.href;
    a.textContent = link.label;
    a.className = 'nav-link';

    if (link.id === activeId) {
      a.classList.add('active');
    }

    nav.appendChild(a);
  });

  // ✅ LOGOUT BUTTON (ALWAYS PRESENT)
  const logoutBtn = document.createElement('button');
  logoutBtn.textContent = 'Logout';
  logoutBtn.onclick = logout;
  nav.appendChild(logoutBtn);
}

// ===============================
// LOGOUT FUNCTION
// ===============================
function logout() {
  localStorage.removeItem('carelineToken');
  localStorage.removeItem('carelineUser');
  window.location.href = 'login.html';
}
