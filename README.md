# SwissDev.tools Dev Helper

A Manifest V3 Chrome extension for profiling network requests and defining rewrite, proxy, mock, script-injection, and watchdog-notification rules while you develop. All configuration and captured data stay local to your device — see [`PRIVACY.md`](./PRIVACY.md). Also includes a relay, scoped only to swissdev.tools, that lets that site's own browser-based tools bypass CORS and mixed-content restrictions.

## App layout

- `manifest.json`: MV3 entrypoints, including the two content scripts (isolated-world `injector.js` and a MAIN-world `mock-interceptor.js`).
- `app/background/service-worker.js`: runtime state, profiling capture, proxy enforcement, DNR rule sync, and popup/content-script messaging.
- `app/background/dnr.js`: compiles rewrite rules and header overrides into `declarativeNetRequest` dynamic rules.
- `app/popup/`: popup UI for profiling, rewrite rules, proxy rules, mock rules, script rules, and watchdog rules.
- `app/shared/`: shared schema, storage, and validation helpers used by both the background and the popup.
- `app/content/injector.js`: applies active script/CSS rules on matching pages, and bridges mock rules into the page.
- `app/injected/mock-interceptor.js`: MAIN-world script that intercepts `fetch()` and returns mocked responses for matching rules.
- `app/injected/example.js`: example bundled JavaScript asset for MV3-safe script-rule injection.

## Feature status

- **Profiling**: a per-domain cumulative request-time chart. (Trimmed from an earlier version that also had a stats grid, waterfall timeline, and per-request table — those were redundant with Chrome's own Network tab; see git history if they're ever worth reviving.)
- **Proxy rules**: applies `chrome.proxy.settings` based on the first matching active rule, and clears back to direct when no rule matches (no longer leaves a stale proxy applied after a rule is deactivated).
- **Rewrite rules & header overrides**: compiled into MV3 dynamic `declarativeNetRequest` rules.
- **Mock rules**: intercepts a page's own `fetch()` and `XMLHttpRequest` calls and returns a locally-defined response — no backend involved.
- **Script rules**: CSS URLs work directly; JavaScript must be bundled as an extension asset (MV3 does not allow injecting/evaling remote script).
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
