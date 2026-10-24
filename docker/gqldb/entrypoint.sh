#!/bin/bash
# Starts GQLDB with RBAC. The admin password comes from the environment (.env, mode 600),
# never from the compose file. No password, no start.
set -euo pipefail
: "${ULTIPA_ADMIN_PASS:?ULTIPA_ADMIN_PASS is not set (.env)}"
exec /usr/local/bin/ultipa-gqldb \
  -db "${ULTIPA_DB_PATH:-/data/adh.gdb}" \
  -rbac -admin-pass "${ULTIPA_ADMIN_PASS}" \
  -port "${ULTIPA_PORT:-9000}" "$@"
