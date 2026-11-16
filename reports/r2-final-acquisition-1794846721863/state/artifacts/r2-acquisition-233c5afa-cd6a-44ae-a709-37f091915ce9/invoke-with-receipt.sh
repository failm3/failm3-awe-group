#!/bin/bash
# Invocation receipt generator for observation-digest-v1
# Runs the qualified procedure with exact args and captures a durable receipt.

set -euo pipefail

ATTEMPT_ID="${1:?attempt ID required}"
RUNTIME="${2:?runtime required}"
PROC="${3:?procedure path required}"
ARG1="${4:?arg1 required}"
ARG2="${5:?arg2 required}"

PROC_SHA=$(sha256sum "$PROC" | cut -d' ' -f1)
RUNTIME_BIN=$(which "$RUNTIME")
RUNTIME_SHA=$(sha256sum "$RUNTIME_BIN" | cut -d' ' -f1)
RUNTIME_VER=$("$RUNTIME" --version 2>&1 | head -1)

RECEIPT_FILE="$ARG2/invocation-receipt-${ATTEMPT_ID}.json"

# Build command hash from normalized argv array
ARGV_JSON=$(node -e "console.log(JSON.stringify(['$RUNTIME', '--', '$PROC', '$ARG1', '$ARG2']))")
CMD_SHA=$(echo -n "$ARGV_JSON" | sha256sum | cut -d' ' -f1)

INVOKED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Run the procedure
set +e
"$RUNTIME" -- "$PROC" "$ARG1" "$ARG2" > /tmp/invoke.$$.stdout 2> /tmp/invoke.$$.stderr
EXIT_CODE=$?
set -e

COMPLETED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STDOUT=$(cat /tmp/invoke.$$.stdout)
STDERR=$(cat /tmp/invoke.$$.stderr)

# Capture output hashes immediately
DIGEST_JSON_SHA=""
DIGEST_MD_SHA=""
if [ -f "$ARG2/digest.json" ]; then
    DIGEST_JSON_SHA=$(sha256sum "$ARG2/digest.json" | cut -d' ' -f1)
fi
if [ -f "$ARG2/digest.md" ]; then
    DIGEST_MD_SHA=$(sha256sum "$ARG2/digest.md" | cut -d' ' -f1)
fi

# Write receipt
cat > "$RECEIPT_FILE" <<RECEIPT
{
  "attempt_id": "$ATTEMPT_ID",
  "command_sha256": "$CMD_SHA",
  "command_argv": $ARGV_JSON,
  "invoked_at": "$INVOKED_AT",
  "completed_at": "$COMPLETED_AT",
  "exit_code": $EXIT_CODE,
  "runtime": {
    "type": "$RUNTIME",
    "binary": "$RUNTIME_BIN",
    "version": "$RUNTIME_VER",
    "sha256": "$RUNTIME_SHA"
  },
  "executable": {
    "path": "$PROC",
    "sha256": "$PROC_SHA"
  },
  "args": [
    "$ARG1",
    "$ARG2"
  ],
  "outputs": {
    "digest.json": {
      "path": "$ARG2/digest.json",
      "sha256": "$DIGEST_JSON_SHA"
    },
    "digest.md": {
      "path": "$ARG2/digest.md",
      "sha256": "$DIGEST_MD_SHA"
    }
  },
  "stdout": "$STDOUT",
  "stderr": "$STDERR"
}
RECEIPT

rm -f /tmp/invoke.$$.stdout /tmp/invoke.$$.stderr

echo "Receipt written to $RECEIPT_FILE"
echo "Exit code: $EXIT_CODE"
echo "digest.json sha256: $DIGEST_JSON_SHA"
echo "digest.md sha256: $DIGEST_MD_SHA"

exit $EXIT_CODE
