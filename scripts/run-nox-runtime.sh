#!/bin/sh
# Start only Nox with its dedicated credential file. OpenCode is not a parent.
set -eu
RUNTIME_ENV_FILE=${AWE_RUNTIME_ENV_FILE:-/home/nox/.config/awe-group/secrets/routercheap-nox.env}
case "$RUNTIME_ENV_FILE" in /*) ;; *) echo "AWE_RUNTIME_ENV_FILE must be absolute" >&2; exit 2;; esac
# Discard inherited provider credentials and ambient dotenv selection. The Nox
# bootstrap alone loads RUNTIME_ENV_FILE and overrides the dedicated key.
unset ROUTER_CHEAP_API_KEY OPENAI_API_KEY AWE_OFFLINE_TEST
exec env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u AWE_OFFLINE_TEST \
  AWE_RUNTIME_ENV_FILE="$RUNTIME_ENV_FILE" \
  node --import tsx src/index.ts "$@"
