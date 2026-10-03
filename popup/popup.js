// popup/popup.js - Controller for TabSnoozer Pro Popup UI
import { getSettings, saveSettings } from '../shared/storage.js';
import {
  formatBytes,
  getDomain,
  formatTimeAgo,
  canTabBeSnoozed,
  escapeHtml,
  isSpecialUrl
} from '../shared/utils.js';

// Application State
let currentTabs = [];
let activityMap = {};
let currentSettings = {};
let activeFilter = 'all'; // 'all' | 'active' | 'snoozed'
let searchQuery = '';

// DOM Elements
const statRamSaved = document.getElementById('stat-ram-saved');
const statActiveCount = document.getElementById('stat-active-count');
const statSnoozedCount = document.getElementById('stat-snoozed-count');
const statTotalCount = document.getElementById('stat-total-count');

const btnSnoozeAllOther = document.getElementById('btn-snooze-all-other');
const btnSnoozeCurrent = document.getElementById('btn-snooze-current');
const btnWakeAll = document.getElementById('btn-wake-all');
const btnToggleSettings = document.getElementById('btn-toggle-settings');
const btnOpenOptions = document.getElementById('btn-open-options');

const settingsDrawer = document.getElementById('settings-drawer');
const settingAutoSnooze = document.getElementById('setting-auto-snooze');
const settingMinutesSelect = document.getElementById('setting-minutes-select');
const settingIgnoreAudible = document.getElementById('setting-ignore-audible');
const settingIgnorePinned = document.getElementById('setting-ignore-pinned');
const settingFloatingBadge = document.getElementById('setting-floating-badge');
const rowAutoMinutes = document.getElementById('row-auto-minutes');

const tabSearchInput = document.getElementById('tab-search-input');
const searchClearBtn = document.getElementById('search-clear-btn');
const filterChips = document.querySelectorAll('.chip');
const chipAllCount = document.getElementById('chip-all-count');
const chipActiveCount = document.getElementById('chip-active-count');
const chipSnoozedCount = document.getElementById('chip-snoozed-count');

const tabsList = document.getElementById('tabs-list');
const emptyState = document.getElementById('empty-state');

// ==========================================
// Initialization
// ==========================================
async function init() {
  currentSettings = await getSettings();
  populateSettingsUI();
  setupEventListeners();
  await refreshTabs();
}

function populateSettingsUI() {
  settingAutoSnooze.checked = !!currentSettings.autoSnoozeEnabled;
  settingMinutesSelect.value = String(currentSettings.autoSnoozeMinutes || 30);
  settingIgnoreAudible.checked = !!currentSettings.ignoreAudible;
  settingIgnorePinned.checked = !!currentSettings.ignorePinned;
  settingFloatingBadge.checked = !!currentSettings.showFloatingHoverBadge;

  if (rowAutoMinutes) {
    rowAutoMinutes.style.opacity = currentSettings.autoSnoozeEnabled ? '1' : '0.5';
    settingMinutesSelect.disabled = !currentSettings.autoSnoozeEnabled;
  }
}

// ==========================================
// Data Fetching & Rendering
// ==========================================
async function refreshTabs() {
  try {
    currentTabs = await chrome.tabs.query({});
    
    // Fetch last active times from background worker
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getActivityMap' }, (res) => {
        resolve(res || {});
      });
    });
    activityMap = response.activityMap || {};

    updateStats();
    renderTabsList();
  } catch (err) {
    console.error('Error refreshing tabs:', err);
  }
}

function updateStats() {
  const total = currentTabs.length;
  const snoozed = currentTabs.filter((t) => t.discarded).length;
  const active = total - snoozed;

  statTotalCount.textContent = total;
  statSnoozedCount.textContent = snoozed;
  statActiveCount.textContent = active;

  chipAllCount.textContent = `(${total})`;
  chipActiveCount.textContent = `(${active})`;
  chipSnoozedCount.textContent = `(${snoozed})`;

  // Current session RAM saved
  const mbPerTab = currentSettings.mbPerTabEstimate || 280;
  const currentSavedMB = snoozed * mbPerTab;
  statRamSaved.textContent = formatBytes(currentSavedMB);
}

function renderTabsList() {
  tabsList.innerHTML = '';

  const filtered = currentTabs.filter((tab) => {
    // Status filter
    if (activeFilter === 'active' && tab.discarded) return false;
    if (activeFilter === 'snoozed' && !tab.discarded) return false;

    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const titleMatch = (tab.title || '').toLowerCase().includes(q);
      const urlMatch = (tab.url || '').toLowerCase().includes(q);
      return titleMatch || urlMatch;
    }
    return true;
  });

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  filtered.forEach((tab) => {
    const li = createTabCardElement(tab);
    tabsList.appendChild(li);
  });
}

