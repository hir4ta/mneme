#!/usr/bin/env bash
#
# stop.sh - Stop hook for mneme plugin (incremental save)
#
# Saves new interactions to SQLite on each assistant response completion.
# Uses Node.js for efficient streaming processing of large transcripts.
#
# Input (stdin): JSON with session_id, transcript_path, cwd, stop_hook_active
# Output: nothing (exit 0 = continue)
# Exit codes: 0 = success (non-blocking)
#
# Dependencies: Node.js, jq

set -euo pipefail

# Source shared helpers
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

# Read stdin
input_json=$(cat)

# Guard against recursive stop hooks
if command -v jq >/dev/null 2>&1; then
    if [ "$(echo "$input_json" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ]; then
        exit 0
    fi
    session_id=$(echo "$input_json" | jq -r '.session_id // empty' 2>/dev/null || echo "")
    transcript_path=$(echo "$input_json" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
    cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")
else
    exit 0
fi

if [ -z "$session_id" ] || [ -z "$transcript_path" ]; then
    exit 0
fi

if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")

if [ ! -f "$transcript_path" ]; then
    exit 0
fi

if ! validate_mneme "$cwd"; then
    exit 0
fi

PLUGIN_ROOT="$(get_plugin_root)"

save_script=$(find_script "$PLUGIN_ROOT" "incremental-save")
if [ -z "$save_script" ]; then
    exit 0
fi

# Run incremental save (non-blocking, errors are logged but don't fail)
result=$(invoke_node "$save_script" save \
    --session "$session_id" \
    --transcript "$transcript_path" \
    --project "$cwd" 2>&1) || true

# Log result if successful save occurred
if echo "$result" | grep -q '"savedCount":[1-9]'; then
    echo "[mneme:stop] Incremental save: ${result}" >&2
fi

exit 0
