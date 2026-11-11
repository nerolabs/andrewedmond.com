#!/usr/bin/env bash
# Asks the Worker to send a Lab Note. Called by .github/workflows/send-note.yml.
# Authenticates with this job's GitHub OIDC token (worker/oidc.js), so there's no shared secret.
# Usage: send-note.sh <slug> <preview|everyone>
set -euo pipefail
slug="$1"; audience="$2"
body=$(jq -nc --arg slug "$slug" --arg audience "$audience" '{slug: $slug, audience: $audience}')

for round in $(seq 1 200); do
  token=$(curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
    "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=andrewedmond" | jq -r .value)
  out=$(curl -sS -w '\n%{http_code}' -X POST https://www.andrewedmond.com/api/send \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "$body")
  code=$(tail -n1 <<<"$out"); json=$(sed '$d' <<<"$out")
  echo "round $round: $code $json"
  [ "$code" = 200 ] || { echo "::error::The send stopped: $json"; exit 1; }
  [ "$(jq -r .remaining <<<"$json")" = 0 ] && break
done
echo "### Lab Note \`$slug\` → $audience: done" >> "$GITHUB_STEP_SUMMARY"
