#!/usr/bin/env bash
# Zip each QwenPaw skill for "Upload via Zip" and check frontmatter names.
set -euo pipefail
cd "$(dirname "$0")/.."
out=dist/skills; mkdir -p "$out"
for dir in qwenpaw/skills/*/; do
  name=$(basename "$dir")
  fm=$(sed -n '2,3p' "$dir/SKILL.md" | grep '^name:' | sed 's/^name: *//')
  [ "$fm" = "$name" ] || { echo "ERROR: $dir/SKILL.md name '$fm' != folder '$name'"; exit 1; }
  (cd qwenpaw/skills && rm -f "../../$out/$name.zip" && zip -qr "../../$out/$name.zip" "$name" -x '*/__pycache__/*')
  echo "packed $out/$name.zip"
done
