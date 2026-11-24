#!/usr/bin/env bash
# Creates an access key for the project-only SES IAM user (it can only send
# email from party@fucktheclubup.com). Never prints the secret.
#
#   bash scripts/new-email-key.sh               -> writes it to .dev.vars (local dev)
#   bash scripts/new-email-key.sh --production  -> stores it as Cloudflare Worker secrets
set -euo pipefail
cd "$(dirname "$0")/.."

USER_NAME="fuck-the-club-up-email"
MODE="${1:-local}"

if [ "$MODE" = "local" ] && grep -q '^SES_ACCESS_KEY_ID=' .dev.vars 2>/dev/null; then
  echo "An SES key is already in .dev.vars. Remove those two lines first if you want a new one."
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
  printf '%s' "$id" | npx wrangler secret put SES_ACCESS_KEY_ID >/dev/null
  printf '%s' "$secret" | npx wrangler secret put SES_SECRET_ACCESS_KEY >/dev/null
  echo "Stored a production key for $USER_NAME in Cloudflare (ends in ${id: -4})."
else
  {
    echo "SES_ACCESS_KEY_ID=$id"
    echo "SES_SECRET_ACCESS_KEY=$secret"
  } >> .dev.vars
  echo "Saved a key for $USER_NAME to .dev.vars (ends in ${id: -4})."
fi
