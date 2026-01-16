#!/bin/bash
set -o pipefail

FILE_PATH=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Only check files biome supports
case "$FILE_PATH" in
  *.js|*.jsx|*.ts|*.tsx|*.json|*.jsonc|*.md)
    ;;
  *)
    exit 0
    ;;
esac

# Run biome check with bunx
if command -v biome &> /dev/null; then
  biome check --write "$FILE_PATH"
elif command -v bunx &> /dev/null; then
  bunx biome check --write "$FILE_PATH"
fi

exit 0
