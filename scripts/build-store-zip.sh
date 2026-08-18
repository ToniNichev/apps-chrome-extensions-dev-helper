#!/usr/bin/env bash
# Packages only the files the MV3 manifest actually references into a
# Chrome Web Store-ready zip, leaving the legacy MV2 reference files
# (assets/, markups/, background.html) out of the upload.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

version="$(jq -r .version manifest.json)"
dist_dir="$repo_root/dist"
zip_path="$dist_dir/dev-helper-v${version}.zip"

mkdir -p "$dist_dir"
rm -f "$zip_path"

zip -r "$zip_path" \
  manifest.json \
  icons \
  app \
  -x '*.DS_Store' '*.md'

echo "Built $zip_path"
