// shared/utils.js - Helper functions for tab filtering, domain matching, and memory formatting

/**
 * Format megabytes to readable string (e.g. 850 MB, 2.4 GB)
 */
export function formatBytes(megabytes) {
  if (!megabytes || megabytes <= 0) return '0 MB';
  if (megabytes >= 1024) {
    const gb = (megabytes / 1024).toFixed(1);
    return `${gb.endsWith('.0') ? parseInt(gb, 10) : gb} GB`;
  }
  return `${Math.round(megabytes)} MB`;
}

/**
 * Extract clean hostname from a URL
 */
export function getDomain(rawUrl) {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    return (url.hostname || '').replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Check if the URL is an internal, restricted, or system page that cannot/should not be discarded
 */
export function isSpecialUrl(rawUrl) {
  if (!rawUrl) return true;
  const lower = rawUrl.toLowerCase().trim();
  return (
    lower.startsWith('chrome://') ||
    lower.startsWith('chrome-extension://') ||
    lower.startsWith('edge://') ||
    lower.startsWith('brave://') ||
    lower.startsWith('opera://') ||
    lower.startsWith('vivaldi://') ||
    lower.startsWith('devtools://') ||
    lower.startsWith('view-source:') ||
    lower.startsWith('about:') ||
    lower === 'about:blank' ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:')
  );
}

/**
 * Check if a tab matches any whitelisted domain
 */
export function isDomainWhitelisted(rawUrl, whitelist = []) {
  if (!rawUrl || !Array.isArray(whitelist) || whitelist.length === 0) return false;
  const domain = getDomain(rawUrl).toLowerCase();
  if (!domain) return false;

  return whitelist.some((item) => {
    const pattern = item.toLowerCase().trim().replace(/^www\./, '');
    if (!pattern) return false;
    return domain === pattern || domain.endsWith('.' + pattern);
  });
}

/**
 * Determine if a tab is eligible for snoozing (discarding) based on user settings
 */
export function canTabBeSnoozed(tab, settings = {}, options = {}) {
  if (!tab || tab.id === undefined) return false;

  // Cannot discard already discarded tab
  if (tab.discarded) return false;

  // Check special internal URLs
  if (isSpecialUrl(tab.url || tab.pendingUrl)) return false;

  // Check active tab rule (unless explicitly allowed by option, e.g. snooze current tab)
  if (!options.allowActive && tab.active) return false;

  // Check audio/video playing
  if (settings.ignoreAudible && tab.audible) return false;

  // Check pinned tab
  if (settings.ignorePinned && tab.pinned) return false;

  // Check whitelisted domains
  if (isDomainWhitelisted(tab.url || tab.pendingUrl, settings.whitelistDomains)) {
    return false;
  }

  return true;
}

/**
 * Format relative time (e.g. "2m ago", "1h ago")
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp) return 'idle';
  const diffMs = Math.max(0, Date.now() - timestamp);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Simple HTML escape
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
