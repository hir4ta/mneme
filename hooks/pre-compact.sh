#!/usr/bin/env bash
# PreCompact hook for memoria plugin
# Saves a partial session before context compaction

set -euo pipefail

# Check for jq
if ! command -v jq &> /dev/null; then
    echo '{"error": "jq is required for session saving. Install with: brew install jq"}' >&2
    exit 0
fi

# Read input from stdin
input_json=$(cat)

# Extract fields from input
transcript_path=$(echo "$input_json" | jq -r '.transcript_path // empty')
session_id=$(echo "$input_json" | jq -r '.session_id // empty')
trigger=$(echo "$input_json" | jq -r '.trigger // "manual"')
cwd=$(echo "$input_json" | jq -r '.cwd // empty')

# Validate required fields
if [ -z "$transcript_path" ] || [ -z "$session_id" ]; then
    exit 0
fi

# Use cwd from input or fallback to PWD
if [ -z "$cwd" ]; then
    cwd="${PWD}"
fi

# Resolve paths
cwd=$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")
memoria_dir="${cwd}/.memoria"
sessions_dir="${memoria_dir}/sessions"

# Create sessions directory if not exists
mkdir -p "$sessions_dir"

# Get current git branch
current_branch=""
if git -C "$cwd" rev-parse --git-dir &> /dev/null 2>&1; then
    current_branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
fi

# Current timestamp
now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
date_part=$(echo "$now" | cut -d'T' -f1)
session_short_id="${session_id:0:8}"
file_id="${date_part}_${session_short_id}"

# Check if transcript file exists
if [ ! -f "$transcript_path" ]; then
    exit 0
fi

# Parse transcript and extract messages
# JSONL format: each line is a JSON object with type "user" or "assistant"
messages=$(jq -s '
    [.[] | select((.type == "user" or .type == "assistant") and .message != null) |
    {
        type: .type,
        timestamp: (.timestamp // now | tostring),
        content: (
            if .message.content | type == "string" then
                .message.content
            elif .message.content | type == "array" then
                [.message.content[] | select(.type == "text") | .text] | join("")
            else
                ""
            end
        ),
        thinking: (
            if .message.content | type == "array" then
                [.message.content[] | select(.type == "thinking") | .thinking] | join("") | if . == "" then null else . end
            else
                null
            end
        )
    } | with_entries(select(.value != null and .value != ""))]
' "$transcript_path" 2>/dev/null || echo "[]")

# Check if we have messages
message_count=$(echo "$messages" | jq 'length')
if [ "$message_count" -eq 0 ]; then
    exit 0
fi

# Generate summary from first user message
summary=$(echo "$messages" | jq -r '
    [.[] | select(.type == "user")] |
    if length > 0 then
        .[0].content | if length > 100 then .[0:100] + "..." else . end
    else
        "Session in progress"
    end
')

# Build partial session JSON
session_json=$(jq -n \
    --arg id "$file_id" \
    --arg sessionId "$session_id" \
    --arg createdAt "$now" \
    --arg branch "$current_branch" \
    --arg projectDir "$cwd" \
    --arg summary "$summary" \
    --argjson messages "$messages" \
    --arg compactedAt "$now" \
    --arg compactTrigger "$trigger" \
    '{
        id: $id,
        sessionId: $sessionId,
        createdAt: $createdAt,
        status: "in_progress",
        context: {
            branch: (if $branch == "" then null else $branch end),
            projectDir: $projectDir
        } | with_entries(select(.value != null)),
        summary: $summary,
        messages: $messages,
        compactedAt: $compactedAt,
        compactTrigger: $compactTrigger
    }')

# Save session
session_path="${sessions_dir}/${file_id}.json"
echo "$session_json" > "$session_path"

# Log to stderr
echo "[memoria] Partial session saved to ${session_path}" >&2

exit 0
