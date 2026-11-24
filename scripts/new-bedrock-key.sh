#!/usr/bin/env bash
# Creates an access key for the project-only Bedrock IAM user and writes it
# into .dev.vars (gitignored). Prints nothing secret.
#   bash scripts/new-bedrock-key.sh
set -euo pipefail
cd "$(dirname "$0")/.."

USER_NAME="fuck-the-club-up-bedrock"
if grep -q '^BEDROCK_ACCESS_KEY_ID=' .dev.vars 2>/dev/null; then
  echo "A Bedrock key is already in .dev.vars. Remove those two lines first if you want a new one."
  exit 1
fi

out="$(aws iam create-access-key --user-name "$USER_NAME" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)"
id="${out%%[[:space:]]*}"
secret="${out##*[[:space:]]}"
{
  echo "BEDROCK_ACCESS_KEY_ID=$id"
  echo "BEDROCK_SECRET_ACCESS_KEY=$secret"
} >> .dev.vars
echo "Saved a key for $USER_NAME to .dev.vars (ends in ${id: -4})."
