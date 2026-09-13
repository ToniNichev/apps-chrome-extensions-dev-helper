#!/usr/bin/env bash
# Builds the MANUAL-INSTALL zip served from swissdev.tools/extension/ (via
# assets/downloads/) — NOT the file to upload to the Chrome Web Store
# Developer Dashboard; that's build-cws-submission-zip.sh, which strips
# manifest.json's "key" field (the Store rejects any manifest that has one).
# This zip keeps that field: it's what pins every "Load unpacked" install
# to the same fixed extension id (mfdphgpfndgjojkpmmppglgkfmiilgbh), which
# swissdev.tools/assets/dev-helper-relay.js's hardcoded EXTENSION_ID relies
# on to work for every manual-install user, not just whoever built the zip.
#
# Packages only the files the MV3 manifest actually references, leaving the
# legacy MV2 reference files (assets/, markups/, background.html) out of it.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

version="$(jq -r .version manifest.json)"
dist_dir="$repo_root/dist"
zip_path="$dist_dir/swissdev-tools-dev-helper-v${version}.zip"

mkdir -p "$dist_dir"
rm -f "$zip_path"

zip -r "$zip_path" \
  manifest.json \
  icons \
  app \
  -x '*.DS_Store' '*.md'

echo "Built $zip_path"
