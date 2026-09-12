# Privacy Policy — SwissDev.tools Dev Helper

_Last updated: 2026-09-12_

SwissDev.tools Dev Helper is a developer tool for profiling network requests, and configuring proxy, rewrite, mock, and script-injection rules while you browse. This policy explains what the extension does and does not do with your data.

## What SwissDev.tools Dev Helper does not do

- It does not collect, transmit, sell, or share any browsing data, personal information, or extension configuration with the developer or any third party.
- It does not use analytics, telemetry, crash reporting, or any remote server operated by the developer.
- It does not run or fetch any remote code. All JavaScript executed by the extension is bundled inside the extension package and reviewed as part of the Chrome Web Store submission.

## What SwissDev.tools Dev Helper stores, and where

All configuration you create (rewrite rules, proxy rules, mock rules, script rules) and all data captured while profiling is stored using `chrome.storage.local`, which keeps it **only on your own device**, tied to your Chrome profile. Nothing in that storage is synced to Google, uploaded to a server, or accessible to the developer.

Profiling data (request URLs, methods, status codes, and timings) is held in memory in the extension's background service worker only for the current browser session, and is cleared when you clear the profile, disable profiling, or close the browser. It is never written to a file or sent anywhere.

## How each permission is used

| Permission | What it's for |
|---|---|
| `storage` | Save your rules and settings locally via `chrome.storage.local`, as described above. |
| `webRequest` | Read request metadata (URL, method, timing, status) to power the Profiling tab. Used read-only; SwissDev.tools Dev Helper does not use `webRequest` to block or modify traffic. |
| `declarativeNetRequest` | Apply the URL-rewrite and header-override rules you define, using Chrome's built-in rule engine (no request bodies are read or altered by the extension itself). |
| `proxy` | Apply the proxy configuration you define in the Proxy Rules tab. |
| `tabs` | Identify which tab a rule applies to, and deliver script/mock rules to the right page. |
| `notifications` | Show a desktop notification when a Watchdog rule you defined matches a completed request, so you don't have to keep the Network tab open. |
| `host_permissions: <all_urls>` | SwissDev.tools Dev Helper's whole purpose is letting you apply rules to any site you choose to debug — this permission lets your rules run on whichever site you point them at, rather than a fixed list. |

## Proxy rules and third-party servers

If you configure a proxy rule, SwissDev.tools Dev Helper routes matching traffic through the proxy server **you specify**. That server is chosen and controlled by you, not the developer — SwissDev.tools Dev Helper does not operate, route through, or have visibility into any proxy server of its own.

## The swissdev.tools relay

swissdev.tools (`https://swissdev.tools/*`, and no other site) can ask the extension to make a network request on its behalf, and to be told which theme it's currently displaying so the extension's own popup can match it. This exists so swissdev.tools's own browser-based tools can reach `localhost` and other CORS-restricted servers you're developing against — the request is made directly from the extension to the URL swissdev.tools provides, with no third-party server in between, and the response is returned straight back to the page. Nothing about this exchange is logged, stored, or sent anywhere else.

## Mock rules

Mock rules intercept `fetch()` calls made by pages you visit and return a response you define, entirely inside your browser. No network request is made for a matched call, and the mock rule data never leaves your device.

## Changes to this policy

If this policy changes, the "Last updated" date above will change accordingly. Material changes will also be reflected in the extension's Chrome Web Store listing notes.

## Contact

Questions about this policy can be sent to the developer via the contact details listed on the Chrome Web Store listing.
