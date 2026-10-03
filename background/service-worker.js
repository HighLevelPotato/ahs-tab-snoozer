// background/service-worker.js - Core background engine for TabSnoozer
import { getSettings, saveSettings, incrementSnoozeStats } from '../shared/storage.js';
import { canTabBeSnoozed, getDomain, isSpecialUrl } from '../shared/utils.js';

const ALARM_NAME = 'tabsnoozer_inactivity_check';
let tabActivityMap = new Map();
let restorePromise = null;

// Helper to save activity map to session storage
async function persistActivityMap() {
  try {
    const serialized = Array.from(tabActivityMap.entries());
    await chrome.storage.session.set({ tabActivityMap: serialized });
  } catch (e) {
    // Session storage may fail in certain restricted contexts
  }
}

// Restore activity map on startup and prune stale tabs
async function restoreActivityMap() {
  if (restorePromise) return restorePromise;
  restorePromise = (async () => {
    try {
      const data = await chrome.storage.session.get('tabActivityMap');
      if (data && Array.isArray(data.tabActivityMap)) {
        tabActivityMap = new Map(data.tabActivityMap);
      }
    } catch (e) {
      tabActivityMap = new Map();
    }

    try {
      const tabs = await chrome.tabs.query({});
      const activeIds = new Set(tabs.map((t) => t.id));

      // Prune dead tab IDs to prevent storage memory leak
      for (const id of tabActivityMap.keys()) {
        if (!activeIds.has(id)) {
          tabActivityMap.delete(id);
        }
      }

      // Populate any currently open tabs not yet in the map
      const now = Date.now();
      for (const tab of tabs) {
        if (!tabActivityMap.has(tab.id)) {
          tabActivityMap.set(tab.id, now);
        }
      }
      await persistActivityMap();
    } catch (e) {
      // Ignore query error on early boot
    }
  })();

  const result = await restorePromise;
  restorePromise = null;
  return result;
}

// Update tab activity
function markTabActive(tabId) {
  if (!tabId) return;
  tabActivityMap.set(tabId, Date.now());
  persistActivityMap();
}

// ==========================================
// Tab Discard & Snooze Actions
// ==========================================

/**
 * Safely discard an individual tab
 */
