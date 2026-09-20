// background/service-worker.js - Core background engine for TabSnoozer
import { getSettings, saveSettings, incrementSnoozeStats } from '../shared/storage.js';
import { canTabBeSnoozed, getDomain } from '../shared/utils.js';

const ALARM_NAME = 'tabsnoozer_inactivity_check';
let tabActivityMap = new Map();

// Helper to save activity map to session storage
async function persistActivityMap() {
  try {
    const serialized = Array.from(tabActivityMap.entries());
    await chrome.storage.session.set({ tabActivityMap: serialized });
  } catch (e) {
    // Session storage may fail in certain restricted contexts
  }
}

// Restore activity map on startup
async function restoreActivityMap() {
  try {
    const data = await chrome.storage.session.get('tabActivityMap');
    if (data && Array.isArray(data.tabActivityMap)) {
      tabActivityMap = new Map(data.tabActivityMap);
    }
  } catch (e) {
    tabActivityMap = new Map();
  }

  // Populate any currently open tabs not yet in the map
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  for (const tab of tabs) {
    if (!tabActivityMap.has(tab.id)) {
      tabActivityMap.set(tab.id, now);
    }
  }
  await persistActivityMap();
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

    // If tab is currently active, activate an adjacent tab first
    if (tab.active) {
      const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
      const otherTabs = windowTabs.filter((t) => t.id !== tabId);
      if (otherTabs.length > 0) {
        // Find next or previous tab
        const nextTab = otherTabs.find((t) => t.index > tab.index) || otherTabs[otherTabs.length - 1];
        if (nextTab) {
          await chrome.tabs.update(nextTab.id, { active: true });
        }
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
    if (!tab) return { success: false };

    if (tab.discarded) {
      await chrome.tabs.reload(tabId);
    }
    await chrome.tabs.update(tabId, { active: true });
    updateBadge();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Wake all discarded tabs
 */
export async function wakeAllTabs() {
  const allTabs = await chrome.tabs.query({ discarded: true });
  let wokenCount = 0;

  for (const tab of allTabs) {
    try {
      await chrome.tabs.reload(tab.id);
      wokenCount++;
    } catch (e) {
      // Ignore reload error
    }
  }

  updateBadge();
  return { success: true, wokenCount };
}

// ==========================================
// Inactivity Check Alarm
// ==========================================

async function checkInactivity() {
  const settings = await getSettings();
  if (!settings.autoSnoozeEnabled) return;

  const thresholdMs = Math.max(1, settings.autoSnoozeMinutes) * 60 * 1000;
  const now = Date.now();

  const allTabs = await chrome.tabs.query({});
  let autoSnoozedCount = 0;

  for (const tab of allTabs) {
    if (tab.active || tab.discarded) continue;
    if (!canTabBeSnoozed(tab, settings, { allowActive: false })) continue;

    const lastActive = tabActivityMap.get(tab.id) || 0;
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
    if (tab && tab.url) {
      const domain = getDomain(tab.url);
      if (domain) {
        const settings = await getSettings();
        if (!settings.whitelistDomains.includes(domain)) {
          settings.whitelistDomains.push(domain);
          await saveSettings({ whitelistDomains: settings.whitelistDomains });
        }
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
    const [activeTab] = await chrome.tabs.query({ active: true, windowId });
    if (activeTab) {
      markTabActive(activeTab.id);
    }
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
  setupContextMenus();
  await restoreActivityMap();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  updateBadge();
});

// Initial boot
restoreActivityMap();
chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
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
