#!/usr/bin/env bash
#
# Fails when console.log or console.debug survives in shipped source.
#
# console.error and console.warn are deliberately allowed: they are the only channel a Server
# Component or route handler has for reporting a real failure. console.log is almost always a
# leftover, and on the server it goes straight into production logs.
#
# Test files are excluded — a console call there never ships. So is every workspace's
# scripts/ directory: those are operator tools that are supposed to print progress.
#
# Usage: bash check-console.sh [repo-root]

set -uo pipefail

cd "${1:-.}" || exit 1

# Every workspace's src/ — the shipped source of each app and package.
sources=()
for dir in apps/*/src packages/*/src; do
  [ -d "$dir" ] && sources+=("$dir")
done

if [ ${#sources[@]} -eq 0 ]; then
  echo "FAIL: no apps/*/src or packages/*/src directory at $(pwd)"
  exit 1
fi

hits=$(
  grep -rnE '(^|[^.[:alnum:]_$])console\.(log|debug)[[:space:]]*\(' "${sources[@]}" \
    --include='*.ts' --include='*.tsx' |
    grep -vE '\.(test|spec)\.tsx?:' || true
)

if [ -z "$hits" ]; then
  echo "PASS: no console.log/console.debug in ${sources[*]}"
  exit 0
fi

count=$(printf '%s\n' "$hits" | wc -l | tr -d ' ')

echo "FAIL: ${count} console.log/console.debug call(s) in shipped source"
printf '%s\n' "$hits"
exit 1
