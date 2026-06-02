#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
[deploy-local] ERROR: legacy cloud deploy is disabled.

New Universe currently deploys only to the Windows Docker host from the
operator machine:

  scripts/deploy-hdc.sh --environment prod

Do not deploy Fly.io or Cloudflare Pages again until the live data path has
been explicitly migrated back from Windows Postgres to cloud services.
EOF

exit 1
