#!/usr/bin/env bash
# Creates an access key for the project-only Bedrock IAM user (it can only
# invoke Claude Sonnet 4.6). Never prints the secret.
#
#   bash scripts/new-bedrock-key.sh               -> writes it to .dev.vars (local dev)
#   bash scripts/new-bedrock-key.sh --production  -> stores it as Cloudflare Worker secrets
set -euo pipefail
cd "$(dirname "$0")/.."

USER_NAME="fuck-the-club-up-bedrock"
MODE="${1:-local}"

if [ "$MODE" = "local" ] && grep -q '^BEDROCK_ACCESS_KEY_ID=' .dev.vars 2>/dev/null; then
  echo "A Bedrock key is already in .dev.vars. Remove those two lines first if you want a new one."
  exit 1
fi
if [ "$MODE" = "--production" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh" >/dev/null && nvm use 22 >/dev/null
fi

out="$(aws iam create-access-key --user-name "$USER_NAME" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)"
id="${out%%[[:space:]]*}"
secret="${out##*[[:space:]]}"

if [ "$MODE" = "--production" ]; then
  printf '%s' "$id" | npx wrangler secret put BEDROCK_ACCESS_KEY_ID >/dev/null
  printf '%s' "$secret" | npx wrangler secret put BEDROCK_SECRET_ACCESS_KEY >/dev/null
  echo "Stored a production key for $USER_NAME in Cloudflare (ends in ${id: -4})."
else
  {
    echo "BEDROCK_ACCESS_KEY_ID=$id"
    echo "BEDROCK_SECRET_ACCESS_KEY=$secret"
  } >> .dev.vars
  echo "Saved a key for $USER_NAME to .dev.vars (ends in ${id: -4})."
fi
