#!/usr/bin/env bash
#
# pre-compact.sh - Backup before Auto-Compact
#
# This is the LAST CHANCE to save information before Auto-Compact.
# Extracts thinking blocks and conversation from transcript and saves to session JSON.
#
# Input (stdin): JSON with session_id, transcript_path, cwd, trigger
# Output: JSON with continue (boolean)

set -euo pipefail

# Read stdin
input_json=$(cat)

# Extract fields
session_id=$(echo "$input_json" | jq -r '.session_id // empty')
transcript_path=$(echo "$input_json" | jq -r '.transcript_path // empty')
cwd=$(echo "$input_json" | jq -r '.cwd // empty')
trigger=$(echo "$input_json" | jq -r '.trigger // "auto"')

# If no cwd, use PWD
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi

# Find session file
if [ -z "$session_id" ]; then
    echo '{"continue": true}'
    exit 0
fi

session_short_id="${session_id:0:8}"
memoria_dir="${cwd}/.memoria"
sessions_dir="${memoria_dir}/sessions"

session_file=$(find "$sessions_dir" -name "${session_short_id}.json" -type f 2>/dev/null | head -1)

if [ -z "$session_file" ] || [ ! -f "$session_file" ]; then
    echo '{"continue": true}'
    exit 0
fi

# Check transcript exists
if [ -z "$transcript_path" ] || [ ! -f "$transcript_path" ]; then
    echo "[memoria] No transcript found at PreCompact" >&2
    echo '{"continue": true}'
    exit 0
fi

echo "[memoria] PreCompact: Extracting from transcript before Auto-Compact..." >&2

# Extract thinking blocks from transcript (these are lost after compact)
# Transcript is JSONL format
thinking_blocks=$(cat "$transcript_path" | jq -s '
  [.[] | select(.type == "assistant") | .message.content[]? | select(.type == "thinking") | .thinking]
  | map(select(. != null and . != ""))
  | if length > 10 then .[-10:] else . end
' 2>/dev/null || echo "[]")

# Extract recent user messages
user_messages=$(cat "$transcript_path" | jq -s '
  [.[] | select(.type == "user") |
    if (.message.content | type) == "string" then .message.content
    elif (.message.content | type) == "array" then
      [.message.content[] | select(.type == "text") | .text] | join("\n")
    else null end
  ] | map(select(. != null and . != "")) | if length > 5 then .[-5:] else . end
' 2>/dev/null || echo "[]")

# Extract tool usage
tools_used=$(cat "$transcript_path" | jq -s '
  [.[] | select(.type == "assistant") | .message.content[]? |
    select(.type == "tool_use") |
    {name: .name, target: (if .input.file_path then .input.file_path elif .input.command then (.input.command | split("\n")[0] | .[0:100]) else null end)}
  ] | if length > 20 then .[-20:] else . end
' 2>/dev/null || echo "[]")

# Create a compact backup entry
now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
backup_id="backup-$(date +%s)"

# Read current session and add backup
current_session=$(cat "$session_file")

# Add preCompactBackups array if not exists, then append new backup
updated_session=$(echo "$current_session" | jq \
    --arg id "$backup_id" \
    --arg timestamp "$now" \
    --arg trigger "$trigger" \
    --argjson thinking "$thinking_blocks" \
    --argjson userMessages "$user_messages" \
    --argjson toolsUsed "$tools_used" \
    '
    .preCompactBackups = (.preCompactBackups // []) + [{
        id: $id,
        timestamp: $timestamp,
        trigger: $trigger,
        thinkingExcerpts: $thinking,
        recentUserMessages: $userMessages,
        recentToolsUsed: $toolsUsed
    }] |
    # Keep only last 5 backups
    .preCompactBackups = (.preCompactBackups | if length > 5 then .[-5:] else . end) |
    .lastPreCompactAt = $timestamp
')

# Write updated session
echo "$updated_session" > "$session_file"

echo "[memoria] PreCompact: Saved ${#thinking_blocks} thinking excerpts, ${#user_messages} messages" >&2

# Allow compaction to proceed
echo '{"continue": true}'
