#!/usr/bin/env bash
#
# pre-compact.sh - PreCompact hook for mneme plugin
#
# Saves interactions before Auto-Compact using incremental save.
# This ensures no conversations are lost when context is compressed.
#
# Input (stdin): JSON with session_id, transcript_path, cwd, trigger
# Output (stdout): JSON with {"continue": true}
# Exit codes: 0 = success (non-blocking, always continues)
#
# Dependencies: Node.js

set -euo pipefail

continue_json='{"continue": true}'

# Read stdin
input_json=$(cat)

if ! command -v jq >/dev/null 2>&1; then
    echo "[mneme] PreCompact: jq not found, skipping" >&2
    echo "$continue_json"
    exit 0
fi

# Extract fields via jq (avoid regex-based JSON parsing)
session_id=$(echo "$input_json" | jq -r '.session_id // empty' 2>/dev/null || echo "")
transcript_path=$(echo "$input_json" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")

# If no cwd, use PWD
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")

# If no session_id, just continue
if [ -z "$session_id" ]; then
    echo "$continue_json"
    exit 0
fi

# Check if .mneme directory exists
mneme_dir="${cwd}/.mneme"
if [ ! -d "$mneme_dir" ]; then
    echo "$continue_json"
    exit 0
fi

echo "[mneme] PreCompact: Saving interactions before Auto-Compact..." >&2

# Get plugin root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Find the incremental-save script
incremental_save_script=""
if [ -f "${PLUGIN_ROOT}/dist/lib/incremental-save.js" ]; then
    incremental_save_script="${PLUGIN_ROOT}/dist/lib/incremental-save.js"
elif [ -f "${PLUGIN_ROOT}/lib/incremental-save.ts" ]; then
    # Development mode - use tsx
    incremental_save_script="${PLUGIN_ROOT}/lib/incremental-save.ts"
fi

if [ -z "$incremental_save_script" ] || [ -z "$transcript_path" ]; then
    echo "[mneme] PreCompact: Skipped (no script or transcript)" >&2
    echo "$continue_json"
    exit 0
fi

if [ ! -f "$transcript_path" ]; then
    echo "[mneme] PreCompact: Transcript not found, skipping" >&2
    echo "$continue_json"
    exit 0
fi

# Run incremental save
if [[ "$incremental_save_script" == *.ts ]]; then
    result=$(npx tsx "$incremental_save_script" save \
        --session "$session_id" \
        --transcript "$transcript_path" \
        --project "$cwd" 2>&1) || true
else
    result=$(node "$incremental_save_script" save \
        --session "$session_id" \
        --transcript "$transcript_path" \
        --project "$cwd" 2>&1) || true
fi

# Log result
if echo "$result" | grep -q '"success":true'; then
    saved_count=$(echo "$result" | grep -o '"savedCount":[0-9]*' | cut -d':' -f2 || echo "0")
    echo "[mneme] PreCompact: Saved ${saved_count} messages before Auto-Compact" >&2
else
    echo "[mneme] PreCompact: Save result: ${result}" >&2
fi

# Continue with compaction (non-blocking)
echo "$continue_json"
