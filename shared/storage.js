// shared/storage.js - Type-safe Chrome storage wrapper and settings defaults

export const DEFAULT_SETTINGS = {
  // Automatic snooze settings
  autoSnoozeEnabled: true,
  autoSnoozeMinutes: 30, // 5, 15, 30, 60, 120, etc.

  // Protection flags
  ignoreAudible: true,    // Don't snooze tabs playing audio or video
  ignorePinned: true,     // Don't snooze pinned tabs

  // Whitelisted domains (never automatically or batch snoozed)
  whitelistDomains: [
    'meet.google.com',
    'zoom.us',
    'teams.microsoft.com',
    'music.youtube.com',
    'spotify.com',
    'soundcloud.com'
  ],

  // In-page floating hover badge
  showFloatingHoverBadge: true,

  // RAM estimation (in megabytes per discarded tab)
  mbPerTabEstimate: 280,

  // Lifetime statistics
  totalTabsSnoozed: 0,
  totalRamSavedMB: 0
};

/**
 * Retrieve all settings merged with defaults
 */
export async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      if (chrome.runtime.lastError) {
        console.warn('TabSnoozer: Storage get error:', chrome.runtime.lastError);
        resolve({ ...DEFAULT_SETTINGS });
      } else {
        resolve({ ...DEFAULT_SETTINGS, ...stored });
      }
    });
  });
}

/**
 * Update partial or complete settings in sync storage
 */
export async function saveSettings(partialSettings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(partialSettings, () => {
      if (chrome.runtime.lastError) {
        console.error('TabSnoozer: Storage set error:', chrome.runtime.lastError);
      }
      resolve(partialSettings);
    });
  });
}

/**
 * Increment snooze stats
 */
export async function incrementSnoozeStats(count = 1) {
  const settings = await getSettings();
  const mbPerTab = settings.mbPerTabEstimate || 280;
  const newCount = (settings.totalTabsSnoozed || 0) + count;
  const newSavedMB = (settings.totalRamSavedMB || 0) + (count * mbPerTab);

  await saveSettings({
    totalTabsSnoozed: newCount,
    totalRamSavedMB: newSavedMB
  });

  return { totalTabsSnoozed: newCount, totalRamSavedMB: newSavedMB };
}
