#!/usr/bin/env bash
#
# Every deploy key declared in .env.example must resolve to a non-empty value.
#
# .env.example is the committed env contract; each workspace's src/env.ts is a runtime
# validator. A key present in one and missing from the other is a deploy waiting to fail, so
# this also reports keys any env.ts validates but .env.example never declares.
#
# A line reading exactly `# @local-only` splits .env.example in two. Keys above it are the deploy
# contract and must have values. Keys below it, to the end of the file, are read only by local
# developer tools — an MCP server's credentials — so they are still declared, and the drift
# check still counts them, but an empty one never fails the gate: a deploy environment must not
# need a developer's personal API key to pass.
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

# The key names declared on stdin, one per line.
keys_in() {
  sed -nE 's/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=.*/\1/p'
}

marker=$(grep -nE '^[[:space:]]*#[[:space:]]*@local-only[[:space:]]*$' .env.example | head -n 1 | cut -d: -f1)

if [ -n "$marker" ]; then
  deploy=$(sed -n "1,$((marker - 1))p" .env.example | keys_in)
  local_only=$(sed -n "$((marker + 1)),\$p" .env.example | keys_in)
else
  deploy=$(keys_in < .env.example)
  local_only=""
fi
declared=$(printf '%s\n%s\n' "$deploy" "$local_only")

status=0

if [ -z "$deploy" ]; then
  echo "PASS: .env.example declares no deploy keys"
else
  missing=""
  for key in $deploy; do
    [ -n "${!key:-}" ] && continue
    env_file_has_value .env.production.local "$key" && continue
    env_file_has_value .env.local "$key" && continue
    env_file_has_value .env "$key" && continue
    missing="$missing $key"
  done

  if [ -z "$missing" ]; then
    echo "PASS: every deploy key in .env.example resolves to a value"
  else
    echo "FAIL: unset or empty:$missing"
    echo "      declared in .env.example but not found in the environment, .env.production.local, .env.local, or .env"
    status=1
  fi
fi

if [ -n "$local_only" ]; then
  echo "NOTE: local-only, not required to deploy:" $local_only
fi

# Drift check: keys any workspace's env.ts validates that .env.example never mentions, in either
# section.
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