function createTabCardElement(tab) {
  const li = document.createElement('li');
  li.className = `tab-item ${tab.active ? 'is-active-tab' : ''} ${tab.discarded ? 'is-snoozed' : ''}`;
  li.dataset.tabId = tab.id;

  const domain = getDomain(tab.url || tab.pendingUrl);
  const isSpecial = isSpecialUrl(tab.url || tab.pendingUrl);
  const canSnooze = canTabBeSnoozed(tab, currentSettings, { allowActive: true });

  // Status badges
  let statusBadgeHtml = '';
  if (tab.active) {
    statusBadgeHtml += `<span class="tab-badge badge-active">Active</span>`;
  }
  if (tab.discarded) {
    statusBadgeHtml += `<span class="tab-badge badge-snoozed">🌙 Snoozed</span>`;
  }
  if (tab.audible) {
    statusBadgeHtml += `<span class="tab-badge badge-audible">🔊 Audio</span>`;
  }
  if (tab.pinned) {
    statusBadgeHtml += `<span class="tab-badge badge-pinned">📌 Pinned</span>`;
  }

  // Activity time
  const lastActiveTime = activityMap[tab.id];
  const timeText = tab.discarded ? 'asleep' : (tab.active ? 'viewing' : formatTimeAgo(lastActiveTime));

  // Favicon
  let faviconHtml = '';
  if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
    faviconHtml = `<img src="${escapeHtml(tab.favIconUrl)}" class="tab-favicon" alt="" /><div class="tab-favicon-fallback" style="display:none;">${domain ? domain.charAt(0).toUpperCase() : '•'}</div>`;
  } else {
    faviconHtml = `<div class="tab-favicon-fallback">${domain ? domain.charAt(0).toUpperCase() : '•'}</div>`;
  }

  // Action buttons
  let actionButtonHtml = '';
  if (tab.discarded) {
    actionButtonHtml = `
      <button class="tab-btn-wake btn-action-wake" title="Wake up tab">
        ⚡ Wake
      </button>
    `;
  } else if (canSnooze) {
    actionButtonHtml = `
      <button class="tab-btn-snooze btn-action-snooze" title="Snooze this tab to save RAM">
        🌙 Snooze
      </button>
    `;
  }

  li.innerHTML = `
    ${faviconHtml}
    <div class="tab-details">
      <div class="tab-title" title="${escapeHtml(tab.title || 'Untitled')}">${escapeHtml(tab.title || 'Untitled')}</div>
      <div class="tab-meta">
        <span class="tab-domain">${escapeHtml(domain || 'System Tab')}</span>
        <span>•</span>
        <span>${timeText}</span>
        ${statusBadgeHtml}
      </div>
    </div>
    <div class="tab-actions">
      ${actionButtonHtml}
      <button class="tab-btn-close btn-action-close" title="Close Tab">✕</button>
    </div>
  `;

  // Attach CSP-compliant error listener for favicon
  const faviconImg = li.querySelector('.tab-favicon');
  if (faviconImg) {
    faviconImg.addEventListener('error', () => {
      faviconImg.style.display = 'none';
      const fallback = li.querySelector('.tab-favicon-fallback');
      if (fallback) fallback.style.display = 'flex';
    });
  }

  // Row click to switch to tab (Chromium automatically reloads discarded tabs upon focus)
  li.addEventListener('click', async (e) => {
    // If clicked on an action button, let the button handler handle it
    if (e.target.closest('.tab-actions')) return;

    try {
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      window.close(); // Close popup
    } catch (err) {
      console.warn('Could not switch to tab:', err);
    }
  });

  // Snooze button click
  const btnSnooze = li.querySelector('.btn-action-snooze');
  if (btnSnooze) {
    btnSnooze.addEventListener('click', async (e) => {
      e.stopPropagation();
      btnSnooze.disabled = true;
      btnSnooze.textContent = '...';
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'snoozeTab', tabId: tab.id }, resolve);
      });
      if (response && !response.success && response.error) {
        btnSnooze.textContent = '⚠️';
        btnSnooze.title = response.error;
        setTimeout(refreshTabs, 1600);
      } else {
        await refreshTabs();
      }
    });
  }

  // Wake button click
  const btnWake = li.querySelector('.btn-action-wake');
  if (btnWake) {
    btnWake.addEventListener('click', async (e) => {
      e.stopPropagation();
      btnWake.disabled = true;
      btnWake.textContent = '...';
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'wakeTab', tabId: tab.id }, resolve);
      });
      await refreshTabs();
    });
  }

  // Close button click
  const btnClose = li.querySelector('.btn-action-close');
  if (btnClose) {
    btnClose.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await chrome.tabs.remove(tab.id);
        await refreshTabs();
      } catch (err) {
        // Tab might already be closed
      }
    });
  }

  return li;
}

