#!/usr/bin/env bash
# SessionEnd hook for memoria plugin
# Logs session completion. Claude Code is responsible for updating session JSON.

set -euo pipefail

# Read input from stdin
input_json=$(cat)

# Extract session_id from input
session_id=$(echo "$input_json" | jq -r '.session_id // empty' 2>/dev/null || echo "")
cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")

if [ -z "$session_id" ]; then
    echo "[memoria] No session_id provided" >&2
    exit 0
fi

# Use cwd from input or fallback to PWD
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi

# Resolve paths
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")
sessions_dir="${cwd}/.memoria/sessions"

# Find session file
session_short_id="${session_id:0:8}"

if [ -d "$sessions_dir" ]; then
    found_file=$(find "$sessions_dir" -type f -name "*_${session_short_id}.json" 2>/dev/null | head -1)

    if [ -n "$found_file" ] && [ -f "$found_file" ]; then
        echo "[memoria] Session ended: ${found_file}" >&2
    else
        echo "[memoria] Session file not found for: ${session_short_id}" >&2
    fi
fi

exit 0
