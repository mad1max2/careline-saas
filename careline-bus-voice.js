// careline-bus-voice.js
// 🚍 CareLine Talking Bus — Voice + Voice Recognition
// Mode: Admin pages + subscriber tracking pages (option B)

// -------------------------
//  CONFIG: USERS & ROLES
// -------------------------
const CARELINE_USERS = {
  keith: {
    // You as owner/CEO. "Max" is your nickname, so both map here.
    name: "Keith",
    nicknames: ["keith", "max", "maxwell"],
    role: "ceo"
  },
  lena: {
    name: "Lena",
    nicknames: ["lena", "lee-na", "leaner"],
    role: "operations"
  },
  nyjhai: {
    name: "Nyjhai",
    nicknames: ["nyjhai", "nijai", "nai-jai", "nai"],
    role: "junior-admin"
  }
};

// Defaults
const CARELINE_DEFAULT_USER = "keith";
const CARELINE_DEFAULT_ROLE = "guest";

// -------------------------
//  PAGE CONTEXT DETECTION
// -------------------------
//
// Each page can set on <body>:
//
//   <body data-user-id="keith" data-page-type="admin-dashboard">
//
function getCareLineContext() {
  const body = document.body;
  if (!body) {
    return {
      userId: CARELINE_DEFAULT_USER,
      pageType: "unknown"
    };
  }

  const userId = (body.dataset.userId || CARELINE_DEFAULT_USER).toLowerCase();
  const pageType = (body.dataset.pageType || "unknown").toLowerCase();

  return { userId, pageType };
}

function setCareLineUserId(userId) {
  const body = document.body;
  if (!body) return;
  body.dataset.userId = userId;
}

// -------------------------
//  VOICE ENGINE (TEXT → SPEECH)
// -------------------------
const CareLineBusVoice = (function () {
  let speaking = false;

  function getVoiceOptions() {
    const synth = window.speechSynthesis;
    if (!synth) return null;

    const voices = synth.getVoices() || [];
    let selected =
      voices.find(v => /female/i.test(v.name) && /en/i.test(v.lang)) ||
      voices.find(v => /male/i.test(v.name) && /en/i.test(v.lang)) ||
      voices.find(v => /en/i.test(v.lang)) ||
      voices[0];

    return {
      synth,
      voice: selected
    };
  }

  function speak(text, opts = {}) {
    if (!("speechSynthesis" in window)) {
      console.warn("CareLineBusVoice: speechSynthesis not supported.");
      return;
    }
    if (!text || !text.trim()) return;

    const vo = getVoiceOptions();
    if (!vo) return;

    const { synth, voice } = vo;

    if (speaking && !opts.force) {
      synth.cancel();
    }

    const utter = new SpeechSynthesisUtterance(text);
    if (voice) utter.voice = voice;
    utter.rate = opts.rate || 1.0;
    utter.pitch = opts.pitch || 1.0;
    utter.volume = opts.volume || 1.0;

    speaking = true;
    utter.onend = () => (speaking = false);
    utter.onerror = () => (speaking = false);

    synth.speak(utter);
  }

  // -------------------------
  //  MESSAGE TEMPLATES
  // -------------------------
  function buildGreeting(userId) {
    const user = CARELINE_USERS[userId] || CARELINE_USERS[CARELINE_DEFAULT_USER];
    const name = user.name;
    const role = user.role;

    if (role === "ceo") {
      return `Good day, ${name}. Your CareLine fleet is ready. I’ve checked today’s routes and notifications.`;
    } else if (role === "operations") {
      return `Hi ${name}. I’ve reviewed today’s schedules and facility requests. Do you want a quick summary?`;
    } else if (role === "junior-admin") {
      return `Hey ${name}! I’m your CareLine bus helper. Ready to walk through today’s tasks together?`;
    } else {
      return `Hello ${name}. The CareLine bus is online and tracking your deliveries.`;
    }
  }

  function buildTrackingUpdate(kind, payload = {}) {
    if (kind === "eta") {
      const { minutes, deliveryId } = payload;
      if (!minutes) return null;
      return `Heads up. Delivery ${deliveryId || ""} is about ${minutes} minutes away.`;
    }

    if (kind === "delivered") {
      const { deliveryId, facilityName } = payload;
      if (facilityName) {
        return `Delivery ${deliveryId || ""} was completed at ${facilityName}.`;
      }
      return `Delivery ${deliveryId || ""} is complete.`;
    }

    if (kind === "late") {
      const { deliveryId, reason } = payload;
      return `I’m sorry. Delivery ${deliveryId || ""} is running late. ${reason || "I’m working on a new estimated time of arrival."}`;
    }

    return null;
  }

  function buildAdminAlert(kind, payload = {}) {
    if (kind === "driver-missed-checkin") {
      const { driverName, scheduledTime } = payload;
      return `Alert. ${driverName || "A driver"} missed their check-in at ${scheduledTime || "the expected time"}. I recommend reviewing their route.`;
    }

    if (kind === "temperature-risk") {
      const { deliveryId } = payload;
      return `Urgent. Delivery ${deliveryId || ""} may have a temperature risk. Please review the handling checklist immediately.`;
    }

    if (kind === "performance-summary") {
      const { goodCount, needsHelpCount } = payload;
      return `Today’s performance summary: ${goodCount || 0} drivers on track, ${needsHelpCount || 0} might need support.`;
    }

    return null;
  }

  // PUBLIC API
  return {
    speak,
    greetCurrentUser() {
      const { userId } = getCareLineContext();
      const text = buildGreeting(userId);
      speak(text, { rate: 1.0, pitch: 1.05 });
    },
    notifyTracking(kind, payload) {
      const text = buildTrackingUpdate(kind, payload);
      if (text) speak(text, { rate: 1.02, pitch: 1.05 });
    },
    notifyAdmin(kind, payload) {
      const text = buildAdminAlert(kind, payload);
      if (text) speak(text, { rate: 0.98, pitch: 0.95 });
    }
  };
})();