// ==========================================
// Event Listeners
// ==========================================
function setupEventListeners() {
  // Snooze All Other Tabs
  btnSnoozeAllOther.addEventListener('click', async () => {
    btnSnoozeAllOther.disabled = true;
    const origHtml = btnSnoozeAllOther.innerHTML;
    btnSnoozeAllOther.innerHTML = `<span class="btn-main-text">💤 Snoozing other tabs...</span>`;

    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'snoozeAllOtherTabs' }, resolve);
    });

    btnSnoozeAllOther.innerHTML = `<span class="btn-main-text">✓ Snoozed ${res?.snoozedCount || 0} tabs!</span>`;
    setTimeout(() => {
      btnSnoozeAllOther.innerHTML = origHtml;
      btnSnoozeAllOther.disabled = false;
    }, 1800);

    await refreshTabs();
  });

  // Snooze Current Active Tab
  btnSnoozeCurrent.addEventListener('click', async () => {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'snoozeCurrentTab' }, resolve);
    });
    await refreshTabs();
  });

  // Wake All Tabs
  btnWakeAll.addEventListener('click', async () => {
    btnWakeAll.disabled = true;
    btnWakeAll.textContent = '⚡ Waking...';
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'wakeAllTabs' }, resolve);
    });
    btnWakeAll.textContent = '⚡ Wake All Tabs';
    btnWakeAll.disabled = false;
    await refreshTabs();
  });

  // Toggle Quick Settings Drawer
  btnToggleSettings.addEventListener('click', () => {
    const isHidden = settingsDrawer.classList.contains('hidden');
    if (isHidden) {
      settingsDrawer.classList.remove('hidden');
      btnToggleSettings.classList.add('active');
    } else {
      settingsDrawer.classList.add('hidden');
      btnToggleSettings.classList.remove('active');
    }
  });

  // Open Full Options Page
  btnOpenOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Settings Controls
  settingAutoSnooze.addEventListener('change', async () => {
    currentSettings.autoSnoozeEnabled = settingAutoSnooze.checked;
    await saveSettings({ autoSnoozeEnabled: settingAutoSnooze.checked });
    if (rowAutoMinutes) {
      rowAutoMinutes.style.opacity = currentSettings.autoSnoozeEnabled ? '1' : '0.5';
      settingMinutesSelect.disabled = !currentSettings.autoSnoozeEnabled;
    }
  });

  settingMinutesSelect.addEventListener('change', async () => {
    const mins = parseInt(settingMinutesSelect.value, 10) || 30;
    currentSettings.autoSnoozeMinutes = mins;
    await saveSettings({ autoSnoozeMinutes: mins });
  });

  settingIgnoreAudible.addEventListener('change', async () => {
    currentSettings.ignoreAudible = settingIgnoreAudible.checked;
    await saveSettings({ ignoreAudible: settingIgnoreAudible.checked });
    renderTabsList();
  });

  settingIgnorePinned.addEventListener('change', async () => {
    currentSettings.ignorePinned = settingIgnorePinned.checked;
    await saveSettings({ ignorePinned: settingIgnorePinned.checked });
    renderTabsList();
  });

  settingFloatingBadge.addEventListener('change', async () => {
    currentSettings.showFloatingHoverBadge = settingFloatingBadge.checked;
    await saveSettings({ showFloatingHoverBadge: settingFloatingBadge.checked });
  });

  // Search input
  tabSearchInput.addEventListener('input', () => {
    searchQuery = tabSearchInput.value.trim();
    if (searchQuery) {
      searchClearBtn.classList.remove('hidden');
    } else {
      searchClearBtn.classList.add('hidden');
    }
    renderTabsList();
  });

  searchClearBtn.addEventListener('click', () => {
    tabSearchInput.value = '';
    searchQuery = '';
    searchClearBtn.classList.add('hidden');
    renderTabsList();
  });

  // Filter chips
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderTabsList();
    });
  });
}

// Boot popup
document.addEventListener('DOMContentLoaded', init);
