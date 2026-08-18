#!/usr/bin/env bash
#
# Every key declared in .env.example must resolve to a non-empty value.
#
# .env.example is the committed deploy-time contract; each workspace's src/env.ts is a runtime
# validator. A key present in one and missing from the other is a deploy waiting to fail, so
# this also reports keys any env.ts validates but .env.example never declares.
#
# Both files live at the repository root: one .env.example and one .env.local serve every
# workspace, because Next.js only reads .env files from its own project directory and the
# scripts are launched through `dotenv -e ../../.env.local`.
#
# Resolution order matches Next.js: process environment, then .env.production.local,
# .env.local, .env. Files are PARSED, never sourced — sourcing would execute whatever a
# malformed or hostile env file happens to contain.
#
# Usage: bash check-env.sh [repo-root]

set -uo pipefail

cd "${1:-.}" || exit 1

if [ ! -f .env.example ]; then
  echo "FAIL: .env.example not found — nothing declares the deploy-time env contract"
  exit 1
fi

# Prints nothing and returns 1 unless $2 has a non-empty value in the env file $1.
env_file_has_value() {
  local file="$1" key="$2" line value
  [ -f "$file" ] || return 1
  line=$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1)
  [ -n "$line" ] || return 1
  value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  [ -n "$value" ]
}

declared=$(sed -nE 's/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=.*/\1/p' .env.example)

status=0

if [ -z "$declared" ]; then
  echo "PASS: .env.example declares no keys"
else
  missing=""
  for key in $declared; do
    [ -n "${!key:-}" ] && continue
    env_file_has_value .env.production.local "$key" && continue
    env_file_has_value .env.local "$key" && continue
    env_file_has_value .env "$key" && continue
    missing="$missing $key"
  done

  if [ -z "$missing" ]; then
    echo "PASS: every .env.example key resolves to a value"
  else
    echo "FAIL: unset or empty:$missing"
    echo "      declared in .env.example but not found in the environment, .env.production.local, .env.local, or .env"
    status=1
  fi
fi

# Drift check: keys any workspace's env.ts validates that .env.example never mentions.
env_modules=()
for module in apps/*/src/env.ts packages/*/src/env.ts; do
  [ -f "$module" ] && env_modules+=("$module")
done

if [ ${#env_modules[@]} -gt 0 ]; then
  validated=$(
    sed -nE 's/^[[:space:]]*(NEXT_PUBLIC_[A-Z0-9_]+|[A-Z][A-Z0-9_]+):[[:space:]]*z\..*/\1/p' \
      "${env_modules[@]}" | sort -u
  )
  undeclared=""
  for key in $validated; do
    # NODE_ENV is supplied by the runtime, never by the deployer.
    [ "$key" = "NODE_ENV" ] && continue
    printf '%s\n' "$declared" | grep -qx "$key" || undeclared="$undeclared $key"
  done
  if [ -n "$undeclared" ]; then
    echo "WARN: validated by ${env_modules[*]} but absent from .env.example:$undeclared"
  fi
fi

exit "$status"
