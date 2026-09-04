# Chrome Web Store submission notes

Working notes for the Developer Dashboard fields. Not shipped in the extension package — reference only.

## Single purpose

> SwissDev.tools Dev Helper is a web development debugging toolkit: it lets developers profile network requests, and define rules to rewrite/redirect URLs, override headers, route traffic through a proxy, mock API responses, and inject CSS/JS into pages they are actively developing or testing against. It also includes a small relay, scoped only to swissdev.tools (the free browser-based dev-tool site from the same developer), that lets that site's own tools bypass CORS and mixed-content restrictions when the user is testing against their own local/dev servers.

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
> Used to apply the proxy server configuration the user defines in the Proxy Rules tab, so they can route their own traffic through a proxy of their choosing for testing.

**tabs**
> Used to identify the active tab and its URL so the extension can determine which of the user's rules apply to that page, and to deliver script/mock rule updates to the correct tab.

**host_permissions: `<all_urls>`**
> The extension's core purpose is letting the user apply their own rewrite/proxy/mock/script rules to any site they choose to debug against, rather than a fixed set of domains. Because the target site is user-selected and unpredictable ahead of time (any site a developer might be testing), broad host access is required for the rules to be able to run wherever the user points them.

**Remote code**
> No — Dev Helper does not execute or fetch any remote code. All JavaScript is bundled in the extension package (including the injected script/mock assets), and Chrome Web Store review covers 100% of the code that runs.

## Data disclosure (Privacy practices tab)

- Does the extension collect user data? **No.**
- All categories (personally identifiable info, health info, financial info, authentication info, personal communications, location, web history, user activity, website content) — mark **not collected**.
- Privacy policy URL: link to `PRIVACY.md` in the repo (GitHub renders it as a readable page, e.g. `https://github.com/ToniNichev/apps-chrome-extensions-dev-helper/blob/master/PRIVACY.md`) — that URL satisfies the dashboard's requirement without needing separate hosting.
- Certify: "I do not sell or transfer user data to third parties" and "I do not use or transfer user data for purposes unrelated to the item's single purpose" — both true here.

## Listing description drafts

**Short description** (132 char max):
> Profile, rewrite, proxy, and mock network requests on any site — plus a CORS-bypass relay for swissdev.tools.

**Detailed description** (draft — expand as needed):
> SwissDev.tools Dev Helper is a network debugging toolkit for developers. It lets you:
>
> - **Profile** requests in real time — timing waterfall, per-domain breakdown, and a live request table.
> - **Rewrite** URLs and override request/response headers, compiled into Chrome's declarativeNetRequest engine.
> - **Proxy** matching traffic through a server you configure.
> - **Mock** API responses locally by intercepting fetch() calls — no backend required to test error states, empty states, or unreleased API shapes.
> - **Inject** CSS or bundled JS assets into matching pages.
>
> Works standalone on any site you're developing against. It also pairs with [swissdev.tools](https://swissdev.tools) — a free collection of browser-based dev tools (JSON, JWT, HTTP client, and more) from the same developer — relaying that site's requests past CORS and mixed-content restrictions when you're testing against your own local or dev servers.
>
> All rules and captured data stay on your device — this extension doesn't collect, transmit, or sell any data. See the privacy policy for details.

## Assets still needed before submission

- [x] Screenshot, 1280×800, no alpha channel: `store-assets/screenshot-mock-rules.jpg`. Rendered headlessly from the real `popup.html`/`popup.css` (accurate UI), but with hand-written sample rule data rather than a live capture — swap for a real capture once you've clicked through the extension yourself, or add more (e.g. Profiling tab with live data) alongside it.
- [ ] Optional small promo tile (440×280) and marquee (1400×560) if you want better placement.
- [ ] A Chrome Web Store developer account ($5 one-time registration fee if not already registered) — requires payment details, so this has to be done by you directly.
- [ ] Fill out the Developer Dashboard fields using the text above — requires your Google account login, so this also has to be done by you directly.
- [ ] Decide the contact email shown on the listing (separate from the privacy policy contact).

## Packaging

Run `scripts/build-store-zip.sh` from the repo root — it zips only `manifest.json`, `icons/`, and `app/` (the files the MV3 manifest actually references) into `dist/swissdev-tools-dev-helper-v<version>.zip`, leaving the legacy MV2 reference files (`assets/`, `markups/`, `background.html`) out of the upload.
