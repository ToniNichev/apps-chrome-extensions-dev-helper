# Dev Helper

A Manifest V3 Chrome extension for profiling network requests and defining rewrite, proxy, mock, and script-injection rules while you develop. All configuration and captured data stay local to your device — see [`PRIVACY.md`](./PRIVACY.md).

## App layout

- `manifest.json`: MV3 entrypoints, including the two content scripts (isolated-world `injector.js` and a MAIN-world `mock-interceptor.js`).
- `app/background/service-worker.js`: runtime state, profiling capture, proxy enforcement, DNR rule sync, and popup/content-script messaging.
- `app/background/dnr.js`: compiles rewrite rules and header overrides into `declarativeNetRequest` dynamic rules.
- `app/popup/`: popup UI for profiling, rewrite rules, proxy rules, mock rules, and script rules.
- `app/shared/`: shared schema, storage, and validation helpers used by both the background and the popup.
- `app/content/injector.js`: applies active script/CSS rules on matching pages, and bridges mock rules into the page.
- `app/injected/mock-interceptor.js`: MAIN-world script that intercepts `fetch()` and returns mocked responses for matching rules.
- `app/injected/example.js`: example bundled JavaScript asset for MV3-safe script-rule injection.

## Feature status

- **Profiling**: request timing, a waterfall view, and a per-domain time-share chart.
- **Proxy rules**: applies `chrome.proxy.settings` based on the first matching active rule, and clears back to direct when no rule matches (no longer leaves a stale proxy applied after a rule is deactivated).
- **Rewrite rules & header overrides**: compiled into MV3 dynamic `declarativeNetRequest` rules.
- **Mock rules**: intercepts a page's own `fetch()` and `XMLHttpRequest` calls and returns a locally-defined response — no backend involved.
- **Script rules**: CSS URLs work directly; JavaScript must be bundled as an extension asset (MV3 does not allow injecting/evaling remote script).

## Packaging & Chrome Web Store submission

- `scripts/build-store-zip.sh` builds `dist/dev-helper-v<version>.zip`, containing only the files the manifest references (`manifest.json`, `icons/`, `app/`) — the legacy reference files below are intentionally left out.
- `STORE_LISTING.md` has the single-purpose statement, per-permission justifications, and data-disclosure answers for the Developer Dashboard.
- `PRIVACY.md` is the extension's privacy policy.

## Legacy reference (MV2)

`assets/`, `markups/`, and `background.html` are the original pre-MV3 extension files, kept only as behavioral reference for the rewrite above. They are not part of the MV3 manifest and are excluded from the Chrome Web Store package.

## Next steps

1. Add automated test coverage — the repo currently has none; the DNR compiler and validation logic in `app/shared/validation.js` are the highest-value places to start.
2. Add an options/debug surface for deeper troubleshooting.
