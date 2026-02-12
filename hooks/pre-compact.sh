#!/usr/bin/env bash
#
# pre-compact.sh - PreCompact hook for mneme plugin
#
# Saves interactions before Auto-Compact using incremental save.
# This ensures no conversations are lost when context is compressed.
#
# Input (stdin): JSON with session_id, transcript_path, cwd, trigger
# Output: nothing (exit 0 = continue)
# Exit codes: 0 = success (non-blocking, always continues)
#
# Dependencies: Node.js, jq

set -euo pipefail

# Source shared helpers
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

# Read stdin
input_json=$(cat)

if ! command -v jq >/dev/null 2>&1; then
    echo "[mneme:pre-compact] jq not found, skipping" >&2
    exit 0
fi

session_id=$(echo "$input_json" | jq -r '.session_id // empty' 2>/dev/null || echo "")
transcript_path=$(echo "$input_json" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")

if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")

if [ -z "$session_id" ]; then
    exit 0
fi

if ! validate_mneme "$cwd"; then
    exit 0
fi

echo "[mneme:pre-compact] Saving interactions before Auto-Compact..." >&2

PLUGIN_ROOT="$(get_plugin_root)"

save_script=$(find_script "$PLUGIN_ROOT" "incremental-save")
if [ -z "$save_script" ] || [ -z "$transcript_path" ]; then
    echo "[mneme:pre-compact] Skipped (no script or transcript)" >&2
    exit 0
fi

if [ ! -f "$transcript_path" ]; then
    echo "[mneme:pre-compact] Transcript not found, skipping" >&2
    exit 0
fi

# Run incremental save
result=$(invoke_node "$save_script" save \
    --session "$session_id" \
    --transcript "$transcript_path" \
    --project "$cwd" 2>&1) || true

# Log result
if echo "$result" | grep -q '"success":true'; then
    saved_count=$(echo "$result" | grep -o '"savedCount":[0-9]*' | cut -d':' -f2 || echo "0")
    echo "[mneme:pre-compact] Saved ${saved_count} messages before Auto-Compact" >&2
else
    echo "[mneme:pre-compact] Save result: ${result}" >&2
fi

# Write pending-compact breadcrumb for session linking on next SessionStart
# The new session (post-compact) will read this to link back to the current mneme session
pending_compact_file="${cwd}/.mneme/.pending-compact.json"
printf '{"claudeSessionId":"%s","timestamp":"%s"}\n' \
    "$session_id" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$pending_compact_file"
echo "[mneme:pre-compact] Wrote pending-compact breadcrumb for session linking" >&2

exit 0