export async function snoozeTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    if (tab.discarded) {
      return { success: true, alreadyDiscarded: true };
    }

    if (isSpecialUrl(tab.url || tab.pendingUrl)) {
      return { success: false, error: 'Internal browser pages cannot be snoozed' };
    }

    // If tab is currently active, activate an adjacent tab first
    if (tab.active) {
      const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
      const otherTabs = windowTabs.filter((t) => t.id !== tabId);
      if (otherTabs.length === 0) {
        return { success: false, error: 'Cannot snooze the only tab in the window' };
      }

      // Find next or previous tab
      const nextTab = otherTabs.find((t) => t.index > tab.index) || otherTabs[otherTabs.length - 1];
      if (nextTab) {
        await chrome.tabs.update(nextTab.id, { active: true });
        // Give Chromium a brief tick to finalize active tab switch
        await new Promise((r) => setTimeout(r, 60));
      }
    }

    // Perform native discard
    await chrome.tabs.discard(tabId);
    await incrementSnoozeStats(1);
    updateBadge();

    return { success: true };
  } catch (err) {
    console.warn(`TabSnoozer: Failed to discard tab ${tabId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Snooze the current active tab
 */
export async function snoozeCurrentTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!activeTab) return { success: false, error: 'No active tab found' };
  return snoozeTab(activeTab.id);
}

/**
 * Snooze all tabs except the current active tab
 */
export async function snoozeAllOtherTabs() {
  const settings = await getSettings();
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const allTabs = await chrome.tabs.query({});

  let snoozedCount = 0;
  const activeTabId = activeTab ? activeTab.id : null;

  for (const tab of allTabs) {
    if (tab.id === activeTabId) continue;
    if (canTabBeSnoozed(tab, settings, { allowActive: false })) {
      try {
        await chrome.tabs.discard(tab.id);
        snoozedCount++;
      } catch (e) {
        // Tab might be in non-discardable state
      }
    }
  }

  if (snoozedCount > 0) {
    await incrementSnoozeStats(snoozedCount);
    updateBadge();
  }

  return { success: true, snoozedCount };
}

/**
 * Wake a snoozed tab
 */
export async function wakeTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return { success: false, error: 'Tab not found' };

    // In Chromium, discarded tabs automatically reload when focused.
    // If the tab is already active and discarded, reload it directly.
    if (tab.active && tab.discarded) {
      await chrome.tabs.reload(tabId);
    } else {
      await chrome.tabs.update(tabId, { active: true });
      if (tab.windowId) {
        try {
          await chrome.windows.update(tab.windowId, { focused: true });
        } catch (_) {}
      }
    }

    updateBadge();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Wake all discarded tabs in controlled batches
 */
export async function wakeAllTabs() {
  const allTabs = await chrome.tabs.query({ discarded: true });
  let wokenCount = 0;

  // Process in small batches of 4 to prevent network and CPU choking
  const batchSize = 4;
  for (let i = 0; i < allTabs.length; i += batchSize) {
    const batch = allTabs.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (tab) => {
        try {
          await chrome.tabs.reload(tab.id);
          wokenCount++;
        } catch (e) {
          // Ignore reload error
        }
      })
    );
    if (i + batchSize < allTabs.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  updateBadge();
  return { success: true, wokenCount };
}

// ==========================================
// Inactivity Check Alarm
// ==========================================

async function checkInactivity() {
  await restoreActivityMap();
  const settings = await getSettings();
  if (!settings.autoSnoozeEnabled) return;

  const thresholdMs = Math.max(1, settings.autoSnoozeMinutes) * 60 * 1000;
  const now = Date.now();

  const allTabs = await chrome.tabs.query({});
  let autoSnoozedCount = 0;

  for (const tab of allTabs) {
    if (tab.active || tab.discarded) continue;
    if (!canTabBeSnoozed(tab, settings, { allowActive: false })) continue;

    let lastActive = tabActivityMap.get(tab.id);
    if (!lastActive) {
      // Tab was not tracked yet; start tracking now to avoid premature discard
      tabActivityMap.set(tab.id, now);
      continue;
    }

    const idleTime = now - lastActive;

    if (idleTime >= thresholdMs) {
      try {
        await chrome.tabs.discard(tab.id);
        autoSnoozedCount++;
      } catch (err) {
        // Tab cannot be discarded
      }
    }
  }

  if (autoSnoozedCount > 0) {
    await incrementSnoozeStats(autoSnoozedCount);
    updateBadge();
  }
}

// ==========================================
// Dynamic Badge Indicator
// ==========================================

async function updateBadge() {
  try {
    const discardedTabs = await chrome.tabs.query({ discarded: true });
    const count = discardedTabs.length;

    if (count > 0) {
      chrome.action.setBadgeText({ text: `${count}` });
      chrome.action.setBadgeBackgroundColor({ color: '#6366f1' }); // Indigo
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (e) {
    // Action API error
  }
}

// ==========================================
// Context Menus
// ==========================================

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'snooze-current-tab',
      title: '🌙 Snooze This Tab',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      id: 'snooze-all-other',
      title: '💤 Snooze All Other Tabs (Alt+Shift+S)',
      contexts: ['page', 'action']
    });

    chrome.contextMenus.create({
      id: 'whitelist-current-domain',
      title: '🛡️ Never Snooze This Domain',
      contexts: ['page']
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'snooze-current-tab') {
    if (tab && tab.id) {
      await snoozeTab(tab.id);
    } else {
      await snoozeCurrentTab();
    }
  } else if (info.menuItemId === 'snooze-all-other') {
    await snoozeAllOtherTabs();
  } else if (info.menuItemId === 'whitelist-current-domain') {
    if (tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      const domain = getDomain(tab.url);
      if (domain) {
        const settings = await getSettings();
        const list = settings.whitelistDomains || [];
        if (!list.includes(domain)) {
          list.push(domain);
          await saveSettings({ whitelistDomains: list });
        }
        // Visual confirmation on extension badge
        chrome.action.setBadgeText({ text: '✓' });
        chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
        setTimeout(updateBadge, 2000);
      }
    }
  }
});

// ==========================================
// Keyboard Commands
// ==========================================

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'snooze-all-other') {
    await snoozeAllOtherTabs();
  } else if (command === 'snooze-current') {
    await snoozeCurrentTab();
  }
});

// ==========================================
// Tab Event Listeners
// ==========================================

chrome.tabs.onActivated.addListener(({ tabId }) => {
  markTabActive(tabId);
  updateBadge();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    markTabActive(tabId);
  }
  updateBadge();
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab && tab.id) {
    markTabActive(tab.id);
  }
  updateBadge();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabActivityMap.delete(tabId);
  persistActivityMap();
  updateBadge();
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, windowId });
      if (activeTab) {
        markTabActive(activeTab.id);
      }
    } catch (_) {}
  }
  updateBadge();
});

// ==========================================
// Alarm & Installation Lifecycle
// ==========================================

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    checkInactivity();
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  setupContextMenus();
  await restoreActivityMap();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await restoreActivityMap();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  updateBadge();
});

// Initial boot
restoreActivityMap();
updateBadge();

// ==========================================
// Message Listener
// ==========================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.action) {
      case 'snoozeTab': {
        const result = await snoozeTab(message.tabId);
        sendResponse(result);
        break;
      }
      case 'snoozeCurrentTab': {
        const tabId = sender.tab ? sender.tab.id : null;
        const result = tabId ? await snoozeTab(tabId) : await snoozeCurrentTab();
        sendResponse(result);
        break;
      }
      case 'snoozeAllOtherTabs': {
        const result = await snoozeAllOtherTabs();
        sendResponse(result);
        break;
      }
      case 'wakeTab': {
        const result = await wakeTab(message.tabId);
        sendResponse(result);
        break;
      }
      case 'wakeAllTabs': {
        const result = await wakeAllTabs();
        sendResponse(result);
        break;
      }
      case 'getActivityMap': {
        await restoreActivityMap();
        sendResponse({
          activityMap: Object.fromEntries(tabActivityMap)
        });
        break;
      }
      case 'updateBadge': {
        await updateBadge();
        sendResponse({ success: true });
        break;
      }
      default:
        sendResponse({ error: 'Unknown action' });
    }
  })();
  return true; // Keep message channel open for async response
});
