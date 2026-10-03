# TabSnoozer Pro 🌙

A modern, high-performance Chromium extension (Manifest V3) designed to reclaim system RAM and optimize browser performance by automatically or manually snoozing idle tabs.

![TabSnoozer Pro Banner](icons/icon128.png)

## ✨ Key Features

1. **True RAM Savings via `chrome.tabs.discard()`**:
   - Instead of closing tabs or replacing them with cumbersome placeholders, TabSnoozer leverages Chromium's native memory discard API.
   - Reclaims **~150MB to 800MB+ of physical RAM per discarded tab**.
   - Tabs remain visible in your tab bar with their title and favicon intact.
   - Clicking any snoozed tab instantly restores and reloads it without losing your browsing context.

2. **Manual Snooze on Demand**:
   - **Hover Snooze in Live Dashboard**: Open the extension popup; hover over any tab in the live list to reveal an immediate **"Snooze Tab"** action button.
   - **In-Page Floating Hover Notch**: A subtle, glassmorphic notch at the top edge of web pages that glides down on hover for 1-click tab snoozing.
   - **Right-Click Context Menus**: Right-click anywhere on any page to select **"🌙 Snooze This Tab"** or **"💤 Snooze All Other Tabs"**.

3. **Snooze All Other Tabs**:
   - 1-click primary button in the popup to snooze every tab across all windows except your current active tab.
   - Reclaims gigabytes of RAM in a single click.

4. **Automated Inactivity Snoozing**:
   - Automatically monitors tab idle duration in the background.
   - Discards background tabs after a customizable threshold (e.g. 5m, 15m, 30m, 1h, 2h, or custom minutes).

5. **Keyboard Shortcuts**:
   - `Alt+Shift+S` (or `Cmd+Ctrl+Shift+S` on macOS): **Snooze all tabs except current active tab**.
   - `Alt+Shift+C`: **Snooze current active tab**.
   - Fully customizable at `chrome://extensions/shortcuts`.

6. **Smart Tab Safeguards**:
   - **Media Protection**: Automatically ignores tabs playing audio, music, or video calls (e.g., YouTube, Spotify, Google Meet).
   - **Pinned Tab Protection**: Keeps pinned tabs alive in memory.
   - **Domain Whitelist**: Add domains (e.g., `github.com`, `slack.com`) that should never be snoozed.

7. **Live Memory Metrics Dashboard**:
   - Real-time tracker displaying estimated RAM reclaimed, active tabs count, snoozed tabs count, and lifetime stats.

---

## 🚀 Installation Guide (Chrome, Brave, Edge, Opera)

1. Open your Chromium-based browser (Google Chrome, Brave, Microsoft Edge, Arc, etc.).
2. Navigate to the extensions page:
   - In Chrome: `chrome://extensions`
   - In Brave: `brave://extensions`
   - In Edge: `edge://extensions`
3. Enable **"Developer mode"** using the toggle in the top-right corner.
4. Click the **"Load unpacked"** button in the top-left toolbar.
5. Select the folder where this project is located:
   ```
   d:\Abid\Coding\Vibe Coding\chrome-tab-snoozer
   ```
6. The extension is now installed and active! Pin **TabSnoozer Pro** to your browser toolbar for instant 1-click access.

---

## ⌨️ Default Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt + Shift + S` | Snooze all tabs except current active tab |
| `Alt + Shift + C` | Snooze current active tab |

To customize these shortcuts:
1. Navigate to `chrome://extensions/shortcuts` in your browser.
2. Scroll to **TabSnoozer Pro**.
3. Click the pencil icon next to any command and enter your preferred key combination.

---

## 🛠️ Project Structure

```
chrome-tab-snoozer/
├── manifest.json              # Chrome Manifest V3 descriptor
├── PRIVACY_POLICY.md          # Store-compliant privacy policy
├── icons/                     # Extension icons (16px, 32px, 48px, 128px)
├── background/
│   └── service-worker.js      # Inactivity checker, alarm, context menus, shortcuts
├── popup/
│   ├── popup.html             # Sleek dark-mode popup dashboard
│   ├── popup.css              # Glassmorphic UI styles and micro-animations
│   └── popup.js               # Tab manager, search, filter, and action triggers
├── options/
│   ├── options.html           # Full settings and whitelist management page
│   ├── options.css            # Options page layout & styling
│   └── options.js             # Options logic, whitelist manager, and stats reset
├── content/
│   ├── content.js             # In-page floating hover tab snoozer
│   └── content.css            # Encapsulated styles for in-page hover trigger
└── shared/
    ├── storage.js             # Type-safe sync storage helpers & defaults
    └── utils.js               # Domain helpers, byte formatters, tab validation
```
