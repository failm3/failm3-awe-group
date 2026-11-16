#!/usr/bin/env bash
# AWE GROUP — Browser screenshot wrapper
# Sets LD_LIBRARY_PATH automatically and delegates to the .cjs helper.
#
# Usage:
#   scripts/awe-screenshot.sh <url> <output-path>
#
# Example:
#   scripts/awe-screenshot.sh \
#     "file:///home/nox/awe-group-cleanroom-20261112/data/browser-test-page.html" \
#     "/home/nox/awe-group-cleanroom-20261112/.awe-data/artifacts/MISSION_ID/screenshot.png"
#
# Prints JSON to stdout. Exit code 0 on success, 1 on failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPS_DIR="$PROJECT_ROOT/.chromium-deps/usr/lib/x86_64-linux-gnu"

if [ -d "$DEPS_DIR" ]; then
  export LD_LIBRARY_PATH="${LD_LIBRARY_PATH:+$LD_LIBRARY_PATH:}$DEPS_DIR"
fi

exec node "$SCRIPT_DIR/browser-screenshot.cjs" "$@"
