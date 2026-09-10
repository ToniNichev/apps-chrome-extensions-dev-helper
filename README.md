# SwissDev.tools Dev Helper

A Manifest V3 Chrome extension for profiling network requests and defining rewrite, proxy, mock, CSS-injection, and watchdog-notification rules while you develop. All configuration and captured data stay local to your device — see [`PRIVACY.md`](./PRIVACY.md). Also includes a relay, scoped only to swissdev.tools, that lets that site's own browser-based tools bypass CORS and mixed-content restrictions.

## App layout

- `manifest.json`: MV3 entrypoints, including the two content scripts (isolated-world `injector.js` and a MAIN-world `mock-interceptor.js`).
- `app/background/service-worker.js`: runtime state, profiling capture, proxy enforcement, DNR rule sync, and popup/content-script messaging.
- `app/background/dnr.js`: compiles rewrite rules and header overrides into `declarativeNetRequest` dynamic rules.
- `app/popup/`: popup UI for profiling, rewrite rules, proxy rules, mock rules, CSS rules, and watchdog rules.
- `app/shared/`: shared schema, storage, and validation helpers used by both the background and the popup.
- `app/content/injector.js`: applies active CSS rules on matching pages, and bridges mock rules into the page.
- `app/injected/mock-interceptor.js`: MAIN-world script that intercepts `fetch()` and returns mocked responses for matching rules.

## Feature status

- **Profiling**: a per-domain cumulative request-time chart. (Trimmed from an earlier version that also had a stats grid, waterfall timeline, and per-request table — those were redundant with Chrome's own Network tab; see git history if they're ever worth reviving.)
- **Proxy rules**: every active rule is compiled into one PAC script (`FindProxyForURL`), applied once via `chrome.proxy.settings`. Chrome evaluates it per-connection, so only requests matching a rule's pattern actually go through that rule's proxy; everything else falls through to `DIRECT`. (Replaced an earlier design that called `chrome.proxy.settings.set()`/`.clear()` reactively from `onBeforeRequest` — that only ever flipped one global setting on/off based on whichever request fired most recently, so on any page with a realistic mix of matching and non-matching traffic, whether your target request actually got proxied came down to request-ordering luck. PAC evaluation is Chrome's own per-request mechanism, so there's no such race.)
- **Rewrite rules & header overrides**: compiled into MV3 dynamic `declarativeNetRequest` rules.
- **Mock rules**: intercepts a page's own `fetch()` and `XMLHttpRequest` calls and returns a locally-defined response — no backend involved.
- **CSS rules**: injects a stylesheet into matching pages via a `<link>` tag — an absolute URL or a bundled extension asset. (Used to also support bundled-JS injection under an "Asset Type" choice; dropped since MV3's remote-code restriction meant JS could only ever be a pre-bundled extension file, never a paste-a-URL rule like everything else here, and it saw barely any real use.)
- **Watchdog rules**: matches on URL regex + method + a status filter (`ANY`, an exact code, or a class like `4xx`) against every completed request, independent of whether Profiling is on. A match logs to a capped in-memory list, sets a toolbar badge count, and fires a desktop notification (throttled per-rule to once per 5s).

## Packaging & Chrome Web Store submission

- `scripts/build-store-zip.sh` builds `dist/swissdev-tools-dev-helper-v<version>.zip`, containing only the files the manifest references (`manifest.json`, `icons/`, `app/`) — the legacy reference files below are intentionally left out.
- `STORE_LISTING.md` has the single-purpose statement, per-permission justifications, and data-disclosure answers for the Developer Dashboard.
- `PRIVACY.md` is the extension's privacy policy.

## Legacy reference (MV2)

`assets/`, `markups/`, and `background.html` are the original pre-MV3 extension files, kept only as behavioral reference for the rewrite above. They are not part of the MV3 manifest and are excluded from the Chrome Web Store package.

## Next steps

1. Add automated test coverage — the repo currently has none; the DNR compiler and validation logic in `app/shared/validation.js` are the highest-value places to start.
2. Add an options/debug surface for deeper troubleshooting.
