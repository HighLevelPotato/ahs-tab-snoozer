# Privacy Policy for AHS Tab Snoozer Pro

**Effective Date:** October 3, 2026  
**Last Updated:** October 3, 2026

AHS Tab Snoozer Pro ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains our practices regarding user data and how information is handled.

---

## 1. Single Purpose & Core Functionality
AHS Tab Snoozer Pro is a browser memory management extension designed to snooze idle tabs, discard unneeded memory from background tabs using native Chromium APIs, and boost browser performance.

---

## 2. Information We Do NOT Collect
- **No Personal Information:** We do not collect names, email addresses, IP addresses, physical addresses, phone numbers, or passwords.
- **No Remote Tracking or Analytics:** We do not use Google Analytics, cookies, telemetry, tracking pixels, or remote tracking scripts.
- **No Data Transmission:** AHS Tab Snoozer Pro performs **zero** network requests. No data leaves your computer.
- **No Data Selling or Sharing:** We do not sell, rent, monetize, or trade any user data to third parties, data brokers, advertisers, or affiliates.

---

## 3. How Permissions Are Used Locally
AHS Tab Snoozer Pro operates 100% locally on your device. The permissions declared in `manifest.json` are utilized strictly for core local functionality:

- **`tabs`:** Used exclusively on your local device to read tab metadata (title, URL, and favicon) to display your open tabs in the popup dashboard, detect idle tabs, verify domain whitelist exceptions, and invoke `chrome.tabs.discard()` to free memory. Your browsing history and URLs are **never** logged, saved to external storage, or transmitted off your device.
- **`storage`:** Used via `chrome.storage.sync` to save your user settings (such as inactivity duration thresholds, domain whitelist entries, and audio safeguards) across your logged-in Chrome profile, and via `chrome.storage.session` for temporary memory of tab activity timestamps during an active browsing session.
- **`alarms`:** Used to run a periodic 1-minute background timer that prompts the extension to check if any tabs have been idle longer than your chosen inactivity threshold.
- **`contextMenus`:** Used to provide convenient right-click menu items (*"Snooze This Tab"*, *"Snooze All Other Tabs"*, *"Never Snooze This Domain"*).
- **In-Page Content Scripts (`http://*/*`, `https://*/*`):** Used solely to display the optional floating hover snooze notch at the top of web pages, allowing you to snooze tabs without opening the popup.

---

## 4. Third-Party Services
AHS Tab Snoozer Pro does not integrate with any third-party APIs, remote servers, or external advertising networks.

---

## 5. Security
All settings and preferences are stored using Chrome's secure, built-in extension storage APIs. Because no data is collected or transmitted over the internet, your browsing data remains private to your machine.

---

## 6. Changes to This Policy
If any future updates introduce new features requiring policy modifications, this document will be updated accordingly with a revised effective date.

---

## 7. Contact
If you have any questions or feedback regarding this Privacy Policy, please open an issue on the project's repository or contact the developer via the Chrome Web Store support tab.
