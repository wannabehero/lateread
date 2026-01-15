#!/bin/bash
set -e

# Check if Litestream backup is configured
if [ -n "$LITESTREAM_REPLICA_BUCKET" ]; then
  echo "Litestream backup enabled"

  # Restore database from R2 if it doesn't exist locally
  if [ ! -f "$DATABASE_URL" ]; then
    echo "No local database found. Attempting restore from R2..."
    litestream restore -config /etc/litestream.yml -v -if-replica-exists "$DATABASE_URL"
  fi

  # Run app with Litestream replication (litestream as supervisor)
  exec litestream replicate -config /etc/litestream.yml -exec "bun src/main.ts"
else
  echo "Litestream backup not configured, running without replication"
  exec bun src/main.ts
fi
