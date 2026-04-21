# Dev Helper

This repo now contains a fresh Manifest V3 rebuild of Dev Helper, while keeping the original extension files as a behavioral reference.

## New MV3 app

- `manifest.json`: points to the new MV3 extension entrypoints.
- `app/background/service-worker.js`: runtime state, profiling capture, proxy enforcement, and popup messaging.
- `app/popup/`: popup UI for profiling, rewrite rules, proxy rules, and script rules.
- `app/shared/`: shared schema and storage helpers.
- `app/content/injector.js`: applies active script rules on matching pages.
- `app/injected/example.js`: example bundled JavaScript asset for MV3-safe injection.

## Legacy reference

The old extension files under `assets/`, `markups/`, and `background.html` are still present as reference material while the new app is being built out.

## Current status

- Profiling: working in the new MV3 app
- Proxy rules: working in the new MV3 app
- Rewrite rules and header overrides: compiled into MV3 dynamic `declarativeNetRequest` rules
- Script rules: CSS URLs work, JavaScript must be bundled as an extension asset

## Next steps

1. Add richer validation and test coverage for the DNR compiler.
2. Add richer matching and validation for script rules.
3. Add an options/debug surface for deeper troubleshooting.
