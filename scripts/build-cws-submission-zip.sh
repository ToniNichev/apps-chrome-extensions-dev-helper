#!/usr/bin/env bash
# Builds the zip to actually upload to the Chrome Web Store Developer
# Dashboard — NOT the same file as build-store-zip.sh's output.
#
# manifest.json's "key" field pins a fixed extension ID
# (mfdphgpfndgjojkpmmppglgkfmiilgbh) so every user who sideloads the
# build-store-zip.sh zip via "Load unpacked" gets the SAME id — that's
# what lets swissdev.tools/assets/dev-helper-relay.js target one hardcoded
# EXTENSION_ID and have it work for every manual-install user, not just
# whoever built the zip. The Chrome Web Store dashboard, however, rejects
# any upload whose manifest contains a "key" field outright ("key field is
# not allowed in manifest") — it assigns its own id at item creation. So
# this script copies manifest.json, strips just that field with jq, and
# zips the result separately — the checked-in manifest.json (and
# build-store-zip.sh's own zip) stay untouched, since dev-helper-relay.js
# still needs that fixed id for manual installs until the Store listing is
# live and EXTENSION_ID is switched over to the Store-assigned one.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

version="$(jq -r .version manifest.json)"
dist_dir="$repo_root/dist"
work_dir="$(mktemp -d)"
zip_path="$dist_dir/swissdev-tools-dev-helper-v${version}-cws-submission.zip"

trap 'rm -rf "$work_dir"' EXIT

jq 'del(.key)' manifest.json > "$work_dir/manifest.json"
cp -R icons "$work_dir/icons"
cp -R app "$work_dir/app"

mkdir -p "$dist_dir"
rm -f "$zip_path"

( cd "$work_dir" && zip -r "$zip_path" manifest.json icons app -x '*.DS_Store' '*.md' )

echo "Built $zip_path (key field stripped for Chrome Web Store upload)"
