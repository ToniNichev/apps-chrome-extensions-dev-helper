# Chrome Web Store submission notes

Working notes for the Developer Dashboard fields. Not shipped in the extension package — reference only.

## Single purpose

> SwissDev.tools Dev Helper is a web development debugging toolkit: it lets developers see which domains are consuming request time, define rules to rewrite/redirect URLs, override headers, route traffic through a proxy, mock API responses, inject CSS, and get notified the moment a matching request completes (a watchdog rule) — all for pages they are actively developing or testing against. It also includes a small relay, scoped only to swissdev.tools (the free browser-based dev-tool site from the same developer), that lets that site's own tools bypass CORS and mixed-content restrictions when the user is testing against their own local/dev servers.

Everything in the extension serves that one purpose (inspecting and locally modifying network behavior for development/debugging). If a reviewer pushes back on "single purpose" because of the number of features, the fallback framing is: all four rule types, profiling, and the swissdev.tools relay are different facets of the same activity — controlling and observing network requests during development — not unrelated features bolted together. If a reviewer questions the swissdev.tools branding on an otherwise general-purpose extension: the extension is built by the same developer as swissdev.tools and works standalone on any site without it — the name and relay are a deliberate cross-promotion between two tools from the same author, not a restriction of scope.

## Permission justifications

Paste one of these into the corresponding field in the dashboard's Permissions tab.

**storage**
> Used to save the user's rewrite/proxy/mock/script rules and settings locally via `chrome.storage.local`, so their configuration persists across browser sessions. Nothing is synced or transmitted off-device.

**webRequest**
> Used read-only to capture request timing, method, type, and status for the extension's network profiling feature. The extension does not use webRequest to block, redirect, or modify requests — that's handled separately via declarativeNetRequest.

**declarativeNetRequest**
> Used to apply the URL-rewrite and header-override rules the user defines, via Chrome's built-in declarative rule engine, so live traffic can be redirected or have headers modified for testing.

**proxy**
> Used to apply a PAC script compiled from the user's Proxy Rules, so requests matching a rule's URL pattern are routed through the proxy server they configured for that rule, while everything else continues direct.

**tabs**
> Used to identify the active tab and its URL so the extension can determine which of the user's rules apply to that page, and to deliver script/mock rule updates to the correct tab.

**notifications**
> Used to show a desktop notification when a user-defined Watchdog rule matches a completed request (e.g. an error status code, or a specific endpoint), so they don't have to keep the Network tab open and watch it themselves.

**host_permissions: `<all_urls>`**
> The extension's core purpose is letting the user apply their own rewrite/proxy/mock/script rules to any site they choose to debug against, rather than a fixed set of domains. Because the target site is user-selected and unpredictable ahead of time (any site a developer might be testing), broad host access is required for the rules to be able to run wherever the user points them.

**Remote code**
> No — Dev Helper does not execute or fetch any remote code. All JavaScript is bundled in the extension package (including the mock-interception asset), and Chrome Web Store review covers 100% of the code that runs. (An earlier version let a rule inject a bundled JS asset onto a page; that was dropped for being high-friction and rarely used, so this is now even more straightforwardly true.)

## Data disclosure (Privacy practices tab)

- Does the extension collect user data? **No.**
- All categories (personally identifiable info, health info, financial info, authentication info, personal communications, location, web history, user activity, website content) — mark **not collected**.
- Privacy policy URL: `https://swissdev.tools/privacy/` — a real page on the extension's own associated site, styled to match it. `PRIVACY.md` in this repo keeps a copy for developers browsing the source and now points back at that page as canonical.
- Certify: "I do not sell or transfer user data to third parties" and "I do not use or transfer user data for purposes unrelated to the item's single purpose" — both true here.

## Listing description drafts

**Short description** (132 char max — the original draft here was 146 and would have failed the same way the manifest description did; verify length before pasting anything into a Dashboard field with a hard cap):
> Rewrite, proxy, and mock requests, watch for matches, and profile per-domain time — plus a CORS-bypass relay for swissdev.tools.

**Detailed description** (draft — expand as needed):
> SwissDev.tools Dev Helper is a network debugging toolkit for developers. It lets you:
>
> - **Rewrite** URLs and override request/response headers, compiled into Chrome's declarativeNetRequest engine.
> - **Proxy** matching traffic through a server you configure.
> - **Mock** API responses locally by intercepting fetch() calls — no backend required to test error states, empty states, or unreleased API shapes.
> - **Inject** a CSS stylesheet into matching pages — an absolute URL or a bundled extension asset.
> - **Watch** for a matching request completing — a webhook landing, an intermittent error — and get a desktop notification the moment it happens, without babysitting the Network tab.
> - **Profile** which domains are consuming the most cumulative request time.
>
> Works standalone on any site you're developing against. It also pairs with [swissdev.tools](https://swissdev.tools) — a free collection of browser-based dev tools (JSON, JWT, HTTP client, and more) from the same developer — relaying that site's requests past CORS and mixed-content restrictions when you're testing against your own local or dev servers.
>
> All rules and captured data stay on your device — this extension doesn't collect, transmit, or sell any data. See the privacy policy for details.

## Assets still needed before submission

- [x] Screenshot, 1280×800, 24-bit PNG (no alpha): `store-assets/screenshot-mock-rules.png`. Rendered from the real, currently-shipping `popup.html`/`popup.css`/`popup.js` (a `chrome.*` shim feeds it sample Mock Rules data — see the render pipeline for how) — replaces an earlier version made before several restyle commits, which had drifted out of sync with the actual UI. Still not a live capture, so swap for one once you've clicked through the extension yourself, or add more (e.g. Profiling tab with live data) alongside it.
- [ ] Optional small promo tile (440×280) and marquee (1400×560) if you want better placement.
- [ ] A Chrome Web Store developer account ($5 one-time registration fee if not already registered) — requires payment details, so this has to be done by you directly.
- [ ] Fill out the Developer Dashboard fields using the text above — requires your Google account login, so this also has to be done by you directly.
- [ ] Decide the contact email shown on the listing (separate from the privacy policy contact).

## Packaging

Two different zips, for two different destinations — do not swap them:

- `scripts/build-store-zip.sh` builds `dist/swissdev-tools-dev-helper-v<version>.zip`, the **manual-install** file linked from swissdev.tools/extension/. Its manifest keeps the `key` field, which is what pins every "Load unpacked" install to the same fixed extension id (`mfdphgpfndgjojkpmmppglgkfmiilgbh`) — `assets/dev-helper-relay.js` on swissdev.tools hardcodes that id, and needs every manual-install user to land on it, not just whoever built the zip.
- `scripts/build-cws-submission-zip.sh` builds `dist/swissdev-tools-dev-helper-v<version>-cws-submission.zip` — **this is the one to upload to the Chrome Web Store Developer Dashboard.** The Store rejects any manifest containing a `key` field outright ("key field is not allowed in manifest"), so this script copies `manifest.json`, strips just that field with `jq`, and zips the result; everything else is identical to the manual-install zip.

Once the Store listing is live, `dev-helper-relay.js`'s `EXTENSION_ID` should move to whatever id the Store assigns at publish, and the manual-install flow (and the `key` field itself) can retire.
