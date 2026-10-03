// content/content.js - In-page hover tab snoozer badge

(function () {
  // Only inject in top window (avoid iframe noise)
  if (window.top !== window.self) return;

  // Only inject into HTML pages
  if (!(document.documentElement instanceof HTMLElement)) return;

  // Prevent multiple injections
  if (document.getElementById('tabsnoozer-root')) return;

  let rootContainer = null;
  let shadowRoot = null;
  let isDismissedForSession = false;

  async function init() {
    try {
      if (!chrome.runtime?.id) return;
      const data = await chrome.storage.sync.get({
        showFloatingHoverBadge: true,
        mbPerTabEstimate: 280
      });

      if (!data.showFloatingHoverBadge) return;
      mountBadge(data.mbPerTabEstimate || 280);
    } catch (e) {
      // Chrome extension context may be invalidated
    }
  }

  function mountBadge(mbEstimate) {
    if (isDismissedForSession) return;
    if (document.getElementById('tabsnoozer-root')) return;

    rootContainer = document.createElement('div');
    rootContainer.id = 'tabsnoozer-root';
    rootContainer.style.cssText = 'all: initial !important; display: block !important; position: static !important;';
    shadowRoot = rootContainer.attachShadow({ mode: 'open' });

    // Inject styles directly inside shadow DOM for instant rendering & CSP isolation
    const styleElem = document.createElement('style');
    styleElem.textContent = `
      :host {
        all: initial;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        box-sizing: border-box;
      }
      #tabsnoozer-host-container {
        position: fixed;
        top: 0;
        right: 60px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
      }
      .tabsnoozer-notch {
        pointer-events: auto;
        cursor: pointer;
        background: rgba(15, 23, 42, 0.9);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-top: none;
        color: #e2e8f0;
        padding: 5px 14px 6px 14px;
        border-bottom-left-radius: 12px;
        border-bottom-right-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.3px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 12px rgba(99, 102, 241, 0.3);
        display: flex;
        align-items: center;
        gap: 6px;
        user-select: none;
        transition: all 0.2s ease;
      }
      .tabsnoozer-notch:hover {
        background: rgba(30, 27, 75, 0.98);
        border-color: rgba(129, 140, 248, 0.6);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5), 0 0 16px rgba(99, 102, 241, 0.6);
        color: #ffffff;
      }
      .tabsnoozer-notch-icon {
        font-size: 13px;
        line-height: 1;
        filter: drop-shadow(0 0 4px rgba(165, 180, 252, 0.6));
      }
      .tabsnoozer-menu {
        pointer-events: auto;
        margin-top: 6px;
        width: 230px;
        background: rgba(15, 23, 42, 0.96);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 14px;
        box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.2);
        padding: 10px;
        display: none;
        flex-direction: column;
        gap: 8px;
        animation: tabsnoozer-slide-down 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      @keyframes tabsnoozer-slide-down {
        from { opacity: 0; transform: translateY(-8px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      #tabsnoozer-host-container:hover .tabsnoozer-menu,
      #tabsnoozer-host-container.open .tabsnoozer-menu {
        display: flex;
      }
      .tabsnoozer-menu-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 4px 4px 4px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .tabsnoozer-menu-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #94a3b8;
      }
      .tabsnoozer-menu-close {
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 4px;
        transition: color 0.15s, background 0.15s;
      }
      .tabsnoozer-menu-close:hover {
        color: #f1f5f9;
        background: rgba(255, 255, 255, 0.1);
      }
      .tabsnoozer-btn-primary {
        background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
        color: #ffffff;
        border: none;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.18s ease;
        box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
      }
      .tabsnoozer-btn-primary:hover {
        background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.5);
      }
      .tabsnoozer-badge-tag {
        background: rgba(255, 255, 255, 0.2);
        padding: 2px 6px;
        border-radius: 6px;
        font-size: 10px;
        font-weight: 700;
        color: #e0e7ff;
      }
      .tabsnoozer-btn-secondary {
        background: rgba(255, 255, 255, 0.06);
        color: #cbd5e1;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 7px 10px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.18s ease;
      }
      .tabsnoozer-btn-secondary:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #f8fafc;
        border-color: rgba(255, 255, 255, 0.2);
      }
      .tabsnoozer-hint {
        font-size: 10px;
        color: #64748b;
        text-align: center;
        margin-top: 2px;
      }
    `;
    shadowRoot.appendChild(styleElem);

    // Host HTML
    const wrapper = document.createElement('div');
    wrapper.id = 'tabsnoozer-host-container';
    wrapper.innerHTML = `
      <div class="tabsnoozer-notch" id="ts-notch" title="Hover to snooze tab and save RAM">
        <span class="tabsnoozer-notch-icon">🌙</span>
        <span>Snooze Tab</span>
      </div>
      <div class="tabsnoozer-menu" id="ts-menu">
        <div class="tabsnoozer-menu-header">
          <span class="tabsnoozer-menu-title">AHS Tab Snoozer Pro</span>
          <button class="tabsnoozer-menu-close" id="ts-close" title="Hide for now">✕</button>
        </div>
        <button class="tabsnoozer-btn-primary" id="ts-snooze-current">
          <span>🌙 Snooze This Tab</span>
          <span class="tabsnoozer-badge-tag">~${mbEstimate}MB</span>
        </button>
        <button class="tabsnoozer-btn-secondary" id="ts-snooze-others">
          <span>💤 Snooze Other Tabs</span>
          <span class="tabsnoozer-badge-tag">Alt+Shift+S</span>
        </button>
        <div class="tabsnoozer-hint">Clicking restores tab instantly</div>
      </div>
    `;

    shadowRoot.appendChild(wrapper);
    document.documentElement.appendChild(rootContainer);

    // Event handlers
    const btnSnoozeCurrent = shadowRoot.getElementById('ts-snooze-current');
    const btnSnoozeOthers = shadowRoot.getElementById('ts-snooze-others');
    const btnClose = shadowRoot.getElementById('ts-close');

    if (btnSnoozeCurrent) {
      btnSnoozeCurrent.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          chrome.runtime.sendMessage({ action: 'snoozeCurrentTab' });
        } catch (_) {}
      });
    }

    if (btnSnoozeOthers) {
      btnSnoozeOthers.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          chrome.runtime.sendMessage({ action: 'snoozeAllOtherTabs' }, (response) => {
            if (chrome.runtime.lastError) return;
            if (btnSnoozeOthers) {
              btnSnoozeOthers.textContent = `✓ Snoozed ${response?.snoozedCount || 0} tabs!`;
              setTimeout(() => {
                if (btnSnoozeOthers) {
                  btnSnoozeOthers.innerHTML = `<span>💤 Snooze Other Tabs</span><span class="tabsnoozer-badge-tag">Alt+Shift+S</span>`;
                }
              }, 2000);
            }
          });
        } catch (_) {}
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        isDismissedForSession = true;
        if (rootContainer) {
          rootContainer.remove();
          rootContainer = null;
        }
      });
    }
  }

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.showFloatingHoverBadge) {
      if (changes.showFloatingHoverBadge.newValue) {
        isDismissedForSession = false;
        init();
      } else if (rootContainer) {
        rootContainer.remove();
        rootContainer = null;
      }
    }
  });

  // Run on DOM readiness
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
