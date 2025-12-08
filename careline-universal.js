// careline-universal.js
// Shared helpers (tokens, basic auth info, AND the floating AI bus assistant)

(function () {
  // -----------------------------
  // Basic CareLine namespace
  // -----------------------------
  window.CareLine = window.CareLine || {};

  // You can overwrite this from login/token logic.
  if (!CareLine.currentUser) {
    CareLine.currentUser = {
      id: 'max',
      name: 'Maxwell Worthington',
      role: 'owner'
    };
  }

  // Helper to safely add a <style> block
  function injectStyles(cssText) {
    const style = document.createElement('style');
    style.type = 'text/css';
    style.appendChild(document.createTextNode(cssText));
    document.head.appendChild(style);
  }

  // -----------------------------
  // AI Assistant widget styles
  // -----------------------------
  injectStyles(`
    .cl-ai-bubble {
      position: fixed;
      right: 18px;
      bottom: 18px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: #00a6b8;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      border: 3px solid #ffffff;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .cl-ai-bubble:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.3);
    }
    .cl-ai-bus-sm {
      width: 46px;
      height: 28px;
      border-radius: 9px;
      background: #ffffff;
      position: relative;
      display: flex;
      align-items: center;
      padding-left: 5px;
      overflow: hidden;
    }
    .cl-ai-bus-sm::before {
      content: "";
      position: absolute;
      right: 0;
      top: 0;
      width: 58%;
      height: 100%;
      background: #00889a;
    }
    .cl-ai-bus-eyes-sm {
      display: flex;
      gap: 3px;
      position: relative;
      z-index: 2;
    }
    .cl-eye-sm {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #ffffff;
      border: 2px solid #064b5a;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cl-eye-dot-sm {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #064b5a;
    }

    .cl-ai-drawer {
      position: fixed;
      top: 0;
      right: 0;
      width: 0;
      max-width: 480px;
      height: 100vh;
      background: #f4fbfd;
      box-shadow: -4px 0 14px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      z-index: 9998;
      transition: width 0.18s ease-out;
      display: flex;
      flex-direction: column;
    }
    .cl-ai-drawer.open {
      width: 420px;
    }
    @media (max-width: 700px) {
      .cl-ai-drawer.open {
        width: 100%;
      }
    }
    .cl-ai-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: linear-gradient(90deg, #00a6b8, #064b5a);
      color: #ffffff;
      font-size: 14px;
    }
    .cl-ai-drawer-header span {
      font-weight: 600;
    }
    .cl-ai-drawer-close {
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.15);
    }
    .cl-ai-drawer-iframe {
      border: none;
      width: 100%;
      flex: 1;
      background: #f4fbfd;
    }
  `);

  // -----------------------------
  // Attach AI bus assistant
  // -----------------------------
  function attachAssistantWidget() {
    // If it's already there, don't double-add
    if (document.getElementById('cl-ai-bubble')) return;

    // Bubble
    const bubble = document.createElement('div');
    bubble.id = 'cl-ai-bubble';
    bubble.className = 'cl-ai-bubble';
    bubble.title = 'Open CareLine AI';

    bubble.innerHTML = `
      <div class="cl-ai-bus-sm">
        <div class="cl-ai-bus-eyes-sm">
          <div class="cl-eye-sm"><div class="cl-eye-dot-sm"></div></div>
          <div class="cl-eye-sm"><div class="cl-eye-dot-sm"></div></div>
        </div>
      </div>
    `;

    // Drawer
    const drawer = document.createElement('div');
    drawer.id = 'cl-ai-drawer';
    drawer.className = 'cl-ai-drawer';
    drawer.innerHTML = `
      <div class="cl-ai-drawer-header">
        <span>CareLine AI Assistant</span>
        <div class="cl-ai-drawer-close" aria-label="Close AI panel">&times;</div>
      </div>
      <iframe class="cl-ai-drawer-iframe" src="ai-admin.html"></iframe>
    `;

    document.body.appendChild(drawer);
    document.body.appendChild(bubble);

    const closeBtn = drawer.querySelector('.cl-ai-drawer-close');

    bubble.addEventListener('click', () => {
      drawer.classList.add('open');
    });

    closeBtn.addEventListener('click', () => {
      drawer.classList.remove('open');
    });
  }

  // -----------------------------
  // DOM ready
  // -----------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachAssistantWidget);
  } else {
    attachAssistantWidget();
  }
})();