// -------------------------------------------------
//  VOICE RECOGNITION (SPEECH → TEXT → WHO IS TALKING)
// -------------------------------------------------
const CareLineBusListener = (function () {
  const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;
  let lastUserLock = null;

  // PHRASES:
  //  "hey bus it's keith"
  //  "this is lena"
  //  "nyjhai checking in"
  //
  // Also reacts to just hearing the names clearly.

  function findUserFromTranscript(text) {
    if (!text) return null;
    const t = text.toLowerCase();

    // Loop through defined admins
    for (const [id, user] of Object.entries(CARELINE_USERS)) {
      if (!user.nicknames) continue;
      for (const nick of user.nicknames) {
        if (t.includes(nick.toLowerCase())) {
          return id;
        }
      }
    }
    return null;
  }

  function handleTranscript(text) {
    const userId = findUserFromTranscript(text);

    if (userId) {
      const user = CARELINE_USERS[userId];
      setCareLineUserId(userId);
      lastUserLock = userId;

      CareLineBusVoice.speak(
        `Got you, ${user.name}. I’m locked in as your CareLine bus.`,
        { rate: 1.0, pitch: 1.05, force: true }
      );
      return;
    }

    // Simple commands after the bus knows who’s talking
    const ctx = getCareLineContext();
    const activeId = lastUserLock || ctx.userId;

    if (text.toLowerCase().includes("summary")) {
      CareLineBusVoice.speak(
        `Okay ${CARELINE_USERS[activeId]?.name || "there"}. I’ll pull your latest routes and notifications on the dashboard.`,
        { rate: 1.02 }
      );
      return;
    }

    if (text.toLowerCase().includes("check drivers")) {
      CareLineBusVoice.speak(
        `Checking driver performance and open alerts now.`,
        { rate: 1.02 }
      );
      return;
    }
  }

  function setupRecognition() {
    if (!Recog) {
      console.warn("CareLineBusListener: SpeechRecognition not supported in this browser.");
      return null;
    }

    const r = new Recog();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = false;

    r.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      if (!last || !last[0]) return;
      const transcript = last[0].transcript.trim();
      console.log("CareLineBusListener heard:", transcript);
      handleTranscript(transcript);
    };

    r.onerror = (event) => {
      console.warn("CareLineBusListener error:", event.error);
      // Try to auto-recover on network or no-speech errors
      if (event.error === "no-speech" || event.error === "network") {
        restart();
      }
    };

    r.onend = () => {
      // Keep listening while on allowed pages
      if (isListening) {
        restart();
      }
    };

    return r;
  }

  function start() {
    if (!Recog) return;
    if (!recognition) recognition = setupRecognition();
    if (!recognition) return;

    if (isListening) return;

    try {
      recognition.start();
      isListening = true;
      console.log("CareLineBusListener: listening started");
      CareLineBusVoice.speak(
        "Microphone ready. Say, this is Keith, Lena, or Nyjhai to lock me to you.",
        { rate: 1.0, pitch: 1.05 }
      );
    } catch (e) {
      console.warn("CareLineBusListener start error:", e);
    }
  }

  function stop() {
    if (!recognition) return;
    isListening = false;
    try {
      recognition.stop();
      console.log("CareLineBusListener: listening stopped");
    } catch (e) {
      console.warn("CareLineBusListener stop error:", e);
    }
  }

  function restart() {
    if (!recognition) return;
    if (!isListening) return;
    try {
      recognition.start();
      console.log("CareLineBusListener: listening restarted");
    } catch (e) {
      console.warn("CareLineBusListener restart error:", e);
    }
  }

  return {
    start,
    stop
  };
})();

// -------------------------
//  AUTO-BOOTSTRAP ON PAGE
// -------------------------
window.addEventListener("DOMContentLoaded", () => {
  const { userId, pageType } = getCareLineContext();

  const isAdminPage = pageType.startsWith("admin") || pageType.startsWith("driver");
  const isTrackingPage = pageType.startsWith("tracking");

  if (!isAdminPage && !isTrackingPage) {
    return; // bus stays quiet on public/basic pages
  }

  // Greet the current user (based on data-user-id or default)
  setTimeout(() => {
    CareLineBusVoice.greetCurrentUser();
  }, 800);

  // Start voice recognition (if supported and user allows mic access)
  setTimeout(() => {
    CareLineBusListener.start();
  }, 1800);

  // Optional: Event bus hooks (same as before)
  if (window.CARELINE_EVENT_BUS && typeof window.CARELINE_EVENT_BUS.on === "function") {
    window.CARELINE_EVENT_BUS.on("tracking:eta", (payload) => {
      CareLineBusVoice.notifyTracking("eta", payload);
    });

    window.CARELINE_EVENT_BUS.on("tracking:delivered", (payload) => {
      CareLineBusVoice.notifyTracking("delivered", payload);
    });

    window.CARELINE_EVENT_BUS.on("tracking:late", (payload) => {
      CareLineBusVoice.notifyTracking("late", payload);
    });

    window.CARELINE_EVENT_BUS.on("admin:driver-missed-checkin", (payload) => {
      CareLineBusVoice.notifyAdmin("driver-missed-checkin", payload);
    });

    window.CARELINE_EVENT_BUS.on("admin:temperature-risk", (payload) => {
      CareLineBusVoice.notifyAdmin("temperature-risk", payload);
    });

    window.CARELINE_EVENT_BUS.on("admin:performance-summary", (payload) => {
      CareLineBusVoice.notifyAdmin("performance-summary", payload);
    });
  }
});
