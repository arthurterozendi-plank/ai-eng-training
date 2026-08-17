#!/usr/bin/env bash
#
# Fails when console.log or console.debug survives in shipped source.
#
# console.error and console.warn are deliberately allowed: they are the only channel a Server
# Component or route handler has for reporting a real failure. console.log is almost always a
# leftover, and on the server it goes straight into production logs.
#
# Test files are excluded — a console call there never ships.
#
# Usage: bash check-console.sh [repo-root]

set -uo pipefail

cd "${1:-.}" || exit 1

if [ ! -d src ]; then
  echo "FAIL: no src/ directory at $(pwd)"
  exit 1
fi

hits=$(
  grep -rnE '(^|[^.[:alnum:]_$])console\.(log|debug)[[:space:]]*\(' src \
    --include='*.ts' --include='*.tsx' |
    grep -vE '\.(test|spec)\.tsx?:' || true
)

if [ -z "$hits" ]; then
  echo "PASS: no console.log/console.debug in src/"
  exit 0
fi

count=$(printf '%s\n' "$hits" | wc -l | tr -d ' ')

echo "FAIL: ${count} console.log/console.debug call(s) in shipped source"
printf '%s\n' "$hits"
exit 1
