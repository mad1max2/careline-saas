// careline-universal.js
// Shared helpers for the CareLine app (auth, session, formatting, API helpers)

/* global window, localStorage, fetch */

;(function (window) {
  'use strict';

  // Namespace (if you ever want to hang extra helpers)
  var CareLine = window.CareLine || {};

  // -----------------------------
  // TOKEN & AUTH HELPERS
  // -----------------------------

  /**
   * Get the stored JWT token for the current user.
   */
  CareLine.getToken = function getToken() {
    try {
      return localStorage.getItem('carelineToken') || '';
    } catch (e) {
      console.error('Error reading carelineToken from localStorage', e);
      return '';
    }
  };

  /**
   * Save token (if you ever want to centralize login).
   */
  CareLine.setToken = function setToken(token) {
    try {
      if (token) {
        localStorage.setItem('carelineToken', token);
      } else {
        localStorage.removeItem('carelineToken');
      }
    } catch (e) {
      console.error('Error writing carelineToken to localStorage', e);
    }
  };

  /**
   * Get user object from localStorage (parsed JSON or null).
   */
  CareLine.getUser = function getUser() {
    try {
      var raw = localStorage.getItem('carelineUser');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Error parsing carelineUser from localStorage', e);
      return null;
    }
  };

  /**
   * Save user object (if you ever want to centralize login).
   */
  CareLine.setUser = function setUser(user) {
    try {
      if (!user) {
        localStorage.removeItem('carelineUser');
      } else {
        localStorage.setItem('carelineUser', JSON.stringify(user));
      }
    } catch (e) {
      console.error('Error writing carelineUser to localStorage', e);
    }
  };

  /**
   * Build auth headers for fetch.
   * This matches what your pages already expect: `getAuthHeaders()`.
   */
  function getAuthHeaders() {
    var token = CareLine.getToken();
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  /**
   * Ensure user is logged in; otherwise redirect to login.html
   * This matches what your pages already expect: `requireLoggedIn()`.
   */
  function requireLoggedIn() {
    var token = CareLine.getToken();
    if (!token) {
      try {
        alert('You must be logged in to view this page.');
      } catch (e) {
        // ignore if alert is blocked
      }
      window.location.href = 'login.html';
    }
  }

  /**
   * Optionally enforce role(s). If user is not one of the allowed roles,
   * you can choose to redirect or just warn.
   */
  CareLine.requireRole = function requireRole(allowedRoles, options) {
    options = options || {};
    var redirect = options.redirect !== false; // default true
    var target = options.redirectTo || 'login.html';

    var user = CareLine.getUser();
    if (!user || !user.role) {
      if (redirect) {
        try {
          alert('You do not have access to this page.');
        } catch (e) {}
        window.location.href = target;
      }
      return false;
    }

    if (allowedRoles.indexOf(user.role) === -1) {
      if (redirect) {
        try {
          alert('You do not have access to this page.');
        } catch (e) {}
        window.location.href = target;
      }
      return false;
    }

    return true;
  };

  // Expose the two universal helpers as globals (for older page scripts)
  window.getAuthHeaders = getAuthHeaders;
  window.requireLoggedIn = requireLoggedIn;

  // Also attach to CareLine namespace for future:
  CareLine.getAuthHeaders = getAuthHeaders;
  CareLine.requireLoggedIn = requireLoggedIn;

  // -----------------------------
  // SESSION LABEL / UI HELPERS
  // -----------------------------

  /**
   * Update a little "session" text on the page.
   * If no element is passed, it will look for #sessionUser.
   *
   * Usage:
   *   updateSessionLabel();
   *   updateSessionLabel('myElementId');
   *   updateSessionLabel(document.getElementById('something'));
   */
  function updateSessionLabel(target) {
    var el = null;

    if (!target) {
      el = document.getElementById('sessionUser');
    } else if (typeof target === 'string') {
      el = document.getElementById(target);
    } else if (target && target.nodeType === 1) {
      el = target;
    }

    if (!el) return;

    var user = CareLine.getUser();
    if (!user) {
      el.textContent = 'Not logged in.';
      return;
    }

    var label = (user.email || user.id || 'User') + ' — ' + (user.role || 'unknown');
    el.textContent = label;
  }

  window.updateSessionLabel = updateSessionLabel;
  CareLine.updateSessionLabel = updateSessionLabel;

  // -----------------------------
  // DATE/TIME HELPERS
  // -----------------------------

  /**
   * Format a timestamp to a short local string (no seconds).
   */
  function formatDateTimeShort(ts) {
    if (!ts) return '—';
    var d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d.getTime())) return '—';

    return (
      d.toLocaleDateString() +
      ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  }

  /**
   * Format date only.
   */
  function formatDateOnly(ts) {
    if (!ts) return '—';
    var d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
  }

  /**
   * Parse a yyyy-mm-dd string (from <input type="date">) into Date.
   * If includeEndOfDay is true, sets time to 23:59:59.
   */
  function parseInputDate(value, includeEndOfDay) {
    if (!value) return null;
    var suffix = includeEndOfDay ? 'T23:59:59' : 'T00:00:00';
    var d = new Date(value + suffix);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  CareLine.formatDateTimeShort = formatDateTimeShort;
  CareLine.formatDateOnly = formatDateOnly;
  CareLine.parseInputDate = parseInputDate;

  window.carelineFormatDateTimeShort = formatDateTimeShort;
  window.carelineFormatDateOnly = formatDateOnly;
  window.carelineParseInputDate = parseInputDate;

  // -----------------------------
  // QUERY STRING HELPERS
  // -----------------------------

  /**
   * Get a single query param from the URL.
   * Example: carelineGetQueryParam('stopId')
   */
  function getQueryParam(name) {
    if (!name) return '';
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get(name) || '';
    } catch (e) {
      // Fallback for older environments
      var query = window.location.search || '';
      if (query.charAt(0) === '?') query = query.substring(1);
      var parts = query.split('&');
      for (var i = 0; i < parts.length; i++) {
        var kv = parts[i].split('=');
        if (decodeURIComponent(kv[0] || '') === name) {
          return decodeURIComponent(kv[1] || '');
        }
      }
      return '';
    }
  }

  CareLine.getQueryParam = getQueryParam;
  window.carelineGetQueryParam = getQueryParam;

  // -----------------------------
  // API WRAPPERS (GET/POST)
  // -----------------------------

  /**
   * Generic GET wrapper that adds auth headers and basic error handling.
   *
   * Usage:
   *   carelineApiGet('/api/notifications')
   *     .then(data => { ... })
   *     .catch(err => { ... });
   */
  function apiGet(url) {
    return fetch(url, {
      method: 'GET',
      headers: Object.assign(
        {
          'Content-Type': 'application/json'
        },
        getAuthHeaders()
      ),
      cache: 'no-store'
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        // unauthorized - force relogin
        console.warn('Unauthorized, redirecting to login.');
        requireLoggedIn();
        throw new Error('Unauthorized');
      }
      if (!res.ok) {
        throw new Error('Request failed with status ' + res.status);
      }
      return res.json();
    });
  }

  /**
   * Generic POST wrapper with JSON body.
   *
   * Usage:
   *   carelineApiPost('/api/something', { foo: 'bar' })
   *     .then(data => { ... })
   *     .catch(err => { ... });
   */
  function apiPost(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: Object.assign(
        {
          'Content-Type': 'application/json'
        },
        getAuthHeaders()
      ),
      body: JSON.stringify(body || {})
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        console.warn('Unauthorized, redirecting to login.');
        requireLoggedIn();
        throw new Error('Unauthorized');
      }
      if (!res.ok) {
        throw new Error('Request failed with status ' + res.status);
      }
      return res.json();
    });
  }

  CareLine.apiGet = apiGet;
  CareLine.apiPost = apiPost;

  window.carelineApiGet = apiGet;
  window.carelineApiPost = apiPost;

  // -----------------------------
  // MISC SMALL HELPERS
  // -----------------------------

  /**
   * Safely parse JSON, returning fallback on error.
   */
  function safeJsonParse(str, fallback) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return typeof fallback === 'undefined' ? null : fallback;
    }
  }

  CareLine.safeJsonParse = safeJsonParse;
  window.carelineSafeJsonParse = safeJsonParse;

  /**
   * Simple "toast" style message (non-blocking).
   * Minimal, can be styled later if you want.
   */
  function showToast(message, durationMs) {
    durationMs = durationMs || 2500;

    var existing = document.getElementById('careline-toast');
    if (existing) {
      existing.parentNode.removeChild(existing);
    }

    var div = document.createElement('div');
    div.id = 'careline-toast';
    div.textContent = message || '';
    div.style.position = 'fixed';
    div.style.bottom = '16px';
    div.style.right = '16px';
    div.style.padding = '8px 12px';
    div.style.borderRadius = '999px';
    div.style.background = 'rgba(0, 151, 167, 0.95)';
    div.style.color = '#ffffff';
    div.style.fontSize = '12px';
    div.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    div.style.zIndex = '9999';

    document.body.appendChild(div);

    setTimeout(function () {
      if (div && div.parentNode) {
        div.parentNode.removeChild(div);
      }
    }, durationMs);
  }

  CareLine.showToast = showToast;
  window.carelineShowToast = showToast;

  // -----------------------------
  // FINAL EXPORT
  // -----------------------------

  window.CareLine = CareLine;
})(window);
