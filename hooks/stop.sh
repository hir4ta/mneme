#!/usr/bin/env bash
#
# stop.sh - Stop hook for mneme plugin (incremental save)
#
# Saves new interactions to SQLite on each assistant response completion.
# Uses Node.js for efficient streaming processing of large transcripts.
#
# Input (stdin): JSON with session_id, transcript_path, cwd
# Output (stdout): JSON with {"continue": true}
# Exit codes: 0 = success (non-blocking)
#
# Dependencies: Node.js

set -euo pipefail

# Read stdin
input_json=$(cat)

# Extract fields using bash string manipulation (faster than jq for simple cases)
session_id=$(echo "$input_json" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4 || echo "")
transcript_path=$(echo "$input_json" | grep -o '"transcript_path":"[^"]*"' | cut -d'"' -f4 || echo "")
cwd=$(echo "$input_json" | grep -o '"cwd":"[^"]*"' | cut -d'"' -f4 || echo "")

# If no session_id or transcript, just continue
if [ -z "$session_id" ] || [ -z "$transcript_path" ]; then
    echo '{"continue": true}'
    exit 0
fi

# If no cwd, use PWD
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi

# Check if .mneme directory exists (project initialized)
mneme_dir="${cwd}/.mneme"
if [ ! -d "$mneme_dir" ]; then
    echo '{"continue": true}'
    exit 0
fi

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

if [ -z "$incremental_save_script" ]; then
    echo '{"continue": true}'
    exit 0
fi

# Run incremental save (non-blocking, errors are logged but don't fail)
if [[ "$incremental_save_script" == *.ts ]]; then
    # Development mode
    result=$(npx tsx "$incremental_save_script" save \
        --session "$session_id" \
        --transcript "$transcript_path" \
        --project "$cwd" 2>&1) || true
else
    # Production mode
    result=$(node "$incremental_save_script" save \
        --session "$session_id" \
        --transcript "$transcript_path" \
        --project "$cwd" 2>&1) || true
fi

# Log result if successful save occurred
if echo "$result" | grep -q '"savedCount":[1-9]'; then
    echo "[mneme] Incremental save: ${result}" >&2
fi

echo '{"continue": true}'
