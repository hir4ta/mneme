#!/usr/bin/env bash
#
# session-end.sh - SessionEnd hook for memoria plugin
#
# Simplified: Just set status to "complete" and endedAt timestamp.
# Session content is already saved by stop.sh (auto-save on every response).
#
# Input (stdin): JSON with session_id, transcript_path, cwd
# Output: None (cannot block session end)

set -euo pipefail

# Read input from stdin
input_json=$(cat)

# Extract fields
session_id=$(echo "$input_json" | jq -r '.session_id // empty' 2>/dev/null || echo "")
cwd=$(echo "$input_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")

if [ -z "$session_id" ]; then
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
session_file=""

if [ -d "$sessions_dir" ]; then
    session_file=$(find "$sessions_dir" -type f -name "${session_short_id}.json" 2>/dev/null | head -1)
fi

if [ -z "$session_file" ] || [ ! -f "$session_file" ]; then
    exit 0
fi

# Set status to complete and endedAt timestamp
now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
jq --arg status "complete" --arg endedAt "$now" --arg updatedAt "$now" '
    .status = $status | .endedAt = $endedAt | .updatedAt = $updatedAt
' "$session_file" > "${session_file}.tmp" && mv "${session_file}.tmp" "$session_file"

echo "[memoria] Session completed: ${session_file}" >&2
exit 0
