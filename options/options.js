// options/options.js - Settings & Whitelist Management
import { getSettings, saveSettings } from '../shared/storage.js';
import { formatBytes, getDomain } from '../shared/utils.js';

let settings = {};

// DOM Elements
const lifetimeRam = document.getElementById('lifetime-ram');
const lifetimeTabs = document.getElementById('lifetime-tabs');
const btnResetStats = document.getElementById('btn-reset-stats');

const optAutoSnooze = document.getElementById('opt-auto-snooze');
const optSnoozeMinutes = document.getElementById('opt-snooze-minutes');
const rowInactivityTime = document.getElementById('row-inactivity-time');
const presetBtns = document.querySelectorAll('.preset-btn');

const optIgnoreAudible = document.getElementById('opt-ignore-audible');
const optIgnorePinned = document.getElementById('opt-ignore-pinned');
const optFloatingBadge = document.getElementById('opt-floating-badge');

const whitelistInput = document.getElementById('whitelist-input');
const btnAddWhitelist = document.getElementById('btn-add-whitelist');
const whitelistTagsContainer = document.getElementById('whitelist-tags');
const tagPresets = document.querySelectorAll('.tag-preset');

const btnConfigureShortcuts = document.getElementById('btn-configure-shortcuts');
const optRamEstimate = document.getElementById('opt-ram-estimate');
const labelRamEstimate = document.getElementById('label-ram-estimate');

const btnSaveTop = document.getElementById('btn-save-top');
const btnSaveBottom = document.getElementById('btn-save-bottom');
const saveStatus = document.getElementById('save-status');

// ==========================================
// Initialization
// ==========================================
async function init() {
  settings = await getSettings();
  populateUI();
  setupListeners();
}

function populateUI() {
  // Lifetime Stats
  lifetimeRam.textContent = formatBytes(settings.totalRamSavedMB || 0);
  lifetimeTabs.textContent = (settings.totalTabsSnoozed || 0).toLocaleString();

  // Inactivity Settings
  optAutoSnooze.checked = !!settings.autoSnoozeEnabled;
  optSnoozeMinutes.value = settings.autoSnoozeMinutes || 30;
  updateInactivityRowState();

  // Safeguards
  optIgnoreAudible.checked = !!settings.ignoreAudible;
  optIgnorePinned.checked = !!settings.ignorePinned;
  optFloatingBadge.checked = !!settings.showFloatingHoverBadge;

  // RAM estimate slider
  const ramMb = settings.mbPerTabEstimate || 280;
  optRamEstimate.value = ramMb;
  labelRamEstimate.textContent = `${ramMb} MB`;

  // Whitelist
  renderWhitelistTags();
}

function updateInactivityRowState() {
  if (rowInactivityTime) {
    rowInactivityTime.style.opacity = optAutoSnooze.checked ? '1' : '0.4';
    optSnoozeMinutes.disabled = !optAutoSnooze.checked;
  }
}

// ==========================================
// Whitelist Management
// ==========================================
function cleanDomain(input) {
  if (!input) return '';
  let str = input.trim().toLowerCase();
  str = str.replace(/^https?:\/\//, '');
  str = str.replace(/^www\./, '');
  str = str.split('/')[0];
  str = str.split(':')[0]; // remove port
  return str;
}

function renderWhitelistTags() {
  whitelistTagsContainer.innerHTML = '';
  const list = settings.whitelistDomains || [];

  if (list.length === 0) {
    whitelistTagsContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">No domains currently whitelisted.</span>';
    return;
  }

  list.forEach((domain) => {
    const tag = document.createElement('div');
    tag.className = 'tag-item';
    tag.innerHTML = `
      <span>${domain}</span>
      <button class="tag-remove-btn" title="Remove ${domain}">✕</button>
    `;

    tag.querySelector('.tag-remove-btn').addEventListener('click', () => {
      removeWhitelistDomain(domain);
    });

    whitelistTagsContainer.appendChild(tag);
  });
}

function addWhitelistDomain(domain) {
  const clean = cleanDomain(domain);
  if (!clean) return;

  if (!settings.whitelistDomains) {
    settings.whitelistDomains = [];
  }

  if (!settings.whitelistDomains.includes(clean)) {
    settings.whitelistDomains.push(clean);
    renderWhitelistTags();
    showAutoSaveFeedback();
  }
}

function removeWhitelistDomain(domain) {
  if (!settings.whitelistDomains) return;
  settings.whitelistDomains = settings.whitelistDomains.filter((d) => d !== domain);
  renderWhitelistTags();
  showAutoSaveFeedback();
}

// ==========================================
// Save Handler
// ==========================================
async function saveAllSettings() {
  const newSettings = {
    autoSnoozeEnabled: optAutoSnooze.checked,
    autoSnoozeMinutes: Math.max(1, parseInt(optSnoozeMinutes.value, 10) || 30),
    ignoreAudible: optIgnoreAudible.checked,
    ignorePinned: optIgnorePinned.checked,
    showFloatingHoverBadge: optFloatingBadge.checked,
    whitelistDomains: settings.whitelistDomains || [],
    mbPerTabEstimate: parseInt(optRamEstimate.value, 10) || 280
  };

  await saveSettings(newSettings);
  settings = { ...settings, ...newSettings };
  showAutoSaveFeedback();
}

function showAutoSaveFeedback() {
  saveStatus.classList.remove('hidden');
  setTimeout(() => {
    saveStatus.classList.add('hidden');
  }, 2200);
}

// ==========================================
// Event Listeners
// ==========================================
function setupListeners() {
  // Inactivity switch
  optAutoSnooze.addEventListener('change', () => {
    updateInactivityRowState();
  });

  // Preset minute buttons
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      optSnoozeMinutes.value = btn.dataset.val;
    });
  });

  // Whitelist Add
  btnAddWhitelist.addEventListener('click', () => {
    addWhitelistDomain(whitelistInput.value);
    whitelistInput.value = '';
  });

  whitelistInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addWhitelistDomain(whitelistInput.value);
      whitelistInput.value = '';
    }
  });

  // Whitelist preset buttons
  tagPresets.forEach((preset) => {
    preset.addEventListener('click', () => {
      addWhitelistDomain(preset.dataset.domain);
    });
  });

  // Shortcut configuration button
  btnConfigureShortcuts.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  // RAM estimate slider
  optRamEstimate.addEventListener('input', () => {
    labelRamEstimate.textContent = `${optRamEstimate.value} MB`;
  });

  // Reset Lifetime Stats
  btnResetStats.addEventListener('click', async () => {
    const confirmReset = window.confirm('Are you sure you want to reset your lifetime tab snoozing stats to 0?');
    if (confirmReset) {
      await saveSettings({ totalTabsSnoozed: 0, totalRamSavedMB: 0 });
      settings.totalTabsSnoozed = 0;
      settings.totalRamSavedMB = 0;
      lifetimeRam.textContent = '0 MB';
      lifetimeTabs.textContent = '0';
      showAutoSaveFeedback();
    }
  });

  // Save buttons
  btnSaveTop.addEventListener('click', saveAllSettings);
  btnSaveBottom.addEventListener('click', saveAllSettings);
}

document.addEventListener('DOMContentLoaded', init);
